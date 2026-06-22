"""Создание записей bot.db (схема бота требует added_at / granted_at)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.models.bot import User, UserServerAccess


def _now() -> datetime:
    return datetime.now(UTC)


async def ensure_bot_user(vk_id: int, *, username: str | None = None) -> tuple[User, bool]:
    """get_or_create с обязательными полями bot.db: added_at, last_used."""
    now = _now()
    defaults = {
        "added_at": now,
        "last_used": now,
        "username": username if username is not None else str(vk_id),
    }
    return await User.get_or_create(vk_id=vk_id, defaults=defaults)


async def ensure_server_access(
    vk_id: int,
    server_id: int,
    *,
    access_level: int = 0,
    granted_by: int | None = None,
    **extra: Any,
) -> tuple[UserServerAccess, bool]:
    """get_or_create с обязательным granted_at в user_server_access."""
    defaults: dict[str, Any] = {
        "access_level": access_level,
        "granted_at": _now(),
        "granted_by": granted_by,
        **extra,
    }
    return await UserServerAccess.get_or_create(
        user_id=vk_id,
        server_id=server_id,
        defaults=defaults,
    )
