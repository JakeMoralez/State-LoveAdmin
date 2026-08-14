"""Фоновые напоминания по задачам: просрок, дедлайн сегодня/завтра."""

from __future__ import annotations

import logging
from datetime import date, timedelta

from app.config import DEFAULT_SERVER_ID
from app.models.panel import Task, TaskNotificationLog
from app.services.task_helpers import format_due_display, OPEN_TASK_STATUSES, task_watchers
from app.services.vk_notify import notify_task_due_soon, notify_task_overdue

logger = logging.getLogger(__name__)


async def _was_sent_today(task_id: int, vk_id: int, kind: str, today: date) -> bool:
    return await TaskNotificationLog.filter(
        task_id=task_id,
        vk_id=vk_id,
        kind=kind,
        sent_on=today,
    ).exists()


async def _mark_sent(task_id: int, vk_id: int, kind: str, today: date) -> None:
    await TaskNotificationLog.get_or_create(
        task_id=task_id,
        vk_id=vk_id,
        kind=kind,
        sent_on=today,
    )


async def run_task_reminders(*, server_id: int = DEFAULT_SERVER_ID) -> int:
    """Проверить дедлайны и отправить VK-уведомления. Возвращает число отправленных."""
    today = date.today()
    tomorrow = today + timedelta(days=1)
    sent = 0

    tasks = await Task.filter(
        server_id=server_id,
        due_date__not_isnull=True,
        status__in=list(OPEN_TASK_STATUSES),
    )

    for task in tasks:
        if not task.due_date:
            continue
        recipients = task_watchers(task)
        if not recipients:
            continue
        due_str = format_due_display(task.due_date, task.due_time)

        if task.due_date < today:
            for vid in recipients:
                if await _was_sent_today(task.id, vid, "overdue", today):
                    continue
                if await notify_task_overdue(vid, task.id, task.title, due_str):
                    await _mark_sent(task.id, vid, "overdue", today)
                    sent += 1
        elif task.due_date == tomorrow:
            for vid in recipients:
                if await _was_sent_today(task.id, vid, "due_soon", today):
                    continue
                if await notify_task_due_soon(vid, task.id, task.title, due_str, days_left=1):
                    await _mark_sent(task.id, vid, "due_soon", today)
                    sent += 1
        elif task.due_date == today:
            for vid in recipients:
                if await _was_sent_today(task.id, vid, "due_today", today):
                    continue
                if await notify_task_due_soon(vid, task.id, task.title, due_str, days_left=0):
                    await _mark_sent(task.id, vid, "due_today", today)
                    sent += 1

    if sent:
        logger.info("task reminders sent=%d server=%s", sent, server_id)
    return sent
