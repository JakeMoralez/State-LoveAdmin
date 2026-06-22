"""Сферы для вкладок задач, проектов и чеклиста."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.services.auth import require_ca_user
from app.services.sphere_work import work_spheres_payload

router = APIRouter(prefix="/api/spheres", tags=["spheres"])


@router.get("/work")
async def get_work_spheres(user: dict = Depends(require_ca_user)):
    return {"spheres": work_spheres_payload(user)}
