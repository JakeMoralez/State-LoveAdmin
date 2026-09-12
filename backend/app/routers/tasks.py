"""Tasks CRM endpoints."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from app.config import DEFAULT_SERVER_ID
from app.models.panel import Project, Task, TaskAttachment, TaskComment, TaskRecurrence
from app.services.audit import log_audit
from app.services.auth import require_ca_user
from app.services import messages
from tortoise.expressions import Q

from app.services.sphere_work import (
    DEFAULT_WORK_SPHERE,
    resolve_work_sphere,
    resolve_work_spheres,
    visible_work_spheres,
    work_item_sphere_filter,
)
from app.services.staff_spheres import GOV_STRUCTURES
from app.services.task_audience import (
    AUDIENCE_LABELS,
    can_manage_gov_audiences,
    normalize_audience,
    resolve_cohort,
    user_own_audience,
    visible_audiences_for_user,
    audiences_payload,
)
from app.services.task_recurrence import (
    next_occurrence_on_or_after,
    serialize_recurrence,
    spawn_due_recurrences,
    validate_recurrence_payload,
    _combine_next_run,
)
from app.services.display_names import resolve_display_name, resolve_display_names, resolve_vk_photos
from app.services.task_helpers import (
    KANBAN_STATUSES,
    PRIORITY_LABELS,
    STATUS_EMOJI,
    STATUS_LABELS,
    assignee_ids as _assignee_ids,
    format_due_display,
    mentioned_vk_ids,
    migrate_legacy_task_statuses,
    normalize_task_status,
    task_watchers,
)
from app.services.vk_notify import (
    format_priority_line,
    format_status_line,
    format_type_line,
    notify_task_assigned,
    notify_task_comment,
    notify_task_event,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

STATUSES = ["todo", "in_progress", "done", "cancelled"]
ACCEPT_STATUSES = [*STATUSES, "backlog", "review"]
PRIORITIES = ["low", "medium", "high", "urgent"]
TASK_TYPES = ["assignment", "check", "report", "bug"]
ZGS_MIN_LEVEL = 3

PRESET_LABEL_COLORS: dict[str, str] = {
    "ца": "#c9a227",
    "гос": "#5b9fd4",
    "нелегалы": "#e85d5d",
    "срочно": "#ff6b35",
    "баг": "#ff4757",
    "гмп": "#a78bfa",
    "форум": "#2ed573",
    "отчёт": "#70a1ff",
    "отчет": "#70a1ff",
}


def _can_delete_task(user: dict) -> bool:
    return int(user.get("access_level") or 0) >= ZGS_MIN_LEVEL


def _can_edit_task(user: dict, task: Task) -> bool:
    if _can_delete_task(user):
        return True
    if user["panel_role"] in ("owner", "lead"):
        return True
    ids = _assignee_ids(task)
    return user["vk_id"] in ids or task.reporter_vk_id == user["vk_id"]


def _task_sphere(task: Task) -> str:
    return getattr(task, "sphere", None) or DEFAULT_WORK_SPHERE


def _user_can_view_task(user: dict, task: Task) -> bool:
    sphere = _task_sphere(task)
    visible = visible_work_spheres(user)
    if sphere not in visible:
        # still allow if assignee/reporter
        uid = user["vk_id"]
        if uid in _assignee_ids(task) or task.reporter_vk_id == uid:
            return True
        return False
    if sphere != GOV_STRUCTURES:
        return True
    allowed = visible_audiences_for_user(user)
    if allowed is None:
        return True
    aud = getattr(task, "audience", None) or None
    if not aud:
        return True
    uid = user["vk_id"]
    if aud in allowed:
        return True
    return uid in _assignee_ids(task) or task.reporter_vk_id == uid


def _filter_gov_audience_tasks(user: dict, tasks: list[Task], audience_filter: str | None) -> list[Task]:
    allowed = visible_audiences_for_user(user)
    out: list[Task] = []
    for t in tasks:
        if _task_sphere(t) != GOV_STRUCTURES:
            out.append(t)
            continue
        aud = getattr(t, "audience", None) or None
        if audience_filter and aud != audience_filter:
            # Non-managers can still see if assigned when filtering another tab? No — respect tab.
            continue
        if allowed is None:
            out.append(t)
            continue
        uid = user["vk_id"]
        if not aud or aud in allowed or uid in _assignee_ids(t) or t.reporter_vk_id == uid:
            out.append(t)
    return out


def _sync_assignees(task: Task, ids: list[int] | None) -> None:
    if ids is None:
        return
    clean = []
    for vid in ids:
        try:
            n = int(vid)
            if n not in clean:
                clean.append(n)
        except (TypeError, ValueError):
            continue
    task.assignee_vk_ids = clean
    task.assignee_vk_id = clean[0] if clean else None


def _label_color(name: str) -> str:
    key = name.strip().lower()
    if key in PRESET_LABEL_COLORS:
        return PRESET_LABEL_COLORS[key]
    h = sum(ord(c) for c in name) % 360
    return f"hsl({h} 55% 52%)"


def _normalize_labels(labels) -> list[dict]:
    if not isinstance(labels, list):
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for item in labels:
        if isinstance(item, str) and item.strip():
            name = item.strip()
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append({"name": name, "color": _label_color(name)})
        elif isinstance(item, dict):
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            color = str(item.get("color") or "").strip() or _label_color(name)
            out.append({"name": name, "color": color})
    return out


async def _task_summaries(task_ids: list[int]) -> dict[int, dict]:
    if not task_ids:
        return {}
    comments = await TaskComment.filter(task_id__in=task_ids).order_by("-created_at")
    attachments = await TaskAttachment.filter(task_id__in=task_ids)
    att_counts: dict[int, int] = defaultdict(int)
    for att in attachments:
        att_counts[att.task_id] += 1
    comment_counts: dict[int, int] = defaultdict(int)
    last_comment: dict[int, TaskComment] = {}
    for c in comments:
        comment_counts[c.task_id] += 1
        if c.task_id not in last_comment:
            last_comment[c.task_id] = c
    last_vk_ids = {c.author_vk_id for c in last_comment.values()}
    names = await resolve_display_names(last_vk_ids)
    photos = await resolve_vk_photos(last_vk_ids)
    out: dict[int, dict] = {}
    for tid in task_ids:
        lc = last_comment.get(tid)
        out[tid] = {
            "comment_count": comment_counts.get(tid, 0),
            "attachment_count": att_counts.get(tid, 0),
            "last_comment_author_vk_id": lc.author_vk_id if lc else None,
            "last_comment_author_name": names.get(lc.author_vk_id) if lc else None,
            "last_comment_author_avatar_url": photos.get(lc.author_vk_id) if lc else None,
        }
    return out


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    description: str = ""
    status: str = "todo"
    priority: str = "medium"
    task_type: str = "assignment"
    assignee_vk_id: int | None = None
    assignee_vk_ids: list[int] = Field(default_factory=list)
    project_id: int | None = None
    due_date: str | date | None = None
    labels: list = []
    sphere: str | None = None
    audience: str | None = None
    expand_cohort: bool = True

    @field_validator("due_date", mode="before")
    @classmethod
    def _due(cls, v):
        if v is None or v == "":
            return None
        return v


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    task_type: str | None = None
    assignee_vk_id: int | None = None
    assignee_vk_ids: list[int] | None = None
    project_id: int | None = None
    due_date: str | date | None = None
    labels: list | None = None
    audience: str | None = None

    @field_validator("due_date", mode="before")
    @classmethod
    def _due(cls, v):
        if v is None or v == "":
            return None
        return v


class RecurrenceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    description: str = ""
    priority: str = "medium"
    task_type: str = "assignment"
    labels: list = []
    project_id: int | None = None
    sphere: str | None = None
    audience: str | None = None
    assignee_mode: str = "cohort"
    assignee_vk_ids: list[int] = Field(default_factory=list)
    freq: str = "weekly"
    interval: int = 1
    by_weekday: list[int] = Field(default_factory=list)
    by_monthday: list[int] = Field(default_factory=list)
    specific_dates: list[str] = Field(default_factory=list)
    due_time: str | None = None
    due_offset_days: int = 0
    ends_on: str | date | None = None
    active: bool = True
    spawn_now: bool = True


class RecurrenceUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    task_type: str | None = None
    labels: list | None = None
    project_id: int | None = None
    audience: str | None = None
    assignee_mode: str | None = None
    assignee_vk_ids: list[int] | None = None
    freq: str | None = None
    interval: int | None = None
    by_weekday: list[int] | None = None
    by_monthday: list[int] | None = None
    specific_dates: list[str] | None = None
    due_time: str | None = None
    due_offset_days: int | None = None
    ends_on: str | date | None = None
    active: bool | None = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1)


class AttachmentCreate(BaseModel):
    url: str
    title: str = ""


def _serialize_due(t: Task) -> str | None:
    if not t.due_date:
        return None
    if t.due_time:
        return f"{t.due_date.isoformat()}T{t.due_time}"
    return t.due_date.isoformat()


def _parse_due(value: str | date | None) -> tuple[date | None, str | None]:
    if value is None:
        return None, None
    if isinstance(value, date):
        return value, None
    raw = value.strip()
    if not raw:
        return None, None
    if "T" in raw:
        date_part, time_part = raw.split("T", 1)
        time_val = time_part[:5] if len(time_part) >= 5 else None
        return date.fromisoformat(date_part), time_val
    return date.fromisoformat(raw), None


def _label_names(labels) -> str:
    names = []
    for item in _normalize_labels(labels):
        name = str(item.get("name") or "").strip()
        if name:
            names.append(name)
    return ", ".join(names) if names else "—"


def _actor_name(user: dict) -> str:
    return str(user.get("nickname") or user.get("vk_id") or "")


async def _notify_assignees(
    vk_ids: list[int] | set[int],
    task: Task,
    actor_name: str,
    *,
    exclude: int | None = None,
) -> None:
    due = format_due_display(task.due_date, task.due_time) if task.due_date else None
    for vid in vk_ids:
        if exclude and vid == exclude:
            continue
        await notify_task_assigned(
            vid,
            task.id,
            task.title,
            actor_name,
            due_display=due,
            priority=task.priority,
        )


def _serialize_task(t: Task) -> dict:
    ids = _assignee_ids(t)
    aud = getattr(t, "audience", None) or None
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": normalize_task_status(t.status),
        "priority": t.priority,
        "task_type": t.task_type,
        "assignee_vk_id": t.assignee_vk_id,
        "assignee_vk_ids": ids,
        "reporter_vk_id": t.reporter_vk_id,
        "project_id": t.project_id,
        "server_id": t.server_id,
        "sphere": getattr(t, "sphere", None) or DEFAULT_WORK_SPHERE,
        "audience": aud,
        "audience_label": AUDIENCE_LABELS.get(aud) if aud else None,
        "recurrence_id": getattr(t, "recurrence_id", None),
        "occurrence_date": t.occurrence_date.isoformat() if getattr(t, "occurrence_date", None) else None,
        "due_date": _serialize_due(t),
        "labels": _normalize_labels(t.labels),
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


@router.get("/audiences")
async def list_task_audiences(user: dict = Depends(require_ca_user)):
    allowed = visible_audiences_for_user(user)
    items = audiences_payload()
    if allowed is not None:
        items = [i for i in items if i["id"] in allowed]
    return {
        "audiences": items,
        "can_manage": can_manage_gov_audiences(user),
        "own_audience": user_own_audience(int(user.get("access_level") or 0)),
    }


@router.get("")
async def list_tasks(
    view: str = Query("list"),
    server_id: int = DEFAULT_SERVER_ID,
    project_id: int | None = None,
    assignee_vk_id: int | None = None,
    status: str | None = None,
    priority: str | None = None,
    mine: bool = False,
    sphere: list[str] | None = Query(default=None),
    audience: str | None = None,
    user: dict = Depends(require_ca_user),
):
    await migrate_legacy_task_statuses()
    spheres = resolve_work_spheres(user, sphere)
    sphere_clause = work_item_sphere_filter(spheres)
    visible_project_ids = await Project.filter(
        server_id=server_id,
    ).filter(sphere_clause).values_list("id", flat=True)
    qs = Task.filter(server_id=server_id).filter(
        sphere_clause | Q(project_id__in=list(visible_project_ids)),
    )
    if project_id is not None:
        qs = qs.filter(project_id=project_id)
    if status:
        qs = qs.filter(status=normalize_task_status(status))
    if priority:
        qs = qs.filter(priority=priority)
    audience_filter = normalize_audience(audience) if audience else None
    tasks = await qs.order_by("-updated_at")
    tasks = _filter_gov_audience_tasks(user, tasks, audience_filter)
    if mine:
        uid = user["vk_id"]
        tasks = [t for t in tasks if uid in _assignee_ids(t)]
    elif assignee_vk_id is not None:
        tasks = [t for t in tasks if assignee_vk_id in _assignee_ids(t)]

    project_ids = {t.project_id for t in tasks if t.project_id}
    project_titles: dict[int, str] = {}
    if project_ids:
        for p in await Project.filter(id__in=list(project_ids)):
            project_titles[p.id] = p.title

    vk_ids = set()
    for t in tasks:
        vk_ids.update(_assignee_ids(t))
        vk_ids.add(t.reporter_vk_id)
    names = await resolve_display_names(vk_ids, server_id)
    summaries = await _task_summaries([t.id for t in tasks])

    def enrich(t: Task) -> dict:
        data = _serialize_task(t)
        if t.project_id:
            data["project_title"] = project_titles.get(t.project_id)
        ids = _assignee_ids(t)
        data["assignee_names"] = [names.get(vid) or f"id{vid}" for vid in ids]
        if ids:
            data["assignee_name"] = data["assignee_names"][0]
        data["reporter_name"] = names.get(t.reporter_vk_id)
        data.update(summaries.get(t.id, {}))
        return data

    items = [enrich(t) for t in tasks]
    if view == "kanban":
        columns = {s: [] for s in KANBAN_STATUSES}
        for item in items:
            columns.setdefault(item["status"], []).append(item)
        return {"view": "kanban", "columns": columns}
    return {"view": "list", "tasks": items}


@router.post("")
async def create_task(
    body: TaskCreate,
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    sphere = resolve_work_sphere(user, body.sphere or sphere)
    if body.status not in ACCEPT_STATUSES:
        raise HTTPException(status_code=400, detail=messages.TASK_BAD_STATUS)

    audience = normalize_audience(body.audience)
    if sphere == GOV_STRUCTURES:
        if not audience:
            raise HTTPException(status_code=400, detail="Выберите категорию для госструктур")
        if not can_manage_gov_audiences(user):
            raise HTTPException(status_code=403, detail="Категорийные задачи создаёт ЗГС+")
    elif audience:
        raise HTTPException(status_code=400, detail="Категории только для госструктур")

    due_d, due_t = _parse_due(body.due_date)
    assignee_ids = body.assignee_vk_ids or ([body.assignee_vk_id] if body.assignee_vk_id else [])
    if audience and body.expand_cohort:
        cohort = await resolve_cohort(server_id, audience)
        # merge unique: cohort + explicit
        merged: list[int] = []
        for vid in cohort + list(assignee_ids):
            if vid not in merged:
                merged.append(vid)
        assignee_ids = merged

    task = await Task.create(
        title=body.title,
        description=body.description,
        status=normalize_task_status(body.status),
        priority=body.priority,
        task_type=body.task_type,
        assignee_vk_id=assignee_ids[0] if assignee_ids else None,
        assignee_vk_ids=assignee_ids,
        reporter_vk_id=user["vk_id"],
        project_id=body.project_id,
        server_id=server_id,
        sphere=sphere,
        audience=audience,
        due_date=due_d,
        due_time=due_t,
        labels=_normalize_labels(body.labels),
    )
    actor_name = _actor_name(user)
    await _notify_assignees(assignee_ids, task, actor_name, exclude=user["vk_id"])
    if not assignee_ids and task.reporter_vk_id != user["vk_id"]:
        await notify_task_event(
            [task.reporter_vk_id],
            task.id,
            task.title,
            f"📋 Создана задача ({actor_name})",
            [format_status_line(task.status), format_priority_line(task.priority)],
        )
    await log_audit(
        user["vk_id"],
        "task_create",
        "task",
        task.id,
        {"title": task.title, "audience": audience, "sphere": sphere},
    )
    return _serialize_task(task)


@router.get("/recurrences")
async def list_recurrences(
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    if not can_manage_gov_audiences(user) and int(user.get("access_level") or 0) < ZGS_MIN_LEVEL:
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    spheres = resolve_work_spheres(user, [sphere] if sphere else None)
    rows = await TaskRecurrence.filter(server_id=server_id, sphere__in=spheres).order_by("-updated_at")
    return {"recurrences": [serialize_recurrence(r) for r in rows]}


@router.post("/recurrences")
async def create_recurrence(
    body: RecurrenceCreate,
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    sphere = resolve_work_sphere(user, body.sphere or sphere)
    if sphere == GOV_STRUCTURES:
        if not can_manage_gov_audiences(user):
            raise HTTPException(status_code=403, detail="Повтор в госструктурах — ЗГС+")
    elif int(user.get("access_level") or 0) < ZGS_MIN_LEVEL and user["panel_role"] not in (
        "owner",
        "lead",
    ):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)

    try:
        freq, weekdays, monthdays, dates, aud, mode = validate_recurrence_payload(
            freq=body.freq,
            by_weekday=body.by_weekday,
            by_monthday=body.by_monthday,
            specific_dates=body.specific_dates,
            sphere=sphere,
            audience=body.audience,
            assignee_mode=body.assignee_mode if sphere == GOV_STRUCTURES else "explicit",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ends_on = None
    if body.ends_on:
        ends_on, _ = _parse_due(body.ends_on)
        ends_on = ends_on  # date only

    from datetime import datetime

    rec = await TaskRecurrence.create(
        title=body.title,
        description=body.description or "",
        priority=body.priority,
        task_type=body.task_type,
        labels=_normalize_labels(body.labels),
        project_id=body.project_id,
        server_id=server_id,
        sphere=sphere,
        audience=aud,
        assignee_mode=mode if sphere == GOV_STRUCTURES else "explicit",
        assignee_vk_ids=body.assignee_vk_ids,
        freq=freq,
        interval=max(1, int(body.interval or 1)),
        by_weekday=weekdays,
        by_monthday=monthdays,
        specific_dates=dates,
        due_time=body.due_time,
        due_offset_days=max(0, int(body.due_offset_days or 0)),
        active=body.active,
        created_by_vk_id=user["vk_id"],
        ends_on=ends_on,
    )
    # set next_run
    nxt = next_occurrence_on_or_after(rec, datetime.now().date())
    rec.next_run_at = _combine_next_run(nxt, rec.due_time) if nxt else None
    if not nxt:
        rec.active = False
    await rec.save()

    spawned = None
    if body.spawn_now and rec.active and nxt and nxt <= datetime.now().date():
        from app.services.task_recurrence import spawn_occurrence, advance_recurrence

        spawned = await spawn_occurrence(rec, nxt)
        await advance_recurrence(rec, nxt)

    await log_audit(user["vk_id"], "task_recurrence_create", "task_recurrence", rec.id, {"title": rec.title})
    payload = serialize_recurrence(rec)
    if spawned:
        payload["spawned_task"] = _serialize_task(spawned)
    return payload


@router.post("/recurrences/run-due")
async def run_due_recurrences(user: dict = Depends(require_ca_user)):
    if user["panel_role"] not in ("owner", "lead") and int(user.get("access_level") or 0) < 8:
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    n = await spawn_due_recurrences()
    return {"spawned": n}


@router.patch("/recurrences/{recurrence_id}")
async def update_recurrence(
    recurrence_id: int,
    body: RecurrenceUpdate,
    user: dict = Depends(require_ca_user),
):
    rec = await TaskRecurrence.get_or_none(id=recurrence_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if rec.sphere == GOV_STRUCTURES and not can_manage_gov_audiences(user):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    if int(user.get("access_level") or 0) < ZGS_MIN_LEVEL and user["panel_role"] not in (
        "owner",
        "lead",
    ):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)

    data = body.model_dump(exclude_unset=True)
    if "labels" in data and data["labels"] is not None:
        data["labels"] = _normalize_labels(data["labels"])
    if "ends_on" in data:
        ends, _ = _parse_due(data["ends_on"])
        data["ends_on"] = ends

    freq = data.get("freq", rec.freq)
    weekdays = data.get("by_weekday", rec.by_weekday)
    monthdays = data.get("by_monthday", rec.by_monthday)
    dates = data.get("specific_dates", rec.specific_dates)
    aud = data.get("audience", rec.audience)
    mode = data.get("assignee_mode", rec.assignee_mode)
    try:
        freq, weekdays, monthdays, dates, aud, mode = validate_recurrence_payload(
            freq=freq,
            by_weekday=weekdays,
            by_monthday=monthdays,
            specific_dates=dates,
            sphere=rec.sphere,
            audience=aud,
            assignee_mode=mode if rec.sphere == GOV_STRUCTURES else "explicit",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for key, value in data.items():
        if key in ("freq", "by_weekday", "by_monthday", "specific_dates", "audience", "assignee_mode"):
            continue
        setattr(rec, key, value)
    rec.freq = freq
    rec.by_weekday = weekdays
    rec.by_monthday = monthdays
    rec.specific_dates = dates
    rec.audience = aud
    rec.assignee_mode = mode if rec.sphere == GOV_STRUCTURES else "explicit"

    from datetime import datetime

    nxt = next_occurrence_on_or_after(rec, datetime.now().date())
    rec.next_run_at = _combine_next_run(nxt, rec.due_time) if nxt else None
    if not nxt and rec.active:
        rec.active = False
    await rec.save()
    await log_audit(user["vk_id"], "task_recurrence_update", "task_recurrence", rec.id, {})
    return serialize_recurrence(rec)


@router.delete("/recurrences/{recurrence_id}")
async def delete_recurrence(recurrence_id: int, user: dict = Depends(require_ca_user)):
    rec = await TaskRecurrence.get_or_none(id=recurrence_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if rec.sphere == GOV_STRUCTURES and not can_manage_gov_audiences(user):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    if int(user.get("access_level") or 0) < ZGS_MIN_LEVEL and user["panel_role"] not in (
        "owner",
        "lead",
    ):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    await rec.delete()
    await log_audit(user["vk_id"], "task_recurrence_delete", "task_recurrence", recurrence_id, {})
    return {"ok": True}


@router.get("/{task_id}")
async def get_task(task_id: int, user: dict = Depends(require_ca_user)):
    task = await Task.get_or_none(id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail=messages.TASK_NOT_FOUND)
    if not _user_can_view_task(user, task):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    comments = await TaskComment.filter(task_id=task_id).order_by("created_at")
    attachments = await TaskAttachment.filter(task_id=task_id)
    project_title = None
    if task.project_id:
        p = await Project.get_or_none(id=task.project_id)
        project_title = p.title if p else None

    vk_ids = {task.reporter_vk_id}
    vk_ids.update(_assignee_ids(task))
    vk_ids |= {c.author_vk_id for c in comments}
    names = await resolve_display_names(vk_ids)
    comment_photos = await resolve_vk_photos({c.author_vk_id for c in comments})

    return {
        **_serialize_task(task),
        "project_title": project_title,
        "assignee_names": [names.get(vid) or f"id{vid}" for vid in _assignee_ids(task)],
        "assignee_name": names.get(task.assignee_vk_id) if task.assignee_vk_id else None,
        "reporter_name": names.get(task.reporter_vk_id),
        "comments": [
            {
                "id": c.id,
                "author_vk_id": c.author_vk_id,
                "author_name": names.get(c.author_vk_id),
                "author_avatar_url": comment_photos.get(c.author_vk_id),
                "body": c.body,
                "created_at": c.created_at.isoformat(),
            }
            for c in comments
        ],
        "attachments": [
            {
                "id": a.id,
                "url": a.url,
                "title": a.title,
                "is_image": a.url.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp"))
                or "/uploads/" in a.url,
            }
            for a in attachments
        ],
    }


@router.patch("/{task_id}")
async def update_task(
    task_id: int,
    body: TaskUpdate,
    user: dict = Depends(require_ca_user),
):
    task = await Task.get_or_none(id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail=messages.TASK_NOT_FOUND)
    if not _can_edit_task(user, task):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)

    old_title = task.title
    old_description = task.description or ""
    old_status = task.status
    old_priority = task.priority
    old_type = task.task_type
    old_assignees = set(_assignee_ids(task))
    old_project_id = task.project_id
    old_due = format_due_display(task.due_date, task.due_time) if task.due_date else ""
    old_labels = _label_names(task.labels)

    if body.title is not None:
        task.title = body.title
    if body.description is not None:
        task.description = body.description
    if body.status is not None:
        if body.status not in ACCEPT_STATUSES:
            raise HTTPException(status_code=400, detail=messages.TASK_BAD_STATUS)
        task.status = normalize_task_status(body.status)
    if body.priority is not None:
        task.priority = body.priority
    if body.task_type is not None:
        task.task_type = body.task_type
    if body.assignee_vk_ids is not None:
        _sync_assignees(task, body.assignee_vk_ids)
    elif body.assignee_vk_id is not None:
        _sync_assignees(task, [body.assignee_vk_id] if body.assignee_vk_id else [])
    if body.project_id is not None:
        task.project_id = body.project_id
    if body.due_date is not None:
        due_d, due_t = _parse_due(body.due_date)
        task.due_date = due_d
        task.due_time = due_t
    if body.labels is not None:
        task.labels = _normalize_labels(body.labels)
    if body.audience is not None:
        if _task_sphere(task) != GOV_STRUCTURES:
            raise HTTPException(status_code=400, detail="Категории только для госструктур")
        if not can_manage_gov_audiences(user):
            raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
        task.audience = normalize_audience(body.audience)
    await task.save()

    new_assignees = set(_assignee_ids(task))
    actor_name = _actor_name(user)
    actor_id = user["vk_id"]
    added = new_assignees - old_assignees
    removed = old_assignees - new_assignees
    await _notify_assignees(added, task, actor_name, exclude=actor_id)
    if removed:
        await notify_task_event(
            removed - {actor_id},
            task.id,
            task.title,
            f"👤 Вас сняли с задачи ({actor_name})",
        )

    details: list[str] = []
    if task.status != old_status:
        details.append(f"{format_status_line(old_status)} → {STATUS_LABELS.get(task.status, task.status)}")
    if task.priority != old_priority:
        details.append(
            f"{format_priority_line(old_priority)} → {PRIORITY_LABELS.get(task.priority, task.priority)}"
        )
    if (task.task_type or "assignment") != (old_type or "assignment"):
        details.append(format_type_line(task.task_type or "assignment"))
    if task.title != old_title:
        details.append(f"Название: {old_title} → {task.title}")
    if (task.description or "") != old_description:
        details.append("Описание обновлено")
    new_due = format_due_display(task.due_date, task.due_time) if task.due_date else ""
    if new_due != old_due:
        details.append(f"Срок: {old_due or 'без срока'} → {new_due or 'без срока'}")
    new_labels = _label_names(task.labels)
    if new_labels != old_labels:
        details.append(f"Метки: {new_labels}")
    if task.project_id != old_project_id:
        if task.project_id:
            project = await Project.get_or_none(id=task.project_id)
            details.append(f"Проект: {project.title if project else f'#{task.project_id}'}")
        else:
            details.append("Проект снят")
    if added or removed:
        names = await resolve_display_names(new_assignees)
        if new_assignees:
            details.append(
                "Исполнители: "
                + ", ".join(names.get(vid) or f"id{vid}" for vid in sorted(new_assignees))
            )
        else:
            details.append("Исполнители: не назначен")

    watchers = set(task_watchers(task, exclude=actor_id)) | (removed - {actor_id})
    watchers -= added
    if details and watchers:
        headline = f"📋 Задача обновлена ({actor_name})"
        if len(details) == 1 and task.status != old_status:
            emoji = STATUS_EMOJI.get(task.status, "📋")
            headline = f"{emoji} Задача — {STATUS_LABELS.get(task.status, task.status)} ({actor_name})"
        await notify_task_event(watchers, task.id, task.title, headline, details)

    await log_audit(user["vk_id"], "task_update", "task", task.id, {"status": task.status})
    return _serialize_task(task)


@router.delete("/{task_id}")
async def delete_task(task_id: int, user: dict = Depends(require_ca_user)):
    if not _can_delete_task(user):
        raise HTTPException(status_code=403, detail=messages.TASK_DELETE_FORBIDDEN)
    task = await Task.get_or_none(id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail=messages.TASK_NOT_FOUND)
    watchers = task_watchers(task, exclude=user["vk_id"])
    title = task.title
    task_pk = task.id
    await TaskComment.filter(task_id=task_id).delete()
    await TaskAttachment.filter(task_id=task_id).delete()
    await task.delete()
    if watchers:
        await notify_task_event(
            watchers,
            task_pk,
            title,
            f"🗑 Задача удалена ({_actor_name(user)})",
            with_link=False,
        )
    await log_audit(user["vk_id"], "task_delete", "task", task_id, {})
    return {"ok": True}


@router.post("/{task_id}/comments")
async def add_comment(
    task_id: int,
    body: CommentCreate,
    user: dict = Depends(require_ca_user),
):
    task = await Task.get_or_none(id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail=messages.TASK_NOT_FOUND)
    if not _user_can_view_task(user, task):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    comment = await TaskComment.create(
        task=task, author_vk_id=user["vk_id"], body=body.body
    )
    author_name = await resolve_display_name(user["vk_id"])
    from app.services.staff import list_staff

    staff_rows = await list_staff(int(user.get("server_id") or DEFAULT_SERVER_ID))
    mentioned = mentioned_vk_ids(body.body, staff_rows, exclude=user["vk_id"])
    notify_targets = set(task_watchers(task, exclude=user["vk_id"])) | mentioned
    for vid in notify_targets:
        await notify_task_comment(
            vid,
            task.id,
            task.title,
            author_name or str(user["vk_id"]),
            body.body,
        )
    return {
        "id": comment.id,
        "author_vk_id": comment.author_vk_id,
        "author_name": author_name,
        "body": comment.body,
        "created_at": comment.created_at.isoformat(),
    }


@router.post("/{task_id}/attachments")
async def add_attachment(
    task_id: int,
    body: AttachmentCreate,
    user: dict = Depends(require_ca_user),
):
    task = await Task.get_or_none(id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail=messages.TASK_NOT_FOUND)
    if not _user_can_view_task(user, task):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    att = await TaskAttachment.create(task=task, url=body.url, title=body.title)
    watchers = task_watchers(task, exclude=user["vk_id"])
    if watchers:
        label = (body.title or "").strip() or "файл"
        await notify_task_event(
            watchers,
            task.id,
            task.title,
            f"📎 Вложение добавлено ({_actor_name(user)})",
            [label],
        )
    return {"id": att.id, "url": att.url, "title": att.title}


@router.delete("/{task_id}/attachments/{attachment_id}")
async def delete_attachment(
    task_id: int,
    attachment_id: int,
    user: dict = Depends(require_ca_user),
):
    task = await Task.get_or_none(id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail=messages.TASK_NOT_FOUND)
    if not _can_edit_task(user, task):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    att = await TaskAttachment.get_or_none(id=attachment_id, task_id=task_id)
    if not att:
        raise HTTPException(status_code=404, detail=messages.ATTACHMENT_NOT_FOUND)
    att_title = (att.title or "").strip() or "файл"
    await att.delete()
    watchers = task_watchers(task, exclude=user["vk_id"])
    if watchers:
        await notify_task_event(
            watchers,
            task.id,
            task.title,
            f"📎 Вложение удалено ({_actor_name(user)})",
            [att_title],
        )
    return {"ok": True}
