"""VK notifications via State-LoveBot internal API."""

from __future__ import annotations

import logging

import httpx

from app.config import PANEL_BASE_URL, SLED_BOT_SECRET, SLED_INTERNAL_URL
from app.services.task_helpers import PRIORITY_LABELS, STATUS_LABELS

logger = logging.getLogger(__name__)


def _task_link(task_id: int) -> str:
    return f"{PANEL_BASE_URL.rstrip('/')}/tasks/{task_id}"


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
    assignee_vk_id: int,
    task_id: int,
    title: str,
    reporter_nickname: str,
    *,
    due_display: str | None = None,
    priority: str | None = None,
) -> bool:
    link = _task_link(task_id)
    lines = [
        f"📋 Новая задача от {reporter_nickname}",
        f"«{title}»",
    ]
    if priority and priority in PRIORITY_LABELS:
        lines.append(f"Приоритет: {PRIORITY_LABELS[priority]}")
    if due_display:
        lines.append(f"Срок: {due_display}")
    lines.append(f"→ {link}")
    return await notify_vk(assignee_vk_id, "\n".join(lines))


async def notify_task_overdue(
    assignee_vk_id: int,
    task_id: int,
    title: str,
    due_display: str,
) -> bool:
    link = _task_link(task_id)
    msg = (
        f"⏰ Просрочена задача «{title}»\n"
        f"Дедлайн был: {due_display}\n"
        f"→ {link}"
    )
    return await notify_vk(assignee_vk_id, msg)


async def notify_task_due_soon(
    assignee_vk_id: int,
    task_id: int,
    title: str,
    due_display: str,
    *,
    days_left: int,
) -> bool:
    link = _task_link(task_id)
    if days_left <= 0:
        headline = "🔔 Дедлайн сегодня"
    else:
        headline = "🔔 Дедлайн завтра"
    msg = (
        f"{headline}: «{title}»\n"
        f"Срок: {due_display}\n"
        f"→ {link}"
    )
    return await notify_vk(assignee_vk_id, msg)


async def notify_task_comment(
    vk_id: int,
    task_id: int,
    title: str,
    author_name: str,
    excerpt: str,
) -> bool:
    link = _task_link(task_id)
    body = excerpt.strip()
    if len(body) > 180:
        body = body[:177].rstrip() + "…"
    msg = (
        f"💬 Комментарий к задаче «{title}»\n"
        f"{author_name}: {body}\n"
        f"→ {link}"
    )
    return await notify_vk(vk_id, msg)


async def notify_task_status(
    vk_id: int,
    task_id: int,
    title: str,
    status: str,
    *,
    by_name: str | None = None,
) -> bool:
    label = STATUS_LABELS.get(status, status)
    link = _task_link(task_id)
    if status == "review":
        emoji = "👀"
        text = f"{emoji} Задача «{title}» — {label}"
    elif status == "done":
        emoji = "✅"
        text = f"{emoji} Задача «{title}» — {label}"
    elif status == "cancelled":
        emoji = "🚫"
        text = f"{emoji} Задача «{title}» — {label}"
    elif status == "in_progress":
        emoji = "▶️"
        text = f"{emoji} Задача «{title}» — {label}"
    else:
        return False
    if by_name:
        text += f"\nИзменил(а): {by_name}"
    text += f"\n→ {link}"
    return await notify_vk(vk_id, text)


async def notify_reporter_task_update(
    reporter_vk_id: int,
    task_id: int,
    title: str,
    message: str,
) -> bool:
    link = _task_link(task_id)
    msg = f"{message}\n«{title}»\n→ {link}"
    return await notify_vk(reporter_vk_id, msg)
