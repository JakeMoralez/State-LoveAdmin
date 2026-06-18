"""Who can open the developer panel."""

from __future__ import annotations

from app.config import DEV_MODE, DEV_PANEL_MIN_LEVEL, DEV_PANEL_VK_IDS, DEV_VK_ID, MAIN_ADMIN_ID
from app.models.bot import AccessLevel


def can_view_dev_panel(vk_id: int, access_level: int) -> bool:
    if MAIN_ADMIN_ID and vk_id == MAIN_ADMIN_ID:
        return True
    if access_level >= max(DEV_PANEL_MIN_LEVEL, AccessLevel.DEVELOPER):
        return True
    if vk_id in DEV_PANEL_VK_IDS:
        return True
    if DEV_MODE and DEV_VK_ID and vk_id == DEV_VK_ID:
        return True
    return False
