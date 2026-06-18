"""Resolve user display names: bot nickname → VK full name."""

from __future__ import annotations

import httpx

from app.config import DEFAULT_SERVER_ID, VK_SERVICE_TOKEN
from app.models.bot import User, UserServerAccess

_cache: dict[int, str] = {}


async def _vk_full_name(vk_id: int) -> str | None:
    if not VK_SERVICE_TOKEN:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(
                "https://api.vk.com/method/users.get",
                params={
                    "user_ids": vk_id,
                    "access_token": VK_SERVICE_TOKEN,
                    "v": "5.199",
                },
            )
            data = res.json()
            items = data.get("response") or []
            if items:
                u = items[0]
                name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
                return name or None
    except Exception:
        pass
    return None


async def resolve_display_name(vk_id: int, server_id: int = DEFAULT_SERVER_ID) -> str:
    if vk_id in _cache:
        return _cache[vk_id]

    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if access and access.nickname and access.nickname.strip():
        _cache[vk_id] = access.nickname.strip()
        return _cache[vk_id]

    user = await User.get_or_none(vk_id=vk_id)
    if user:
        if user.nickname and user.nickname.strip():
            _cache[vk_id] = user.nickname.strip()
            return _cache[vk_id]
        if user.username and user.username.strip():
            _cache[vk_id] = user.username.strip().lstrip("@")
            return _cache[vk_id]

    vk_name = await _vk_full_name(vk_id)
    if vk_name:
        _cache[vk_id] = vk_name
        return vk_name

    fallback = f"id{vk_id}"
    _cache[vk_id] = fallback
    return fallback


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


async def resolve_display_names(
    vk_ids: set[int],
    server_id: int = DEFAULT_SERVER_ID,
) -> dict[int, str]:
    missing = {vid for vid in vk_ids if vid not in _cache}
    if not missing:
        return {vid: _cache[vid] for vid in vk_ids}

    accesses = await UserServerAccess.filter(
        user_id__in=list(missing),
        server_id=server_id,
    )
    for acc in accesses:
        if acc.nickname and acc.nickname.strip():
            _cache[acc.user_id] = acc.nickname.strip()
            missing.discard(acc.user_id)

    if missing:
        users = await User.filter(vk_id__in=list(missing))
        for u in users:
            if u.vk_id in _cache:
                continue
            if u.nickname and u.nickname.strip():
                _cache[u.vk_id] = u.nickname.strip()
                missing.discard(u.vk_id)
            elif u.username and u.username.strip():
                _cache[u.vk_id] = u.username.strip().lstrip("@")
                missing.discard(u.vk_id)

    if missing and VK_SERVICE_TOKEN:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    "https://api.vk.com/method/users.get",
                    params={
                        "user_ids": ",".join(str(i) for i in missing),
                        "access_token": VK_SERVICE_TOKEN,
                        "v": "5.199",
                    },
                )
                data = res.json()
                for u in data.get("response") or []:
                    vid = int(u["id"])
                    name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
                    if name:
                        _cache[vid] = name
                        missing.discard(vid)
        except Exception:
            pass

    for vid in missing:
        _cache.setdefault(vid, f"id{vid}")

    return {vid: _cache[vid] for vid in vk_ids}
