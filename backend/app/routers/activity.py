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
    vk_id: int | None = Query(None),
    actions: str | None = Query(None),
    group: str | None = Query(None),
    about: bool = Query(False),
    user: dict = Depends(require_ca_user),
):
    level = int(user.get("access_level") or 0)
    own = vk_id is not None and int(vk_id) == int(user["vk_id"])
    if not own and level < VIEW_MIN_LEVEL:
        raise HTTPException(
            status_code=403,
            detail="Журнал действий доступен с уровня Следящий (2)+",
        )
    action_list = [a.strip() for a in (actions or "").split(",") if a.strip()] or None
    return await list_activity(
        limit=limit,
        offset=offset,
        q=q,
        vk_id=vk_id,
        actions=action_list,
        group=group,
        about=about,
    )
