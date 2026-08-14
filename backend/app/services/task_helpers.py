"""Shared task helpers (assignees, due formatting)."""

from __future__ import annotations

from datetime import date

from app.models.panel import Task

OPEN_TASK_STATUSES = ("backlog", "todo", "in_progress", "review")

PRIORITY_LABELS: dict[str, str] = {
    "low": "Низкий",
    "medium": "Средний",
    "high": "Высокий",
    "urgent": "Срочный",
}

STATUS_LABELS: dict[str, str] = {
    "backlog": "Бэклог",
    "todo": "К выполнению",
    "in_progress": "В работе",
    "review": "На проверке",
    "done": "Готово",
    "cancelled": "Отменена",
}


def assignee_ids(task: Task) -> list[int]:
    raw = task.assignee_vk_ids or []
    ids: list[int] = []
    for item in raw:
        try:
            vid = int(item)
            if vid not in ids:
                ids.append(vid)
        except (TypeError, ValueError):
            continue
    if task.assignee_vk_id and task.assignee_vk_id not in ids:
        ids.insert(0, task.assignee_vk_id)
    return ids


def format_task_due(task: Task) -> str | None:
    if not task.due_date:
        return None
    if task.due_time:
        return f"{task.due_date.isoformat()}T{task.due_time}"
    return task.due_date.isoformat()


def format_due_display(due_date: date | None, due_time: str | None) -> str:
    if not due_date:
        return ""
    months = (
        "янв",
        "фев",
        "мар",
        "апр",
        "мая",
        "июн",
        "июл",
        "авг",
        "сен",
        "окт",
        "ноя",
        "дек",
    )
    base = f"{due_date.day} {months[due_date.month - 1]} {due_date.year}"
    if due_time:
        return f"{base}, {due_time}"
    return base
