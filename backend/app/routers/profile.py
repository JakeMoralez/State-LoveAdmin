"""User profile."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import DEFAULT_SERVER_ID
from app.models.panel import UserNotifyPrefs
from app.services.auth import require_ca_user
from app.services.discord_links import set_discord_link
from app.services.discord_oauth import normalize_discord_id
from app.services.staff import update_staff_member
from app.services.audit import log_audit
from app.services.profile_ids import resolve_profile_key

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileUpdate(BaseModel):
    nickname: str | None = None
    nickname_tag: str | None = None
    discord_id: str | None = None
    forum_account: str | None = None
    notify_tasks: bool | None = None
    notify_assign: bool | None = None


async def _notify_prefs_payload(vk_id: int) -> dict[str, bool]:
    row = await UserNotifyPrefs.get_or_none(vk_id=vk_id)
    return {
        "notify_tasks": True if row is None else bool(row.notify_tasks),
        "notify_assign": True if row is None else bool(row.notify_assign),
    }


@router.get("/resolve/{key}")
async def resolve_profile(key: str, user: dict = Depends(require_ca_user)):
    """Публичный ID или legacy vk_id → каноническая пара."""
    resolved = await resolve_profile_key(key)
    if not resolved:
        raise HTTPException(status_code=404, detail="Профиль не найден")
    return resolved


@router.get("")
async def get_profile(user: dict = Depends(require_ca_user)):
    prefs = await _notify_prefs_payload(user["vk_id"])
    return {**user, **prefs}


@router.patch("")
async def patch_profile(body: ProfileUpdate, user: dict = Depends(require_ca_user)):
    vk_id = int(user["vk_id"])
    server_id = int(user.get("server_id") or DEFAULT_SERVER_ID)
    from app.services.access import get_user_profile
    before = {**await get_user_profile(vk_id, server_id), **await _notify_prefs_payload(vk_id)}

    fields_set = body.model_fields_set

    if "nickname" in fields_set or "nickname_tag" in fields_set:
        nick = (body.nickname or "").strip()
        if "nickname" in fields_set and not nick:
            raise HTTPException(status_code=400, detail="Укажите ник")
        try:
            await update_staff_member(
                server_id,
                vk_id,
                nickname=nick if "nickname" in fields_set else None,
                nickname_tag=body.nickname_tag,
                nickname_tag_provided="nickname_tag" in fields_set,
                granted_by=vk_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if "discord_id" in fields_set:
        try:
            discord_id = normalize_discord_id(body.discord_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await set_discord_link(vk_id=vk_id, discord_id=discord_id, actor_vk_id=vk_id)

    if "forum_account" in fields_set:
        from app.services.role_assign import _apply_forum_account

        raw = (body.forum_account or "").strip()
        if not raw:
            raise HTTPException(status_code=400, detail="Укажите аккаунт на форуме")
        try:
            await _apply_forum_account(vk_id, raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if "notify_tasks" in fields_set or "notify_assign" in fields_set:
        row, _ = await UserNotifyPrefs.get_or_create(
            vk_id=vk_id,
            defaults={"notify_tasks": True, "notify_assign": True},
        )
        if "notify_tasks" in fields_set and body.notify_tasks is not None:
            row.notify_tasks = bool(body.notify_tasks)
        if "notify_assign" in fields_set and body.notify_assign is not None:
            row.notify_assign = bool(body.notify_assign)
        await row.save()

    payload = await get_user_profile(vk_id, server_id)
    prefs = await _notify_prefs_payload(vk_id)
    after = {**payload, **prefs}
    detail = {"target_vk_id": vk_id, "target_nickname": before.get("bot_nickname") or before.get("nickname"), "server_id": server_id}
    for key in ("bot_nickname", "username", "discord_id", "notify_tasks", "notify_assign"):
        if before.get(key) != after.get(key):
            detail["nickname" if key == "bot_nickname" else key] = {"from": before.get(key), "to": after.get(key)}
    if any(isinstance(v, dict) and "from" in v for v in detail.values()):
        action = "settings_profile_update" if set(detail) - {"target_vk_id", "target_nickname", "server_id", "notify_tasks", "notify_assign"} == set() else "profile_update"
        await log_audit(vk_id, action, "profile", vk_id, detail)
    return {**payload, **prefs}
