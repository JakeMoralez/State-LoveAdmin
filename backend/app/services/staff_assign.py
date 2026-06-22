"""Сообщения и URL для назначения следящего через портал."""

from __future__ import annotations

from app.config import PANEL_BASE_URL


def assign_staff_portal_url() -> str:
    return f"{PANEL_BASE_URL.rstrip('/')}/assign?type=staff"


def assign_via_site_message() -> str:
    return f"Нет доступа следящего. Назначьте через сайт: {assign_staff_portal_url()}"
