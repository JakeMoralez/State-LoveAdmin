"""Права на управление реестром руководства (ЗГС ГОС+)."""

from __future__ import annotations

from app.models.bot import AccessLevel


def can_manage_leaders(user: dict) -> bool:
    level = int(user.get("access_level") or 0)
    if level >= AccessLevel.ZGS_GOS:
        return True
    if level >= AccessLevel.SUPERVISOR and user.get("has_ca_access"):
        return True
    return user.get("panel_role") in ("owner", "lead")
