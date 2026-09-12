"""Dashboard summary."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from tortoise.expressions import Q

from app.config import DEFAULT_SERVER_ID
from app.models.panel import Project, Task
from app.services.auth import require_ca_user
from app.services.sphere_work import resolve_work_spheres, work_item_sphere_filter
from app.services.staff import list_staff
from app.services.task_helpers import assignee_ids, normalize_task_status

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def dashboard_summary(
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    vk_id = user["vk_id"]
    open_statuses = ["todo", "in_progress", "backlog", "review"]
    spheres = resolve_work_spheres(user, None)
    sphere_clause = work_item_sphere_filter(spheres)
    visible_project_ids = await Project.filter(server_id=server_id).filter(sphere_clause).values_list(
        "id", flat=True
    )
    open_tasks = (
        await Task.filter(server_id=server_id, status__in=open_statuses)
        .filter(sphere_clause | Q(project_id__in=list(visible_project_ids)))
        .all()
    )
    today = date.today()
    my_open = 0
    overdue = 0
    for t in open_tasks:
        ids = assignee_ids(t)
        if vk_id not in ids and t.assignee_vk_id != vk_id:
            continue
        my_open += 1
        if t.due_date and t.due_date < today and normalize_task_status(t.status) not in (
            "done",
            "cancelled",
        ):
            overdue += 1

    active_projects = await Project.filter(server_id=server_id, status="active").count()
    staff_count = len(await list_staff(server_id))
    recent = (
        await Task.filter(server_id=server_id)
        .filter(sphere_clause | Q(project_id__in=list(visible_project_ids)))
        .order_by("-updated_at")
        .limit(8)
    )
    return {
        "my_open_tasks": my_open,
        "overdue_tasks": overdue,
        "active_projects": active_projects,
        "staff_count": staff_count,
        "recent_tasks": [
            {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "updated_at": t.updated_at.isoformat(),
            }
            for t in recent
        ],
    }
