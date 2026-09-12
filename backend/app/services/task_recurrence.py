"""Recurring task schedules and spawn logic."""

from __future__ import annotations

from datetime import date, datetime, timedelta, time
from typing import Any

from app.models.panel import Task, TaskRecurrence
from app.services.staff_spheres import GOV_STRUCTURES
from app.services.task_audience import normalize_audience, resolve_cohort
from app.services.task_helpers import normalize_task_status

FREQ_DAILY = "daily"
FREQ_WEEKLY = "weekly"
FREQ_MONTHLY = "monthly"
FREQ_DATES = "dates"
FREQS = frozenset({FREQ_DAILY, FREQ_WEEKLY, FREQ_MONTHLY, FREQ_DATES})


def _as_int_list(raw: Any) -> list[int]:
    if not isinstance(raw, list):
        return []
    out: list[int] = []
    for item in raw:
        try:
            n = int(item)
        except (TypeError, ValueError):
            continue
        if n not in out:
            out.append(n)
    return out


def _as_date_strings(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        s = str(item or "").strip()[:10]
        if not s:
            continue
        try:
            date.fromisoformat(s)
        except ValueError:
            continue
        if s not in out:
            out.append(s)
    return sorted(out)


def _combine_next_run(d: date, due_time: str | None) -> datetime:
    hh, mm = 0, 0
    if due_time and len(due_time) >= 4:
        try:
            parts = due_time.split(":")
            hh, mm = int(parts[0]), int(parts[1])
        except (TypeError, ValueError, IndexError):
            hh, mm = 0, 0
    return datetime.combine(d, time(hour=hh, minute=mm))


def next_occurrence_on_or_after(rec: TaskRecurrence, start: date) -> date | None:
    """Next occurrence date >= start (inclusive), respecting ends_on."""
    if rec.ends_on and start > rec.ends_on:
        return None
    freq = (rec.freq or FREQ_WEEKLY).strip()
    interval = max(1, int(rec.interval or 1))
    cursor = start

    if freq == FREQ_DATES:
        for raw in _as_date_strings(rec.specific_dates):
            d = date.fromisoformat(raw)
            if d >= start and (not rec.ends_on or d <= rec.ends_on):
                return d
        return None

    # Safety cap to avoid infinite loops on bad configs
    for _ in range(400):
        if rec.ends_on and cursor > rec.ends_on:
            return None

        if freq == FREQ_DAILY:
            # interval days from an anchor = created_at.date() if available
            anchor = rec.created_at.date() if rec.created_at else start
            delta = (cursor - anchor).days
            if delta >= 0 and delta % interval == 0:
                return cursor
            cursor += timedelta(days=1)
            continue

        if freq == FREQ_WEEKLY:
            weekdays = _as_int_list(rec.by_weekday)
            if not weekdays:
                weekdays = [cursor.weekday()]
            if cursor.weekday() in weekdays:
                # interval weeks relative to anchor week
                anchor = rec.created_at.date() if rec.created_at else start
                weeks = (cursor.toordinal() - anchor.toordinal()) // 7
                if weeks >= 0 and weeks % interval == 0:
                    return cursor
            cursor += timedelta(days=1)
            continue

        if freq == FREQ_MONTHLY:
            monthdays = _as_int_list(rec.by_monthday)
            if not monthdays:
                monthdays = [min(cursor.day, 28)]
            # months since anchor
            anchor = rec.created_at.date() if rec.created_at else start
            months = (cursor.year - anchor.year) * 12 + (cursor.month - anchor.month)
            if months >= 0 and months % interval == 0 and cursor.day in monthdays:
                return cursor
            cursor += timedelta(days=1)
            continue

        return None
    return None


async def resolve_assignees_for_recurrence(rec: TaskRecurrence) -> list[int]:
    mode = (rec.assignee_mode or "explicit").strip()
    if mode == "cohort" and rec.audience:
        return await resolve_cohort(rec.server_id, rec.audience)
    ids: list[int] = []
    for vid in rec.assignee_vk_ids or []:
        try:
            n = int(vid)
        except (TypeError, ValueError):
            continue
        if n not in ids:
            ids.append(n)
    return ids


async def spawn_occurrence(rec: TaskRecurrence, occurrence: date) -> Task | None:
    existing = await Task.get_or_none(recurrence_id=rec.id, occurrence_date=occurrence)
    if existing:
        return None

    assignees = await resolve_assignees_for_recurrence(rec)
    due = occurrence + timedelta(days=max(0, int(rec.due_offset_days or 0)))
    task = await Task.create(
        title=rec.title,
        description=rec.description or "",
        status=normalize_task_status("todo"),
        priority=rec.priority or "medium",
        task_type=rec.task_type or "assignment",
        assignee_vk_id=assignees[0] if assignees else None,
        assignee_vk_ids=assignees,
        reporter_vk_id=rec.created_by_vk_id,
        project_id=rec.project_id,
        server_id=rec.server_id,
        sphere=rec.sphere,
        audience=rec.audience,
        recurrence_id=rec.id,
        occurrence_date=occurrence,
        due_date=due,
        due_time=rec.due_time,
        labels=rec.labels if isinstance(rec.labels, list) else [],
    )
    return task


async def advance_recurrence(rec: TaskRecurrence, from_occurrence: date) -> None:
    nxt = next_occurrence_on_or_after(rec, from_occurrence + timedelta(days=1))
    rec.last_spawned_at = datetime.now()
    if nxt is None:
        rec.active = False
        rec.next_run_at = None
    else:
        rec.next_run_at = _combine_next_run(nxt, rec.due_time)
    await rec.save()


async def spawn_due_recurrences(*, now: datetime | None = None) -> int:
    """Spawn all due active recurrences. Returns number of tasks created."""
    now = now or datetime.now()
    rows = await TaskRecurrence.filter(active=True).all()
    created = 0
    for rec in rows:
        search_from = rec.created_at.date() if rec.created_at else now.date()
        last_task = (
            await Task.filter(recurrence_id=rec.id).order_by("-occurrence_date").first()
        )
        if last_task and last_task.occurrence_date:
            search_from = last_task.occurrence_date + timedelta(days=1)

        safety = 0
        while safety < 60:
            safety += 1
            occ = next_occurrence_on_or_after(rec, search_from)
            if occ is None:
                rec.active = False
                rec.next_run_at = None
                await rec.save()
                break

            run_at = _combine_next_run(occ, rec.due_time)
            due_now = occ < now.date() or (
                occ == now.date() and (not rec.due_time or run_at <= now)
            )
            if not due_now:
                rec.next_run_at = run_at
                await rec.save()
                break

            task = await spawn_occurrence(rec, occ)
            if task:
                created += 1

            search_from = occ + timedelta(days=1)
            rec.last_spawned_at = now
            nxt = next_occurrence_on_or_after(rec, search_from)
            if nxt is None:
                rec.active = False
                rec.next_run_at = None
            else:
                rec.next_run_at = _combine_next_run(nxt, rec.due_time)
            await rec.save()
    return created


def serialize_recurrence(rec: TaskRecurrence) -> dict:
    return {
        "id": rec.id,
        "title": rec.title,
        "description": rec.description,
        "priority": rec.priority,
        "task_type": rec.task_type,
        "labels": rec.labels if isinstance(rec.labels, list) else [],
        "project_id": rec.project_id,
        "server_id": rec.server_id,
        "sphere": rec.sphere,
        "audience": rec.audience,
        "assignee_mode": rec.assignee_mode,
        "assignee_vk_ids": list(rec.assignee_vk_ids or []),
        "freq": rec.freq,
        "interval": rec.interval,
        "by_weekday": list(rec.by_weekday or []),
        "by_monthday": list(rec.by_monthday or []),
        "specific_dates": list(rec.specific_dates or []),
        "due_time": rec.due_time,
        "due_offset_days": rec.due_offset_days,
        "active": rec.active,
        "created_by_vk_id": rec.created_by_vk_id,
        "next_run_at": rec.next_run_at.isoformat() if rec.next_run_at else None,
        "last_spawned_at": rec.last_spawned_at.isoformat() if rec.last_spawned_at else None,
        "ends_on": rec.ends_on.isoformat() if rec.ends_on else None,
        "created_at": rec.created_at.isoformat() if rec.created_at else None,
        "updated_at": rec.updated_at.isoformat() if rec.updated_at else None,
    }


def validate_recurrence_payload(
    *,
    freq: str,
    by_weekday: list | None,
    by_monthday: list | None,
    specific_dates: list | None,
    sphere: str,
    audience: str | None,
    assignee_mode: str,
) -> tuple[str, list[int], list[int], list[str], str | None, str]:
    f = (freq or "").strip()
    if f not in FREQS:
        raise ValueError("freq: daily | weekly | monthly | dates")
    weekdays = _as_int_list(by_weekday)
    monthdays = _as_int_list(by_monthday)
    dates = _as_date_strings(specific_dates)
    if f == FREQ_WEEKLY and not weekdays:
        raise ValueError("Укажите дни недели (by_weekday)")
    if f == FREQ_MONTHLY and not monthdays:
        raise ValueError("Укажите числа месяца (by_monthday)")
    if f == FREQ_DATES and not dates:
        raise ValueError("Укажите конкретные даты")
    for d in weekdays:
        if d < 0 or d > 6:
            raise ValueError("by_weekday: 0–6")
    for d in monthdays:
        if d < 1 or d > 31:
            raise ValueError("by_monthday: 1–31")

    mode = (assignee_mode or "explicit").strip()
    if mode not in ("explicit", "cohort"):
        raise ValueError("assignee_mode: explicit | cohort")

    aud = normalize_audience(audience)
    if sphere == GOV_STRUCTURES:
        if not aud:
            raise ValueError("Для госструктур нужна категория (audience)")
        if mode == "cohort" and not aud:
            raise ValueError("cohort требует audience")
    elif aud:
        raise ValueError("Категории доступны только для госструктур")
    elif mode == "cohort":
        raise ValueError("cohort только для госструктур")

    return f, weekdays, monthdays, dates, aud, mode
