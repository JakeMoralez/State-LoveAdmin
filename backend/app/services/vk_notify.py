"""VK notifications via State-LoveBot internal API."""

from __future__ import annotations

import logging

import httpx

from app.config import PANEL_BASE_URL, SLED_BOT_SECRET, SLED_INTERNAL_URL

logger = logging.getLogger(__name__)


async def notify_vk(vk_id: int, message: str) -> bool:
    if not SLED_BOT_SECRET:
        logger.warning("SLED_BOT_SECRET not set — skip VK notify")
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{SLED_INTERNAL_URL.rstrip('/')}/internal/notify",
                json={"vk_id": vk_id, "message": message},
                headers={"X-Sled-Secret": SLED_BOT_SECRET},
            )
            return resp.status_code == 200
    except Exception as exc:
        logger.warning("VK notify failed vk_id=%s: %s", vk_id, exc)
        return False


async def notify_task_assigned(
    assignee_vk_id: int, task_id: int, title: str, reporter_nickname: str
) -> bool:
    link = f"{PANEL_BASE_URL.rstrip('/')}/tasks/{task_id}"
    msg = (
        f"📋 Новая задача от {reporter_nickname}\n"
        f"«{title}»\n"
        f"→ {link}"
    )
    return await notify_vk(assignee_vk_id, msg)


async def notify_task_status(
    assignee_vk_id: int, task_id: int, title: str, status: str
) -> bool:
    if status not in ("review", "done"):
        return False
    label = "на проверке" if status == "review" else "выполнена"
    link = f"{PANEL_BASE_URL.rstrip('/')}/tasks/{task_id}"
    msg = f"✅ Задача «{title}» — {label}\n→ {link}"
    return await notify_vk(assignee_vk_id, msg)
