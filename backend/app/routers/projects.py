"""Projects CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import DEFAULT_SERVER_ID
from app.models.panel import Project, ProjectMember
from app.services.audit import log_audit
from app.services.auth import require_ca_user

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    description: str = ""
    status: str = "active"


class ProjectUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None


def _serialize(p: Project, task_count: int = 0) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "description": p.description,
        "status": p.status,
        "owner_vk_id": p.owner_vk_id,
        "server_id": p.server_id,
        "task_count": task_count,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


@router.get("")
async def list_projects(
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    projects = await Project.filter(server_id=server_id).order_by("-updated_at")
    from app.models.panel import Task

    result = []
    for p in projects:
        count = await Task.filter(project_id=p.id).count()
        result.append(_serialize(p, count))
    return {"projects": result}


@router.post("")
async def create_project(
    body: ProjectCreate,
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    level = user["access_level"]
    if level < 7 and user["panel_role"] != "owner":
        raise HTTPException(status_code=403, detail="Создавать проекты могут Lead+")
    project = await Project.create(
        title=body.title,
        description=body.description,
        status=body.status,
        owner_vk_id=user["vk_id"],
        server_id=server_id,
    )
    await ProjectMember.create(project=project, vk_id=user["vk_id"], role="owner")
    await log_audit(user["vk_id"], "project_create", "project", project.id, {"title": project.title})
    return _serialize(project, 0)


@router.get("/{project_id}")
async def get_project(project_id: int, user: dict = Depends(require_ca_user)):
    project = await Project.get_or_none(id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    from app.models.panel import Task

    tasks = await Task.filter(project_id=project_id).order_by("-updated_at")
    return {
        **_serialize(project, len(tasks)),
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "assignee_vk_id": t.assignee_vk_id,
            }
            for t in tasks
        ],
    }


@router.patch("/{project_id}")
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    user: dict = Depends(require_ca_user),
):
    project = await Project.get_or_none(id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if project.owner_vk_id != user["vk_id"] and user["panel_role"] not in ("owner", "lead"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    if body.title is not None:
        project.title = body.title
    if body.description is not None:
        project.description = body.description
    if body.status is not None:
        project.status = body.status
    await project.save()
    return _serialize(project)
