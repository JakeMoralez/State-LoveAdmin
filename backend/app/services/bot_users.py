"""Создание записей users в bot.db (схема бота требует added_at)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.bot import User


async def ensure_bot_user(vk_id: int, *, username: str | None = None) -> tuple[User, bool]:
    """get_or_create с обязательными полями bot.db: added_at, last_used."""
    now = datetime.now(UTC)
    defaults = {
        "added_at": now,
        "last_used": now,
        "username": username if username is not None else str(vk_id),
    }
    return await User.get_or_create(vk_id=vk_id, defaults=defaults)
