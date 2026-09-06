"""Shared task helpers (assignees, due formatting)."""

from __future__ import annotations

import re
from datetime import date

from app.models.panel import Task

MENTION_RE = re.compile(r"@([^\s@,.;:!?]+)")
_NICK_TAG_RE = re.compile(r"^[\[［][^\]］]+[\]］]\s*")

LEGACY_STATUS_MAP = {"backlog": "todo", "review": "in_progress"}
OPEN_TASK_STATUSES = ("todo", "in_progress", "backlog", "review")
KANBAN_STATUSES = ("todo", "in_progress", "done")

PRIORITY_LABELS: dict[str, str] = {
    "low": "Низкий",
    "medium": "Средний",
    "high": "Высокий",
    "urgent": "Срочный",
}

STATUS_LABELS: dict[str, str] = {
    "todo": "К выполнению",
    "in_progress": "В работе",
    "done": "Готово",
    "cancelled": "Отменена",
    "backlog": "К выполнению",
    "review": "В работе",
}

TASK_TYPE_LABELS: dict[str, str] = {
    "assignment": "Поручение",
    "check": "Проверка",
    "report": "Отчёт",
    "bug": "Баг",
}

STATUS_EMOJI: dict[str, str] = {
    "todo": "📌",
    "in_progress": "▶️",
    "done": "✅",
    "cancelled": "🚫",
    "backlog": "📌",
    "review": "▶️",
}


def normalize_task_status(status: str | None) -> str:
    if not status:
        return "todo"
    return LEGACY_STATUS_MAP.get(status, status)


async def migrate_legacy_task_statuses() -> None:
    await Task.filter(status="backlog").update(status="todo")
    await Task.filter(status="review").update(status="in_progress")


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


def task_watchers(task: Task, *, exclude: int | None = None) -> list[int]:
    """Исполнители + постановщик, без автора действия."""
    ids: set[int] = set(assignee_ids(task))
    if task.reporter_vk_id:
        ids.add(int(task.reporter_vk_id))
    if exclude:
        ids.discard(int(exclude))
    return sorted(ids)


def _nick_key(raw: str | None) -> str:
    text = (raw or "").strip().lower()
    if not text:
        return ""
    for _ in range(4):
        next_text = _NICK_TAG_RE.sub("", text).strip()
        if next_text == text:
            break
        text = next_text
    return re.sub(r"[\s_\-]+", "", text)


def mentioned_vk_ids(body: str, staff_rows: list[dict], *, exclude: int | None = None) -> set[int]:
    tokens = [t.strip() for t in MENTION_RE.findall(body or "") if t.strip()]
    if not tokens:
        return set()
    by_id: dict[int, dict] = {}
    by_key: dict[str, list[int]] = {}
    for row in staff_rows:
        try:
            vid = int(row["vk_id"])
        except (KeyError, TypeError, ValueError):
            continue
        by_id[vid] = row
        keys = {
            str(vid),
            _nick_key(row.get("nickname")),
            _nick_key(row.get("bot_nickname")),
            _nick_key(row.get("display_name")),
            _nick_key(row.get("username")),
        }
        for key in keys:
            if key:
                by_key.setdefault(key, []).append(vid)
    found: set[int] = set()
    for token in tokens:
        compact = re.sub(r"[\s_\-]+", "", token.lower())
        if compact.isdigit():
            vid = int(compact)
            if vid in by_id:
                found.add(vid)
            continue
        for vid in by_key.get(compact, []):
            found.add(vid)
    if exclude:
        found.discard(int(exclude))
    return found
