"""Создание записей bot.db (схема бота требует added_at / granted_at)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from tortoise import Tortoise

from app.models.bot import User, UserServerAccess

logger = logging.getLogger(__name__)

_USA_SENIOR_READY = False
_USA_PROMOTED_READY = False


def _now() -> datetime:
    return datetime.now(UTC)


def has_usa_senior_columns() -> bool:
    """True, если в bot.db уже есть is_senior / senior_spheres."""
    return _USA_SENIOR_READY


def has_usa_promoted_at() -> bool:
    return _USA_PROMOTED_READY


def access_senior_state(access: UserServerAccess | None) -> tuple[bool, list[str]]:
    """Безопасно читать старшие флаги с partial-инстанса без этих колонок."""
    if access is None:
        return False, []
    is_senior = bool(getattr(access, "is_senior", False))
    raw = getattr(access, "senior_spheres", None)
    spheres: list[str] = []
    if isinstance(raw, list):
        spheres = [str(x).strip() for x in raw if str(x).strip()]
    return is_senior, spheres


async def _usa_column_names() -> set[str]:
    from app.config import BOT_DATABASE_URL, is_sqlite_url

    conn = Tortoise.get_connection("bot")
    if is_sqlite_url(BOT_DATABASE_URL):
        rows = await conn.execute_query_dict("PRAGMA table_info(user_server_access)")
        return {str(r.get("name") or "") for r in rows}
    rows = await conn.execute_query_dict(
        "SELECT column_name AS name FROM information_schema.columns "
        "WHERE table_name = 'user_server_access'"
    )
    return {str(r.get("name") or "") for r in rows}


async def ensure_user_server_access_senior_columns() -> None:
    """LoveBot-модель уже содержит поля; локальный sqlite мог остаться без ALTER."""
    global _USA_SENIOR_READY, _USA_PROMOTED_READY
    from app.config import BOT_DATABASE_URL, is_sqlite_url

    conn = Tortoise.get_connection("bot")
    sqlite = is_sqlite_url(BOT_DATABASE_URL)
    names = await _usa_column_names()

    if "is_senior" not in names:
        ddl = (
            "ALTER TABLE user_server_access ADD COLUMN is_senior INTEGER NOT NULL DEFAULT 0"
            if sqlite
            else "ALTER TABLE user_server_access ADD COLUMN is_senior BOOLEAN NOT NULL DEFAULT FALSE"
        )
        try:
            await conn.execute_query(ddl)
            logger.info("bot schema: added user_server_access.is_senior")
        except Exception as exc:
            logger.warning("bot schema: could not add is_senior: %s", exc)

    if "senior_spheres" not in names:
        ddl = (
            "ALTER TABLE user_server_access ADD COLUMN senior_spheres TEXT NOT NULL DEFAULT '[]'"
            if sqlite
            else "ALTER TABLE user_server_access ADD COLUMN senior_spheres JSONB NOT NULL DEFAULT '[]'"
        )
        try:
            await conn.execute_query(ddl)
            logger.info("bot schema: added user_server_access.senior_spheres")
        except Exception as exc:
            logger.warning("bot schema: could not add senior_spheres: %s", exc)

    if "promoted_at" not in names:
        ddl = "ALTER TABLE user_server_access ADD COLUMN promoted_at TIMESTAMP NULL"
        try:
            await conn.execute_query(ddl)
            logger.info("bot schema: added user_server_access.promoted_at")
        except Exception as exc:
            logger.warning("bot schema: could not add promoted_at: %s", exc)

    names = await _usa_column_names()
    _USA_SENIOR_READY = "is_senior" in names and "senior_spheres" in names
    _USA_PROMOTED_READY = "promoted_at" in names


async def update_server_access(vk_id: int, server_id: int, **fields: Any) -> int:
    """SQL UPDATE без instance.save() — partial-строки Tortoise иначе падают."""
    if not fields:
        return 0
    if not has_usa_senior_columns():
        fields.pop("is_senior", None)
        fields.pop("senior_spheres", None)
    if not has_usa_promoted_at():
        fields.pop("promoted_at", None)
    if not fields:
        return 0
    return await UserServerAccess.filter(user_id=vk_id, server_id=server_id).update(**fields)


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
