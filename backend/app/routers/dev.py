"""Developer panel: error log."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.models.panel import DevErrorLog
from app.services.auth import get_session_payload, require_ca_user
from app.services.dev_access import can_view_dev_panel
from app.services.error_log import record_error

router = APIRouter(prefix="/api/dev", tags=["dev"])


class ClientErrorIn(BaseModel):
    level: str = "error"
    message: str = Field(min_length=1, max_length=4000)
    stack: str = ""
    url: str = ""
    source: str = "client"
    context: dict | None = None


async def _optional_vk_id(request: Request) -> int | None:
    try:
        payload = await get_session_payload(request)
        return int(payload["sub"])
    except Exception:
        return None


async def require_dev_user(request: Request) -> dict:
    user = await require_ca_user(request)
    if not can_view_dev_panel(user["vk_id"], int(user.get("access_level") or 0)):
        raise HTTPException(status_code=403, detail="Раздел разработчика недоступен")
    return user


@router.post("/errors")
async def report_client_error(body: ClientErrorIn, request: Request):
    vk_id = await _optional_vk_id(request)
    await record_error(
        level=body.level,
        source=body.source or "client",
        message=body.message,
        stack=body.stack,
        url=body.url or str(request.headers.get("referer", "")),
        method="CLIENT",
        user_agent=request.headers.get("user-agent", ""),
        user_vk_id=vk_id,
        context=body.context,
    )
    return {"ok": True}


@router.get("/errors")
async def list_errors(
    limit: int = Query(80, ge=1, le=200),
    offset: int = Query(0, ge=0),
    level: str | None = None,
    source: str | None = None,
    _user: dict = Depends(require_dev_user),
):
    qs = DevErrorLog.all()
    if level:
        qs = qs.filter(level=level)
    if source:
        qs = qs.filter(source=source)
    total = await qs.count()
    rows = await qs.order_by("-created_at").offset(offset).limit(limit)
    return {
        "total": total,
        "items": [
            {
                "id": row.id,
                "level": row.level,
                "source": row.source,
                "message": row.message,
                "stack": row.stack,
                "url": row.url,
                "method": row.method,
                "user_agent": row.user_agent,
                "user_vk_id": row.user_vk_id,
                "context": row.context,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
    }


@router.delete("/errors")
async def clear_errors(_user: dict = Depends(require_dev_user)):
    deleted = await DevErrorLog.all().count()
    await DevErrorLog.all().delete()
    return {"ok": True, "deleted": deleted}
