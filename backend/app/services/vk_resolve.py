"""Разбор VK-ссылок и коротких имён (vk.com/mass4ro)."""

from __future__ import annotations

import re

import httpx

from app.config import VK_SERVICE_TOKEN

VK_MENTION_RE = re.compile(
    r"(?:"
    r"\[id(\d+)\|[^\]]+\]"
    r"|@([a-zA-Z0-9_.]+)"
    r"|(?:https?://)?(?:m\.)?(?:vk\.com|vk\.ru)/(?:id(\d+)|([a-zA-Z0-9_.]+))"
    r"|^id(\d+)$"
    r"|^(\d+)$"
    r")",
    re.IGNORECASE,
)

# Системные сегменты vk.com — не screen_name
_VK_RESERVED = frozenset(
    {
        "id",
        "club",
        "public",
        "event",
        "topic",
        "wall",
        "photo",
        "video",
        "audio",
        "doc",
        "mail",
        "write",
        "feed",
        "friends",
        "groups",
        "settings",
        "apps",
        "login",
        "join",
        "share",
        "away",
    },
)


def parse_vk_reference(raw: str) -> tuple[int | None, str | None]:
    """Числовой vk_id или screen_name из ссылки / @user / id123."""
    text = (raw or "").strip()
    if not text:
        return None, None
    match = VK_MENTION_RE.search(text)
    if not match:
        if text.isdigit():
            return int(text), None
        if text.startswith("@"):
            return None, text[1:]
        return None, text.lstrip("@")

    vk_id, screen, url_id, url_screen, id_prefix, digits = match.groups()
    if vk_id:
        return int(vk_id), None
    if screen:
        return None, screen
    if url_id:
        return int(url_id), None
    if url_screen and url_screen.lower() not in _VK_RESERVED:
        return None, url_screen
    if id_prefix:
        return int(id_prefix), None
    if digits:
        return int(digits), None
    return None, None


def parse_vk_id(raw: str) -> int | None:
    """Только числовой id (без запроса к VK API)."""
    vk_id, _ = parse_vk_reference(raw)
    return vk_id


async def _fetch_vk_id_by_screen(screen_name: str) -> int | None:
    if not VK_SERVICE_TOKEN:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://api.vk.com/method/users.get",
                params={
                    "user_ids": screen_name,
                    "access_token": VK_SERVICE_TOKEN,
                    "v": "5.199",
                },
            )
            data = res.json()
            if data.get("error"):
                return None
            users = data.get("response") or []
            if users:
                return int(users[0]["id"])
    except Exception:
        return None
    return None


async def resolve_vk_id_input(raw: str) -> int:
    """VK ID из числа, vk.com/id… или vk.com/screen_name."""
    vk_id, screen = parse_vk_reference(raw)
    if vk_id is not None:
        return vk_id
    if screen:
        resolved = await _fetch_vk_id_by_screen(screen)
        if resolved:
            return resolved
        if not VK_SERVICE_TOKEN:
            raise ValueError(
                "Короткая ссылка vk.com/… требует VK_SERVICE_TOKEN — "
                "укажите числовой id или vk.com/id…"
            )
        raise ValueError(f"Профиль VK «{screen}» не найден")
    raise ValueError("Укажите корректный VK ID или ссылку vk.com/…")
