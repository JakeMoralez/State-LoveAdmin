"""Granted case inventory and idempotent, transactional prize fulfillment."""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from tortoise.exceptions import IntegrityError
from tortoise.expressions import F
from tortoise.transactions import in_transaction

from app.config import DEFAULT_SERVER_ID
from app.domain.access_levels import role_title
from app.models.bot import UserServerAccess
from app.models.panel import LootCase, LootCaseGrant, LootCaseReward, PanelAuditLog
from app.services.cases import get_case_or_404, serialize_case, pick_snapshot_prize, RARITY_DROP_WEIGHT
from app.services.display_names import resolve_display_names


def manager(user):
    return int(user.get("access_level") or 0) >= 5


def require_manager(user):
    if not manager(user):
        raise HTTPException(403, "Выдавать кейсы и подтверждать призы можно с уровня 5")


def stamp(value):
    return value.isoformat() if value else None


async def get_grant(grant_id, user, *, own=False):
    grant = await LootCaseGrant.get_or_none(id=grant_id, server_id=DEFAULT_SERVER_ID)
    if not grant or (grant.recipient_vk_id != user["vk_id"] and (own or not manager(user))):
        raise HTTPException(404, "Экземпляр кейса не найден")
    return grant


async def serialize_grant(grant, user, names=None):
    reward = await LootCaseReward.get_or_none(grant_id=grant.id)
    names = names or {}
    return {"id": grant.id, "case_id": grant.case_id, "recipient_vk_id": grant.recipient_vk_id,
            "recipient_name": names.get(grant.recipient_vk_id, grant.recipient_name),
            "granted_by_vk_id": grant.granted_by_vk_id, "granted_by_name": names.get(grant.granted_by_vk_id, f"id{grant.granted_by_vk_id}"),
            "snapshot": grant.snapshot, "status": grant.status, "created_at": stamp(grant.created_at),
            "opened_at": stamp(grant.opened_at), "revoked_at": stamp(grant.revoked_at),
            "can_open": grant.status == "available" and grant.recipient_vk_id == user["vk_id"],
            "can_revoke": manager(user) and grant.status == "available",
            "reward": await serialize_reward(reward, user, grant, names) if reward else None}


async def list_grants(user, all_grants=False, limit=30, offset=0, status=None):
    if all_grants:
        require_manager(user)
    query = LootCaseGrant.filter(server_id=DEFAULT_SERVER_ID)
    if not all_grants:
        query = query.filter(recipient_vk_id=user["vk_id"])
    if status == "available":
        query = query.filter(status="available")
    elif status == "history":
        query = query.exclude(status="available")
    total = await query.count()
    rows = await query.order_by("-created_at", "-id").offset(offset).limit(limit)
    names = await resolve_display_names({id for row in rows for id in [row.recipient_vk_id, row.granted_by_vk_id]})
    return {"items": [await serialize_grant(row, user, names) for row in rows], "total": total,
            "can_grant": manager(user), "available_count": await LootCaseGrant.filter(
                server_id=DEFAULT_SERVER_ID, recipient_vk_id=user["vk_id"], status="available").count()}


async def grant_case(user, case_id, recipient_vk_id, request_key):
    require_manager(user)
    existing = await LootCaseGrant.get_or_none(request_key=request_key)
    if existing:
        if (existing.granted_by_vk_id, existing.case_id, existing.recipient_vk_id) != (user["vk_id"], case_id, recipient_vk_id):
            raise HTTPException(409, "Этот запрос уже использован для другой выдачи")
        return await serialize_grant(existing, user)
    recipient = await UserServerAccess.get_or_none(user_id=recipient_vk_id, server_id=DEFAULT_SERVER_ID)
    if not recipient or recipient.access_level < 1:
        raise HTTPException(400, "Получатель должен состоять в реестре следящих и иметь доступ к порталу")
    case = await get_case_or_404(case_id)
    if not case.is_active:
        raise HTTPException(400, "Кейс выключен")
    snapshot = await serialize_case(case, include_prizes=True)
    snapshot["rarity_drop_weights"] = dict(RARITY_DROP_WEIGHT)
    snapshot["selection_version"] = 1
    if len(snapshot["prizes"]) < 2 or any(p["weight"] < 1 for p in snapshot["prizes"]):
        raise HTTPException(400, "Для выдачи нужно минимум два корректно настроенных приза")
    # A later deletion or edit of the original case cannot alter this copy.
    names = await resolve_display_names({recipient_vk_id})
    try:
        grant = await LootCaseGrant.create(server_id=DEFAULT_SERVER_ID, case_id=case_id,
            recipient_vk_id=recipient_vk_id, recipient_name=names.get(recipient_vk_id, f"id{recipient_vk_id}"),
            granted_by_vk_id=user["vk_id"], request_key=request_key, snapshot=snapshot)
    except IntegrityError:
        if not await LootCaseGrant.filter(request_key=request_key).exists():
            raise
        return await grant_case(user, case_id, recipient_vk_id, request_key)
    return await serialize_grant(grant, user, names)


async def revoke_grant(grant_id, user):
    require_manager(user)
    grant = await get_grant(grant_id, user)
    if grant.status == "revoked":
        return await serialize_grant(grant, user)
    changed = await LootCaseGrant.filter(id=grant.id, status="available").update(
        status="revoked", revoked_at=datetime.now(timezone.utc), revoked_by_vk_id=user["vk_id"])
    if not changed:
        raise HTTPException(409, "Открытый кейс нельзя отозвать")
    return await serialize_grant(await get_grant(grant_id, user), user)


