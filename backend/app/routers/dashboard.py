"""Dashboard summary."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from app.config import DEFAULT_SERVER_ID
from app.models.panel import Project, Task
from app.services.auth import require_ca_user
from app.services.staff import list_staff

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def dashboard_summary(
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    vk_id = user["vk_id"]
    open_statuses = ["backlog", "todo", "in_progress", "review"]
    my_open = await Task.filter(
        server_id=server_id, assignee_vk_id=vk_id, status__in=open_statuses
    ).count()
    overdue = await Task.filter(
        server_id=server_id,
        assignee_vk_id=vk_id,
        status__in=open_statuses,
        due_date__lt=date.today(),
    ).count()
    active_projects = await Project.filter(server_id=server_id, status="active").count()
    staff_count = len(await list_staff(server_id))
    recent = await Task.filter(server_id=server_id).order_by("-updated_at").limit(8)
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
