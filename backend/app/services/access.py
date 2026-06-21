"""Access control mirroring State-LoveBot logic."""

from __future__ import annotations

from app.config import DEFAULT_SERVER_ID, MAIN_ADMIN_ID
from app.models.bot import AccessLevel, User, UserServerAccess


async def get_access_level(vk_id: int, server_id: int = DEFAULT_SERVER_ID) -> int:
    if vk_id == MAIN_ADMIN_ID and MAIN_ADMIN_ID:
        return AccessLevel.DEVELOPER
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if access and access.access_level >= AccessLevel.DEVELOPER:
        return access.access_level
    dev_any = await UserServerAccess.filter(
        user_id=vk_id, access_level__gte=AccessLevel.DEVELOPER
    ).first()
    if dev_any:
        return AccessLevel.DEVELOPER
    return access.access_level if access else 0


async def has_ca_access(vk_id: int, server_id: int = DEFAULT_SERVER_ID) -> bool:
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    return bool(access and access.has_ca_access)


async def can_use_ca_scope(vk_id: int, server_id: int = DEFAULT_SERVER_ID) -> bool:
    level = await get_access_level(vk_id, server_id)
    if level >= AccessLevel.ZGS_GOS:
        return True
    return await has_ca_access(vk_id, server_id)


def panel_role(level: int) -> str:
    if level >= AccessLevel.DEVELOPER:
        return "owner"
    if level >= AccessLevel.CURATOR:
        return "lead"
    if level >= AccessLevel.SUPERVISOR:
        return "member"
    return "member"


from app.services.display_names import resolve_bot_nickname


async def get_user_profile(
    vk_id: int,
    server_id: int = DEFAULT_SERVER_ID,
    *,
    dev_level: int | None = None,
    dev_ca: bool | None = None,
) -> dict:
    user = await User.get_or_none(vk_id=vk_id)
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    level = dev_level if dev_level is not None else await get_access_level(vk_id, server_id)
    has_ca = dev_ca if dev_ca is not None else bool(access and access.has_ca_access)
    nickname = await resolve_bot_nickname(vk_id, server_id, access=access, user=user)
    if not nickname and user and user.username and user.username.strip():
        nickname = user.username.strip().lstrip("@")
    return {
        "vk_id": vk_id,
        "username": user.username if user else None,
        "nickname": nickname,
        "access_level": level,
        "access_level_name": AccessLevel.title(level),
        "has_ca_access": has_ca,
        "panel_role": panel_role(level),
        "server_id": server_id,
        "dev_persona": dev_level is not None,
    }