async def open_grant(grant_id, user):
    grant = await get_grant(grant_id, user, own=True)
    now = datetime.now(timezone.utc)
    async with in_transaction("default") as tx:
        # Conditional write serializes competing openings on SQLite and PostgreSQL.
        changed = await LootCaseGrant.filter(id=grant.id, status="available").using_db(tx).update(status="opened", opened_at=now)
        if changed:
            prize = pick_snapshot_prize(grant.snapshot["prizes"], grant.snapshot.get("rarity_drop_weights"))
            reward = await LootCaseReward.create(using_db=tx, grant_id=grant.id, spin_token=str(uuid4()), prize=prize)
            await PanelAuditLog.create(using_db=tx, actor_vk_id=user["vk_id"], action="loot_case_spin",
                entity_type="loot_case_grant", entity_id=str(grant.id), detail={
                    "actor_name_snapshot": user.get("bot_nickname") or user.get("nickname") or grant.recipient_name,
                    "actor_role_snapshot": role_title(int(user.get("access_level") or 0)), "source": "panel",
                    "case_title": grant.snapshot["title"], "prize_title": prize["title"], "prize_id": prize["id"],
                    "grant_id": grant.id, "reward_id": reward.id})
        else:
            reward = await LootCaseReward.get_or_none(grant_id=grant.id, using_db=tx)
            if not reward:
                raise HTTPException(409, "Кейс отозван и недоступен для открытия")
    return {"spin_token": reward.spin_token, "spin_duration_ms": grant.snapshot["spin_duration_ms"],
            "prize": reward.prize, "prizes": grant.snapshot["prizes"], "reward_id": reward.id,
            "already_opened": not bool(changed)}


async def serialize_reward(reward, user, grant=None, names=None):
    grant = grant or await LootCaseGrant.get(id=reward.grant_id)
    names = names or {}
    return {"id": reward.id, "grant_id": grant.id, "recipient_vk_id": grant.recipient_vk_id,
            "recipient_name": names.get(grant.recipient_vk_id, grant.recipient_name),
            "case_title": grant.snapshot["title"], "prize": reward.prize, "status": reward.status,
            "created_at": stamp(reward.created_at), "reviewed_at": stamp(reward.reviewed_at),
            "reviewed_by_vk_id": reward.reviewed_by_vk_id,
            "reviewed_by_name": names.get(reward.reviewed_by_vk_id, f"id{reward.reviewed_by_vk_id}") if reward.reviewed_by_vk_id else None,
            "history": reward.history, "can_review": manager(user)}


async def list_rewards(user, limit=30, offset=0):
    grants = LootCaseGrant.filter(server_id=DEFAULT_SERVER_ID)
    if not manager(user):
        grants = grants.filter(recipient_vk_id=user["vk_id"])
    query = LootCaseReward.filter(grant__server_id=DEFAULT_SERVER_ID)
    if not manager(user):
        query = query.filter(grant__recipient_vk_id=user["vk_id"])
    total = await query.count()
    rewards = await query.order_by("-created_at", "-id").offset(offset).limit(limit)
    grant_rows = {r.id: r for r in await grants.filter(id__in=[r.grant_id for r in rewards])}
    ids = {r.recipient_vk_id for r in grant_rows.values()} | {r.reviewed_by_vk_id for r in rewards if r.reviewed_by_vk_id}
    names = await resolve_display_names(ids)
    return {"items": [await serialize_reward(r, user, grant_rows[r.grant_id], names) for r in rewards], "total": total}


async def review_reward(reward_id, user, action):
    require_manager(user)
    transitions = {"issue": ("pending", "issued"), "reject": ("pending", "rejected"),
                   "unissue": ("issued", "pending"), "unreject": ("rejected", "pending")}
    before, after = transitions[action]
    async with in_transaction("default") as tx:
        reward = await LootCaseReward.get_or_none(id=reward_id, using_db=tx)
        if not reward:
            raise HTTPException(404, "Выигрыш не найден")
        grant = await LootCaseGrant.get(id=reward.grant_id, using_db=tx)
        if grant.server_id != DEFAULT_SERVER_ID:
            raise HTTPException(404, "Выигрыш не найден")
        # Acquire a row write lock before reading the history used by this decision.
        # This also protects against pending -> issued -> pending ABA transitions.
        await LootCaseReward.filter(id=reward.id).using_db(tx).update(status=F("status"))
        reward = await LootCaseReward.get(id=reward.id, using_db=tx)
        if reward.status == after:
            return await serialize_reward(reward, user, grant)
        if reward.status != before:
            raise HTTPException(409, "Решение уже изменено. Обновите список")
        now = datetime.now(timezone.utc)
        history = [*reward.history, {"action": action, "from": before, "to": after, "actor_vk_id": user["vk_id"], "actor_name": user.get("bot_nickname") or user.get("nickname") or f"id{user['vk_id']}", "at": stamp(now)}]
        changed = await LootCaseReward.filter(id=reward.id, status=before).using_db(tx).update(
            status=after, reviewed_by_vk_id=user["vk_id"], reviewed_at=now, history=history)
        if not changed:
            raise HTTPException(409, "Решение уже изменено. Обновите список")
        await PanelAuditLog.create(using_db=tx, actor_vk_id=user["vk_id"], action=f"issuance_case_{action}",
            entity_type="case_reward", entity_id=str(reward.id), detail={"target_vk_id": grant.recipient_vk_id,
                "target_nickname": grant.recipient_name, "title": reward.prize["title"], "source": "panel",
                "actor_name_snapshot": user.get("bot_nickname") or user.get("nickname") or f"id{user['vk_id']}",
                "actor_role_snapshot": role_title(int(user.get("access_level") or 0))})
    return await serialize_reward(await LootCaseReward.get(id=reward_id), user, grant)
