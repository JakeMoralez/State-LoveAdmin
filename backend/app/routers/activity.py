"""Журнал действий на панели."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.services.activity_log import VIEW_MIN_LEVEL, list_activity
from app.services.auth import require_ca_user

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("")
async def get_activity_log(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    user: dict = Depends(require_ca_user),
):
    level = int(user.get("access_level") or 0)
    if level < VIEW_MIN_LEVEL:
        raise HTTPException(
            status_code=403,
            detail="Журнал действий доступен с уровня Следящий (2)+",
        )
    return await list_activity(limit=limit, offset=offset, q=q)
