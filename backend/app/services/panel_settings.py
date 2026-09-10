"""Runtime panel settings stored in panel.db (overrides env defaults)."""

from __future__ import annotations

from typing import Any

from app.config import DEV_ERROR_RETENTION, TASK_REMINDER_INTERVAL_SEC
from app.models.panel import PanelSettings

KEY_TASK_REMINDERS_ENABLED = "task_reminders_enabled"
KEY_TASK_REMINDER_INTERVAL_SEC = "task_reminder_interval_sec"
KEY_DEV_ERROR_RETENTION = "dev_error_retention_days"

EDITABLE_KEYS = frozenset(
    {
        KEY_TASK_REMINDERS_ENABLED,
        KEY_TASK_REMINDER_INTERVAL_SEC,
        KEY_DEV_ERROR_RETENTION,
    }
)


def _default_for(key: str) -> Any:
    if key == KEY_TASK_REMINDERS_ENABLED:
        return True
    if key == KEY_TASK_REMINDER_INTERVAL_SEC:
        return max(300, int(TASK_REMINDER_INTERVAL_SEC))
    if key == KEY_DEV_ERROR_RETENTION:
        return max(50, int(DEV_ERROR_RETENTION))
    return None


def normalize_setting(key: str, value: Any) -> Any:
    if key == KEY_TASK_REMINDERS_ENABLED:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip().lower() in ("1", "true", "yes", "on")
        raise ValueError("Ожидается true/false")
    if key == KEY_TASK_REMINDER_INTERVAL_SEC:
        n = int(value)
        if n < 300:
            raise ValueError("Интервал напоминаний: минимум 300 секунд")
        if n > 86400:
            raise ValueError("Интервал напоминаний: максимум 86400 секунд")
        return n
    if key == KEY_DEV_ERROR_RETENTION:
        n = int(value)
        if n < 50:
            raise ValueError("Хранение логов: минимум 50 записей")
        if n > 50000:
            raise ValueError("Хранение логов: максимум 50000 записей")
        return n
    raise ValueError(f"Неизвестный ключ: {key}")


async def get_setting(key: str, default: Any = None) -> Any:
    row = await PanelSettings.get_or_none(key=key)
    if row is None:
        return _default_for(key) if default is None else default
    return row.value


async def get_task_reminders_enabled() -> bool:
    return bool(await get_setting(KEY_TASK_REMINDERS_ENABLED))


async def get_task_reminder_interval_sec() -> int:
    value = await get_setting(KEY_TASK_REMINDER_INTERVAL_SEC)
    try:
        return max(300, int(value))
    except (TypeError, ValueError):
        return max(300, int(TASK_REMINDER_INTERVAL_SEC))


async def get_dev_error_retention() -> int:
    value = await get_setting(KEY_DEV_ERROR_RETENTION)
    try:
        return max(50, int(value))
    except (TypeError, ValueError):
        return max(50, int(DEV_ERROR_RETENTION))


async def list_settings() -> dict[str, Any]:
    rows = await PanelSettings.all()
    stored = {row.key: row.value for row in rows}
    return {
        KEY_TASK_REMINDERS_ENABLED: stored.get(
            KEY_TASK_REMINDERS_ENABLED, _default_for(KEY_TASK_REMINDERS_ENABLED)
        ),
        KEY_TASK_REMINDER_INTERVAL_SEC: stored.get(
            KEY_TASK_REMINDER_INTERVAL_SEC, _default_for(KEY_TASK_REMINDER_INTERVAL_SEC)
        ),
        KEY_DEV_ERROR_RETENTION: stored.get(
            KEY_DEV_ERROR_RETENTION, _default_for(KEY_DEV_ERROR_RETENTION)
        ),
    }


async def set_settings(updates: dict[str, Any]) -> dict[str, Any]:
    if not updates:
        return await list_settings()
    unknown = set(updates) - EDITABLE_KEYS
    if unknown:
        raise ValueError(f"Нельзя менять: {', '.join(sorted(unknown))}")
    for key, raw in updates.items():
        value = normalize_setting(key, raw)
        await PanelSettings.update_or_create(key=key, defaults={"value": value})
    return await list_settings()
