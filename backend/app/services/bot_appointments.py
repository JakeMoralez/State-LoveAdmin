"""Explicit bot commands share the panel's appointment and audit operations."""

from app.models.bot import UserServerAccess
from app.services.access import get_access_level
from app.services.appointments import appointment_snapshot
from app.services.audit import log_audit
from app.services.leader_nickname import infer_leadership_from_nickname
from app.services.role_assign import assign_leadership
from app.services.staff import _persist_member_nickname, update_staff_member, revoke_ca_leader_full, revoke_staff_access, update_leader_nickname
from app.services.staff_nickname import strip_nickname_tags


async def set_nickname(*, actor: int, vk_id: int, server_id: int, nickname: str) -> dict:
    actor_level = await get_access_level(actor, server_id)
    target_level = await get_access_level(vk_id, server_id)
    if actor_level < 1 or (target_level > 0 and (actor_level < 3 or (target_level >= actor_level and actor_level < 10))):
        raise ValueError("Недостаточно прав для изменения этого профиля")
    before = await appointment_snapshot(server_id, vk_id)
    old = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    old_nick = old.nickname if old else ""
    parsed = infer_leadership_from_nickname(nickname)
    if old_nick == nickname and (before or not parsed.get("role_type")):
        return {"ok": True, "nickname": nickname, "changed": False}
    if parsed.get("role_type") and before.get("kind") == "leader" and before.get("position") == parsed.get("position") and before.get("org_tag") == parsed.get("org_tag"):
        await update_leader_nickname(server_id, vk_id, nickname=nickname)
    elif parsed.get("role_type"):
        await assign_leadership(server_id, vk_id, role_type=parsed["role_type"],
            nickname=strip_nickname_tags(nickname), org_tag=parsed["org_tag"], granted_by=actor)
    elif target_level > 0:
        await update_staff_member(server_id, vk_id, nickname=strip_nickname_tags(nickname), granted_by=actor)
    else:
        await _persist_member_nickname(vk_id, server_id, nickname)
    after = await appointment_snapshot(server_id, vk_id)
    action = "staff_transfer" if before and any(before.get(k) != after.get(k) for k in ("kind", "position", "org_tag", "access_level")) and parsed.get("role_type") else (
        "leader_assign" if parsed.get("role_type") and not before else "profile_update")
    access = await UserServerAccess.get(user_id=vk_id, server_id=server_id)
    await log_audit(actor, action, "user", vk_id, {
        "source": "bot", "server_id": server_id, "target_vk_id": vk_id,
        "target_nickname": access.nickname, "nickname": {"from": old_nick, "to": access.nickname},
        "appointment_before": before, "appointment_after": after,
    })
    return {"ok": True, "nickname": access.nickname, "changed": True}


async def revoke_on_leave(*, server_id: int, vk_id: int, kind: str, actor_vk_id: int | None = None, reason: str = "Выход из последней беседы назначения") -> dict:
    before = await appointment_snapshot(server_id, vk_id)
    if actor_vk_id and actor_vk_id != vk_id:
        actor_level = await get_access_level(actor_vk_id, server_id)
        target_level = await get_access_level(vk_id, server_id)
        if actor_level < 2 or (target_level >= actor_level and actor_level < 11):
            raise PermissionError("Недостаточно прав для снятия назначения")
    if not before or before["kind"] != kind:
        # A legacy chat flag is not a primary appointment.
        changed = await UserServerAccess.filter(user_id=vk_id, server_id=server_id, is_leader=True).update(is_leader=False)
        return {"ok": True, "changed": bool(changed)}
    if kind == "staff":
        await revoke_staff_access(server_id, vk_id, updated_by=actor_vk_id)
    else:
        await revoke_ca_leader_full(server_id, vk_id, updated_by=actor_vk_id)
    await log_audit(actor_vk_id or 0, "staff_revoke" if kind == "staff" else "leader_remove", kind, vk_id, {
        "source": "bot", "server_id": server_id, "target_vk_id": vk_id,
        "target_nickname": before.get("nickname"), "appointment_before": before,
        **({"actor_name_snapshot": "Система"} if not actor_vk_id else {}), "reason": reason,
    })
    return {"ok": True, "changed": True}
