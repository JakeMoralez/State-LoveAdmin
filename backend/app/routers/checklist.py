"""Weekly staff checklist."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import DEFAULT_SERVER_ID
from app.models.bot import AccessLevel
from app.models.panel import (
    ChecklistCell,
    ChecklistMember,
    ChecklistTaskDef,
    ChecklistWeekMember,
    ChecklistWeekTask,
    Task,
)
from app.routers.uploads import gallery_image_urls, is_gallery_url
from app.services.auth import require_ca_user
from app.services.display_names import resolve_display_names
from app.services.sphere_work import DEFAULT_WORK_SPHERE, resolve_work_sphere, visible_work_spheres
from app.services.staff import list_staff

router = APIRouter(prefix="/api/checklist", tags=["checklist"])

DEFAULT_CHECKLIST_TASKS = [
    {"slug": "daily_watch", "title": "Ежедневная слежка за составом", "header": True},
    {"slug": "lawsuit", "title": "Проверка судебного иска"},
    {"slug": "discord", "title": "Общение в ДС с составом"},
    {"slug": "situations", "title": "Разборки и ситуации"},
    {"slug": "rp_train", "title": "РП/Трена составом"},
    {"slug": "forum", "title": "Проверка форума / NRP ники / Актуальность досок"},
]

DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

CHECKLIST_EDIT_OTHERS_MIN_LEVEL = 3  # ЗГС+
CHECKLIST_MANAGE_MIN_LEVEL = 3


def _portal_staff(member: dict) -> bool:
    if not member:
        return False
    return int(member.get("access_level") or 0) >= AccessLevel.PGS


_has_ca_access = _portal_staff


def _member_eligible_for_sphere(member: dict | None, sphere: str) -> bool:
    if not member or not _portal_staff(member):
        return False
    return sphere in visible_work_spheres({"spheres": member.get("spheres") or []})


def _can_manage_checklist(user: dict) -> bool:
    return int(user.get("access_level") or 0) >= CHECKLIST_MANAGE_MIN_LEVEL


def _can_edit_member(user: dict, member_vk_id: int) -> bool:
    if user["vk_id"] == member_vk_id:
        return True
    return int(user.get("access_level") or 0) >= CHECKLIST_EDIT_OTHERS_MIN_LEVEL


class CellUpdate(BaseModel):
    proof_urls: list[str] = Field(default_factory=list)
    proof_url: str | None = None
    proof_note: str = ""
    proof_video_url: str | None = None


def _normalize_video_url(url: str | None) -> str | None:
    value = (url or "").strip()
    return value[:1024] if value else None


def _normalize_proof_urls(raw: list[str] | None, legacy: str | None = None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in raw or []:
        url = (item or "").strip()
        if not url or url in seen or is_gallery_url(url):
            continue
        seen.add(url)
        out.append(url[:1024])
    legacy_url = (legacy or "").strip()
    if legacy_url and not is_gallery_url(legacy_url) and legacy_url not in seen:
        out.insert(0, legacy_url[:1024])
    return out[:30]


def _read_cell_proof_urls(cell: ChecklistCell | None) -> list[str]:
    if not cell:
        return []
    raw = getattr(cell, "proof_urls", None)
    if isinstance(raw, list) and raw:
        urls = [str(u).strip() for u in raw if str(u).strip() and not is_gallery_url(str(u))]
        if urls:
            return urls
    if cell.proof_url and is_gallery_url(cell.proof_url):
        return gallery_image_urls(cell.proof_url)
    if cell.proof_url and not is_gallery_url(cell.proof_url):
        return [cell.proof_url]
    return []


def _cell_is_done(cell: ChecklistCell | None) -> bool:
    if not cell:
        return False
    if (cell.proof_note or "").strip():
        return True
    if _normalize_video_url(getattr(cell, "proof_video_url", None)):
        return True
    if cell.proof_url and is_gallery_url(cell.proof_url):
        return True
    return bool(cell.proof_url or _read_cell_proof_urls(cell))


def _cell_gallery_payload(cell: ChecklistCell | None) -> dict:
    if not cell or not is_gallery_url(cell.proof_url):
        return {"proof_gallery": False, "proof_gallery_url": None, "proof_image_count": 0}
    images = _read_cell_proof_urls(cell)
    return {
        "proof_gallery": True,
        "proof_gallery_url": cell.proof_url,
        "proof_image_count": len(images),
    }


class TaskItemIn(BaseModel):
    slug: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=256)
    is_header: bool = False
    days_of_week: list[int] = Field(default_factory=lambda: list(range(7)))


class TasksUpdate(BaseModel):
    tasks: list[TaskItemIn]


class MembersUpdate(BaseModel):
    vk_ids: list[int] = Field(default_factory=list)


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _normalize_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return value


def _current_week_start() -> date:
    return _monday(date.today())


def _is_past_week(week_start: date) -> bool:
    return _normalize_date(week_start) < _current_week_start()


async def _mutable_week_starts(server_id: int, sphere: str) -> set[date]:
    """Недели, которые можно обновлять из шаблона: текущая и будущие."""
    current = _current_week_start()
    out = {current}
    rows = await ChecklistWeekTask.filter(server_id=server_id, sphere=sphere, week_start__gte=current).only(
        "week_start"
    )
    for row in rows:
        out.add(_normalize_date(row.week_start))
    return out


def _slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9а-яё]+", "-", title.lower().strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return (s[:48] or f"task-{uuid.uuid4().hex[:8]}")


ALL_DAYS = list(range(7))


def _normalize_days(days: list[int] | None) -> list[int]:
    if not days:
        return ALL_DAYS.copy()
    out = sorted({d for d in days if 0 <= d <= 6})
    return out or ALL_DAYS.copy()


def _days_to_str(days: list[int]) -> str:
    return ",".join(str(d) for d in _normalize_days(days))


def _days_from_str(raw: str | None) -> list[int]:
    if not raw or not raw.strip():
        return ALL_DAYS.copy()
    out: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            n = int(part)
            if 0 <= n <= 6:
                out.append(n)
    return sorted(set(out)) or ALL_DAYS.copy()


async def _prune_ineligible_members(server_id: int, staff: list[dict], sphere: str) -> None:
    """Убрать из состава тех, кто не следит за этой сферой."""
    staff_by_id = {m["vk_id"]: m for m in staff}
    rows = list(await ChecklistMember.filter(server_id=server_id, sphere=sphere).order_by("sort_order", "id"))
    remove_ids = [
        row.id
        for row in rows
        if not _member_eligible_for_sphere(staff_by_id.get(row.vk_id), sphere)
    ]
    if remove_ids:
        await ChecklistMember.filter(id__in=remove_ids).delete()


async def _ensure_task_defs(server_id: int, sphere: str) -> list[ChecklistTaskDef]:
    existing = await ChecklistTaskDef.filter(server_id=server_id, sphere=sphere).order_by("sort_order", "id")
    if existing:
        return list(existing)
    created: list[ChecklistTaskDef] = []
    for i, t in enumerate(DEFAULT_CHECKLIST_TASKS):
        row = await ChecklistTaskDef.create(
            server_id=server_id,
            sphere=sphere,
            slug=t["slug"],
            title=t["title"],
            is_header=bool(t.get("header", False)),
            sort_order=i,
            days_of_week=_days_to_str(ALL_DAYS),
        )
        created.append(row)
    return created


async def _ensure_week_snapshot(server_id: int, week_start: date, staff: list[dict], sphere: str) -> None:
    week_start = _normalize_date(week_start)
    if await ChecklistWeekTask.filter(server_id=server_id, sphere=sphere, week_start=week_start).exists():
        return
    task_defs = await _ensure_task_defs(server_id, sphere)
    member_rows = await ChecklistMember.filter(server_id=server_id, sphere=sphere).order_by("sort_order", "id")
    for t in task_defs:
        await ChecklistWeekTask.create(
            server_id=server_id,
            sphere=sphere,
            week_start=week_start,
            slug=t.slug,
            title=t.title,
            is_header=t.is_header,
            sort_order=t.sort_order,
            days_of_week=getattr(t, "days_of_week", None) or _days_to_str(ALL_DAYS),
        )
    for row in member_rows:
        await ChecklistWeekMember.create(
            server_id=server_id,
            sphere=sphere,
            week_start=week_start,
            vk_id=row.vk_id,
            sort_order=row.sort_order,
        )


async def _template_member_rows(server_id: int, sphere: str) -> list[ChecklistMember]:
    return list(await ChecklistMember.filter(server_id=server_id, sphere=sphere).order_by("sort_order", "id"))


async def _week_member_rows(server_id: int, week_start: date, sphere: str) -> list[ChecklistWeekMember]:
    return list(
        await ChecklistWeekMember.filter(server_id=server_id, sphere=sphere, week_start=week_start).order_by(
            "sort_order", "id"
        )
    )



async def _replace_week_tasks_from_template(server_id: int, week_start: date, sphere: str) -> None:
    week_start = _normalize_date(week_start)
    if _is_past_week(week_start):
        return
    task_defs = await _ensure_task_defs(server_id, sphere)
    await ChecklistWeekTask.filter(server_id=server_id, sphere=sphere, week_start=week_start).delete()
    for t in task_defs:
        await ChecklistWeekTask.create(
            server_id=server_id,
            sphere=sphere,
            week_start=week_start,
            slug=t.slug,
            title=t.title,
            is_header=t.is_header,
            sort_order=t.sort_order,
            days_of_week=getattr(t, "days_of_week", None) or _days_to_str(ALL_DAYS),
        )


async def _sync_tasks_to_current_and_future_weeks(server_id: int, sphere: str) -> None:
    for week_start in await _mutable_week_starts(server_id, sphere):
        await _replace_week_tasks_from_template(server_id, week_start, sphere)


async def _replace_week_members_from_template(server_id: int, week_start: date, sphere: str) -> None:
    week_start = _normalize_date(week_start)
    if _is_past_week(week_start):
        return
    template_rows = await _template_member_rows(server_id, sphere)
    await ChecklistWeekMember.filter(server_id=server_id, sphere=sphere, week_start=week_start).delete()
    for row in template_rows:
        await ChecklistWeekMember.create(
            server_id=server_id,
            sphere=sphere,
            week_start=week_start,
            vk_id=row.vk_id,
            sort_order=row.sort_order,
        )


async def _bootstrap_week_members_if_empty(server_id: int, week_start: date, sphere: str) -> None:
    """Только для текущей/будущей недели: заполнить пустой снимок из шаблона."""
    week_start = _normalize_date(week_start)
    if _is_past_week(week_start):
        return
    if await ChecklistWeekMember.filter(server_id=server_id, sphere=sphere, week_start=week_start).exists():
        return
    if not await _template_member_rows(server_id, sphere):
        return
    await _replace_week_members_from_template(server_id, week_start, sphere)


async def _sync_members_to_current_and_future_weeks(server_id: int, staff: list[dict], sphere: str) -> None:
    for week_start in await _mutable_week_starts(server_id, sphere):
        await _ensure_week_snapshot(server_id, week_start, staff, sphere)
        await _replace_week_members_from_template(server_id, week_start, sphere)


async def _week_task_defs(server_id: int, week_start: date, staff: list[dict], sphere: str) -> list[ChecklistWeekTask]:
    await _ensure_week_snapshot(server_id, week_start, staff, sphere)
    return list(
        await ChecklistWeekTask.filter(server_id=server_id, sphere=sphere, week_start=week_start).order_by(
            "sort_order", "id"
        )
    )


async def _build_checklist_member_payload(
    rows: list[ChecklistMember] | list[ChecklistWeekMember],
    staff: list[dict],
    server_id: int,
    sphere: str,
    *,
    frozen: bool = False,
) -> list[dict]:
    if not rows:
        return []
    staff_by_id = {m["vk_id"]: m for m in staff}
    if frozen:
        vk_ids = {r.vk_id for r in rows}
    else:
        vk_ids = {
            r.vk_id
            for r in rows
            if _member_eligible_for_sphere(staff_by_id.get(r.vk_id), sphere)
        }
    if not vk_ids:
        return []
    names = await resolve_display_names(vk_ids, server_id)
    out: list[dict] = []
    for r in rows:
        if r.vk_id not in vk_ids:
            continue
        m = staff_by_id.get(r.vk_id)
        if m:
            display_name = names.get(r.vk_id, m["nickname"])
            access_level = m["access_level"]
            access_level_name = m["access_level_name"]
        else:
            display_name = names.get(r.vk_id, f"id{r.vk_id}")
            access_level = 0
            access_level_name = ""
        out.append(
            {
                "vk_id": r.vk_id,
                "display_name": display_name,
                "access_level": access_level,
                "access_level_name": access_level_name,
            }
        )
    return out


async def _week_checklist_members(server_id: int, week_start: date, staff: list[dict], sphere: str) -> list[dict]:
    week_start = _normalize_date(week_start)
    await _ensure_week_snapshot(server_id, week_start, staff, sphere)
    if not _is_past_week(week_start):
        await _bootstrap_week_members_if_empty(server_id, week_start, sphere)
    rows = await _week_member_rows(server_id, week_start, sphere)
    return await _build_checklist_member_payload(
        rows, staff, server_id, sphere, frozen=_is_past_week(week_start)
    )


async def _checklist_members(server_id: int, staff: list[dict], sphere: str) -> list[dict]:
    rows = await _template_member_rows(server_id, sphere)
    return await _build_checklist_member_payload(rows, staff, server_id, sphere)


@router.get("/settings")
async def get_checklist_settings(
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    sphere = resolve_work_sphere(user, sphere)
    staff = await list_staff(server_id)
    await _prune_ineligible_members(server_id, staff, sphere)
    tasks = await _ensure_task_defs(server_id, sphere)
    members = await _checklist_members(server_id, staff, sphere)
    member_ids = {m["vk_id"] for m in members}
    candidates: list[dict] = []
    for m in staff:
        if not _member_eligible_for_sphere(m, sphere):
            continue
        candidates.append(
            {
                "vk_id": m["vk_id"],
                "display_name": m.get("display_name") or m["nickname"],
                "access_level": m["access_level"],
                "access_level_name": m["access_level_name"],
                "has_ca_access": bool(m.get("has_ca_access")),
                "in_checklist": m["vk_id"] in member_ids,
                "is_self": m["vk_id"] == user["vk_id"],
            }
        )

    return {
        "tasks": [
            {
                "slug": t.slug,
                "title": t.title,
                "is_header": t.is_header,
                "sort_order": t.sort_order,
                "days_of_week": _days_from_str(getattr(t, "days_of_week", None)),
            }
            for t in tasks
        ],
        "members": members,
        "candidates": candidates,
        "current_vk_id": user["vk_id"],
        "can_manage": _can_manage_checklist(user),
        "can_edit_all": _can_manage_checklist(user),
        "template_note": "Прошлые недели фиксируются. Текущая и будущие обновляются при сохранении настроек.",
    }


@router.put("/tasks")
async def update_checklist_tasks(
    body: TasksUpdate,
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    sphere = resolve_work_sphere(user, sphere)
    if not _can_manage_checklist(user):
        raise HTTPException(status_code=403, detail="Задачи чеклиста настраивает только ЗГС ЦА+")

    if not body.tasks:
        raise HTTPException(status_code=400, detail="Нужна хотя бы одна задача")

    slugs = [t.slug for t in body.tasks]
    if len(slugs) != len(set(slugs)):
        raise HTTPException(status_code=400, detail="Дублирующиеся slug задач")

    await ChecklistTaskDef.filter(server_id=server_id, sphere=sphere).delete()
    for i, t in enumerate(body.tasks):
        slug = t.slug.strip() or _slugify(t.title)
        days = _normalize_days(t.days_of_week)
        await ChecklistTaskDef.create(
            server_id=server_id,
            sphere=sphere,
            slug=slug,
            title=t.title.strip(),
            is_header=t.is_header,
            sort_order=i,
            days_of_week=_days_to_str(days),
        )
    await _sync_tasks_to_current_and_future_weeks(server_id, sphere)
    return {"ok": True}


@router.put("/members/only-me")
@router.post("/members/only-me")
async def checklist_members_only_me(
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    sphere = resolve_work_sphere(user, sphere)
    """Личная колонка — любой уровень с доступом ЦА."""
    await ChecklistMember.filter(server_id=server_id, sphere=sphere).delete()
    await ChecklistMember.create(
        server_id=server_id,
        sphere=sphere,
        vk_id=user["vk_id"],
        sort_order=0,
    )
    staff = await list_staff(server_id)
    await _sync_members_to_current_and_future_weeks(server_id, staff, sphere)
    return {"ok": True, "vk_id": user["vk_id"]}


@router.put("/members")
async def update_checklist_members(
    body: MembersUpdate,
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    sphere = resolve_work_sphere(user, sphere)
    staff = await list_staff(server_id)
    staff_by_id = {m["vk_id"]: m for m in staff}
    manage = _can_manage_checklist(user)
    self_only = not manage and body.vk_ids == [user["vk_id"]]

    if not manage and not self_only:
        raise HTTPException(
            status_code=403,
            detail="Состав колонок настраивает только ЗГС ЦА+. Используйте «Только моя колонка».",
        )

    vk_ids = body.vk_ids
    if manage:
        vk_ids = [vid for vid in body.vk_ids if _member_eligible_for_sphere(staff_by_id.get(vid), sphere)]

    if not vk_ids:
        raise HTTPException(status_code=400, detail="Выберите хотя бы одного следящего для этой сферы")

    for vk_id in vk_ids:
        m = staff_by_id.get(vk_id)
        if not m:
            raise HTTPException(status_code=400, detail=f"Пользователь id{vk_id} не найден")
        if self_only:
            if vk_id != user["vk_id"]:
                raise HTTPException(status_code=400, detail="Можно включить только свою колонку")
            if not _portal_staff(user):
                raise HTTPException(status_code=400, detail="Нужен уровень ПГС+")
            continue
        if not _member_eligible_for_sphere(m, sphere):
            raise HTTPException(
                status_code=400,
                detail=f"{m['nickname']}: нет доступа к этой сфере",
            )

    await ChecklistMember.filter(server_id=server_id, sphere=sphere).delete()
    for i, vk_id in enumerate(vk_ids):
        await ChecklistMember.create(server_id=server_id, sphere=sphere, vk_id=vk_id, sort_order=i)
    await _sync_members_to_current_and_future_weeks(server_id, staff, sphere)
    return {"ok": True, "count": len(vk_ids)}


@router.get("")
async def get_checklist(
    week: str = Query(..., description="YYYY-MM-DD любой день недели"),
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    sphere = resolve_work_sphere(user, sphere)
    week_start = _monday(date.fromisoformat(week))
    locked = _is_past_week(week_start)
    staff = await list_staff(server_id)
    if not locked:
        await _prune_ineligible_members(server_id, staff, sphere)
    task_defs = await _week_task_defs(server_id, week_start, staff, sphere)
    members = await _week_checklist_members(server_id, week_start, staff, sphere)
    can_edit_all = int(user.get("access_level") or 0) >= CHECKLIST_EDIT_OTHERS_MIN_LEVEL

    cells = await ChecklistCell.filter(server_id=server_id, sphere=sphere, week_start=week_start)
    cell_map = {(c.day_offset, c.task_slug, c.member_vk_id): c for c in cells}

    grid: list[dict] = []
    for day in range(7):
        day_date = week_start + timedelta(days=day)
        for task in task_defs:
            task_days = _days_from_str(task.days_of_week)
            if day not in task_days:
                continue
            row = {
                "day_offset": day,
                "day_date": day_date.isoformat(),
                "day_label": f"{DAY_NAMES[day]} {day_date.strftime('%d.%m')}",
                "task_slug": task.slug,
                "task_title": task.title,
                "is_header": task.is_header,
                "cells": [],
            }
            for m in members:
                key = (day, task.slug, m["vk_id"])
                c = cell_map.get(key)
                row["cells"].append(
                    {
                        "id": c.id if c else None,
                        "member_vk_id": m["vk_id"],
                        "member_name": m["display_name"],
                        "proof_urls": _read_cell_proof_urls(c),
                        "proof_url": c.proof_url if c else None,
                        "proof_note": c.proof_note if c else "",
                        "proof_video_url": _normalize_video_url(getattr(c, "proof_video_url", None)) if c else None,
                        "done": _cell_is_done(c),
                        "can_edit": (not locked) and _can_edit_member(user, m["vk_id"]),
                        **_cell_gallery_payload(c),
                    }
                )
            grid.append(row)

    return {
        "week_start": week_start.isoformat(),
        "week_end": (week_start + timedelta(days=6)).isoformat(),
        "members": members,
        "tasks": [
            {
                "slug": t.slug,
                "title": t.title,
                "is_header": t.is_header,
                "days_of_week": _days_from_str(task.days_of_week),
            }
            for t in task_defs
        ],
        "rows": grid,
        "current_vk_id": user["vk_id"],
        "can_edit_all": can_edit_all,
        "is_snapshot": True,
        "is_locked": locked,
    }


@router.patch("/cells")
async def upsert_cell(
    body: CellUpdate = Body(),
    week: str = Query(...),
    day_offset: int = Query(..., ge=0, le=6),
    task_slug: str = Query(...),
    member_vk_id: int = Query(...),
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    sphere = resolve_work_sphere(user, sphere)
    week_start = _monday(date.fromisoformat(week))
    if _is_past_week(week_start):
        raise HTTPException(status_code=403, detail="Прошлая неделя зафиксирована — редактирование недоступно")

    staff = await list_staff(server_id)
    task_defs = await _week_task_defs(server_id, week_start, staff, sphere)
    valid_slugs = {t.slug for t in task_defs}
    if task_slug not in valid_slugs:
        raise HTTPException(status_code=400, detail="Неизвестная задача")
    task_row = next(t for t in task_defs if t.slug == task_slug)
    if day_offset not in _days_from_str(task_row.days_of_week):
        raise HTTPException(status_code=400, detail="Задача не назначена на этот день")

    members = await _week_checklist_members(server_id, week_start, staff, sphere)
    if member_vk_id not in {m["vk_id"] for m in members}:
        raise HTTPException(status_code=400, detail="Пользователь не в чеклисте")

    if not _can_edit_member(user, member_vk_id):
        raise HTTPException(status_code=403, detail="Можно заполнять только свою колонку")

    cell, _ = await ChecklistCell.get_or_create(
        server_id=server_id,
        sphere=sphere,
        week_start=week_start,
        day_offset=day_offset,
        task_slug=task_slug,
        member_vk_id=member_vk_id,
        defaults={"updated_by": user["vk_id"]},
    )
    gallery_url = (body.proof_url or "").strip() if body.proof_url and is_gallery_url(body.proof_url) else None
    if gallery_url:
        cell.proof_url = gallery_url[:1024]
        cell.proof_urls = _normalize_proof_urls(body.proof_urls, None)
    else:
        cell.proof_urls = _normalize_proof_urls(body.proof_urls, body.proof_url)
        cell.proof_url = cell.proof_urls[0] if cell.proof_urls else None
    cell.proof_note = body.proof_note
    cell.proof_video_url = _normalize_video_url(body.proof_video_url)
    cell.updated_by = user["vk_id"]
    await cell.save()
    return {"ok": True, "id": cell.id}


@router.post("/generate-tasks")
async def generate_week_tasks(
    week: str = Query(...),
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    sphere = resolve_work_sphere(user, sphere)
    if not _can_manage_checklist(user):
        raise HTTPException(status_code=403, detail="Создание задач из чеклиста — только для ЗГС ЦА+")

    week_start = _monday(date.fromisoformat(week))
    cells = await ChecklistCell.filter(server_id=server_id, sphere=sphere, week_start=week_start)
    task_defs = await _ensure_task_defs(server_id, sphere)
    task_titles = {t.slug: t.title for t in task_defs}
    created = 0

    for cell in cells:
        if not _cell_is_done(cell):
            continue
        urls = _read_cell_proof_urls(cell)
        title = task_titles.get(cell.task_slug, cell.task_slug)
        day = week_start + timedelta(days=cell.day_offset)
        desc_parts = [f"Чеклист {day.strftime('%d.%m.%Y')}"]
        if cell.proof_note:
            desc_parts.append(cell.proof_note)
        video_url = _normalize_video_url(getattr(cell, "proof_video_url", None))
        if video_url:
            desc_parts.append(video_url)
        if cell.proof_url and is_gallery_url(cell.proof_url):
            desc_parts.append(cell.proof_url)
        else:
            desc_parts.extend(urls)

        await Task.create(
            title=f"[Чеклист] {title}",
            description="\n".join(desc_parts),
            status="done" if (urls or is_gallery_url(cell.proof_url) or video_url) else "review",
            priority="medium",
            task_type="check",
            assignee_vk_id=cell.member_vk_id,
            reporter_vk_id=user["vk_id"],
            server_id=server_id,
            sphere=sphere,
            due_date=day,
            labels=["чеклист", cell.task_slug],
        )
        created += 1

    return {"ok": True, "created": created}
