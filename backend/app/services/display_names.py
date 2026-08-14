"""Resolve user display names: bot nickname → VK full name."""

from __future__ import annotations

import httpx

from app.config import DEFAULT_SERVER_ID, VK_SERVICE_TOKEN
from app.models.bot import User, UserServerAccess

_cache: dict[int, str] = {}


def _is_placeholder_username(username: str, vk_id: int) -> bool:
    """username в боте часто равен vk_id — не показываем его вместо имени."""
    text = username.strip().lstrip("@")
    if not text:
        return True
    if text == str(vk_id):
        return True
    if text.isdigit() and len(text) >= 6:
        return True
    return False


def invalidate_display_names(vk_ids: int | set[int]) -> None:
    if isinstance(vk_ids, int):
        vk_ids = {vk_ids}
    for vid in vk_ids:
        _cache.pop(vid, None)


async def resolve_bot_nickname(
    vk_id: int,
    server_id: int = DEFAULT_SERVER_ID,
    *,
    access: UserServerAccess | None = None,
    user: User | None = None,
) -> str | None:
    """Ник из /setnick на конкретном server_id — как UserRepository.get_nickname в боте."""
    del user  # legacy users.nickname не используем: бот читает только user_server_access
    if access is not None and access.server_id != server_id:
        access = None
    if access is None:
        access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if access and access.nickname and access.nickname.strip():
        from app.services.staff_nickname import rewrite_legacy_nickname_tags

        return rewrite_legacy_nickname_tags(access.nickname.strip())
    return None


async def _vk_full_names(vk_ids: set[int]) -> dict[int, str]:
    if not vk_ids or not VK_SERVICE_TOKEN:
        return {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://api.vk.com/method/users.get",
                params={
                    "user_ids": ",".join(str(i) for i in vk_ids),
                    "access_token": VK_SERVICE_TOKEN,
                    "v": "5.199",
                },
            )
            data = res.json()
            out: dict[int, str] = {}
            for u in data.get("response") or []:
                vid = int(u["id"])
                name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
                if name:
                    out[vid] = name
            return out
    except Exception:
        return {}


async def resolve_display_names(
    vk_ids: set[int],
    server_id: int = DEFAULT_SERVER_ID,
) -> dict[int, str]:
    """Имя для UI: всегда сверяем ник в БД (бот мог обновить /setnick без сброса кэша панели)."""
    if not vk_ids:
        return {}

    result: dict[int, str] = {}
    id_list = list(vk_ids)

    for acc in await UserServerAccess.filter(user_id__in=id_list, server_id=server_id):
        nick = (acc.nickname or "").strip()
        if nick:
            result[acc.user_id] = nick

    missing = vk_ids - result.keys()
    if missing:
        for vid, name in (await _vk_full_names(missing)).items():
            result[vid] = name

    missing = vk_ids - result.keys()
    if missing:
        for user in await User.filter(vk_id__in=list(missing)):
            username = (user.username or "").strip()
            if username and not _is_placeholder_username(username, user.vk_id):
                result[user.vk_id] = username.lstrip("@")

    for vid in vk_ids - result.keys():
        result[vid] = f"id{vid}"

    for vid, name in result.items():
        _cache[vid] = name

    return {vid: result[vid] for vid in vk_ids}


async def resolve_display_name(vk_id: int, server_id: int = DEFAULT_SERVER_ID) -> str:
    names = await resolve_display_names({vk_id}, server_id)
    return names[vk_id]


_VK_PHOTO_CACHE: dict[int, str | None] = {}
_DEFAULT_AVATAR = "https://vk.com/images/camera_100.png"


async def resolve_vk_photos(vk_ids: set[int]) -> dict[int, str]:
    """VK profile photo (100px) or default placeholder."""
    result: dict[int, str] = {}
    missing = {vid for vid in vk_ids if vid not in _VK_PHOTO_CACHE}

    if missing and VK_SERVICE_TOKEN:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    "https://api.vk.com/method/users.get",
                    params={
                        "user_ids": ",".join(str(i) for i in missing),
                        "fields": "photo_100",
                        "access_token": VK_SERVICE_TOKEN,
                        "v": "5.199",
                    },
                )
                data = res.json()
                for u in data.get("response") or []:
                    vid = int(u["id"])
                    photo = u.get("photo_100") or None
                    _VK_PHOTO_CACHE[vid] = photo
                    missing.discard(vid)
        except Exception:
            pass

    for vid in missing:
        _VK_PHOTO_CACHE.setdefault(vid, None)

    for vid in vk_ids:
        photo = _VK_PHOTO_CACHE.get(vid)
        result[vid] = photo or _DEFAULT_AVATAR
    return result
