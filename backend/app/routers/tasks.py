"""Tasks CRM endpoints."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from app.config import DEFAULT_SERVER_ID
from app.models.panel import Project, Task, TaskAttachment, TaskComment
from app.services.audit import log_audit
from app.services.auth import require_ca_user
from app.services.display_names import resolve_display_name, resolve_display_names, resolve_vk_photos
from app.services.vk_notify import notify_task_assigned, notify_task_status

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

STATUSES = ["backlog", "todo", "in_progress", "review", "done", "cancelled"]
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


def _assignee_ids(task: Task) -> list[int]:
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

    @field_validator("due_date", mode="before")
    @classmethod
    def _due(cls, v):
        if v is None or v == "":
            return None
        return v


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


def _serialize_task(t: Task) -> dict:
    ids = _assignee_ids(t)
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "task_type": t.task_type,
        "assignee_vk_id": t.assignee_vk_id,
        "assignee_vk_ids": ids,
        "reporter_vk_id": t.reporter_vk_id,
        "project_id": t.project_id,
        "server_id": t.server_id,
        "due_date": _serialize_due(t),
        "labels": _normalize_labels(t.labels),
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
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
    user: dict = Depends(require_ca_user),
):
    qs = Task.filter(server_id=server_id)
    if project_id is not None:
        qs = qs.filter(project_id=project_id)
    if status:
        qs = qs.filter(status=status)
    if priority:
        qs = qs.filter(priority=priority)
    tasks = await qs.order_by("-updated_at")
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
        columns = {s: [] for s in STATUSES}
        for item in items:
            columns.setdefault(item["status"], []).append(item)
        return {"view": "kanban", "columns": columns}
    return {"view": "list", "tasks": items}


@router.post("")
async def create_task(
    body: TaskCreate,
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    if body.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Неверный статус")
    due_d, due_t = _parse_due(body.due_date)
    assignee_ids = body.assignee_vk_ids or ([body.assignee_vk_id] if body.assignee_vk_id else [])
    task = await Task.create(
        title=body.title,
        description=body.description,
        status=body.status,
        priority=body.priority,
        task_type=body.task_type,
        assignee_vk_id=assignee_ids[0] if assignee_ids else None,
        assignee_vk_ids=assignee_ids,
        reporter_vk_id=user["vk_id"],
        project_id=body.project_id,
        server_id=server_id,
        due_date=due_d,
        due_time=due_t,
        labels=_normalize_labels(body.labels),
    )
    for vid in assignee_ids:
        if vid != user["vk_id"]:
            await notify_task_assigned(
                vid, task.id, task.title, user.get("nickname") or str(user["vk_id"])
            )
    await log_audit(user["vk_id"], "task_create", "task", task.id, {"title": task.title})
    return _serialize_task(task)


@router.get("/{task_id}")
async def get_task(task_id: int, user: dict = Depends(require_ca_user)):
    task = await Task.get_or_none(id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
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
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if not _can_edit_task(user, task):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    old_status = task.status
    old_assignees = set(_assignee_ids(task))
    if body.title is not None:
        task.title = body.title
    if body.description is not None:
        task.description = body.description
    if body.status is not None:
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Неверный статус")
        task.status = body.status
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
    await task.save()
    new_assignees = set(_assignee_ids(task))
    for vid in new_assignees - old_assignees:
        await notify_task_assigned(
            vid, task.id, task.title, user.get("nickname") or str(user["vk_id"])
        )
    if task.status != old_status:
        for vid in _assignee_ids(task):
            await notify_task_status(vid, task.id, task.title, task.status)
    await log_audit(user["vk_id"], "task_update", "task", task.id, {"status": task.status})
    return _serialize_task(task)


@router.delete("/{task_id}")
async def delete_task(task_id: int, user: dict = Depends(require_ca_user)):
    if not _can_delete_task(user):
        raise HTTPException(status_code=403, detail="Удалять задачи могут только ЗГС+")
    task = await Task.get_or_none(id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    await TaskComment.filter(task_id=task_id).delete()
    await TaskAttachment.filter(task_id=task_id).delete()
    await task.delete()
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
        raise HTTPException(status_code=404, detail="Задача не найдена")
    comment = await TaskComment.create(
        task=task, author_vk_id=user["vk_id"], body=body.body
    )
    author_name = await resolve_display_name(user["vk_id"])
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
        raise HTTPException(status_code=404, detail="Задача не найдена")
    att = await TaskAttachment.create(task=task, url=body.url, title=body.title)
    return {"id": att.id, "url": att.url, "title": att.title}


@router.delete("/{task_id}/attachments/{attachment_id}")
async def delete_attachment(
    task_id: int,
    attachment_id: int,
    user: dict = Depends(require_ca_user),
):
    task = await Task.get_or_none(id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if not _can_edit_task(user, task):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    att = await TaskAttachment.get_or_none(id=attachment_id, task_id=task_id)
    if not att:
        raise HTTPException(status_code=404, detail="Вложение не найдено")
    await att.delete()
    return {"ok": True}
