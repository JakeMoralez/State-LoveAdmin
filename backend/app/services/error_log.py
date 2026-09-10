"""Persist client/server errors for the dev panel."""

from __future__ import annotations

import traceback
from typing import Any

from fastapi import Request

from app.config import DEV_ERROR_RETENTION
from app.models.panel import DevErrorLog


def _clip(text: str | None, limit: int) -> str:
    value = (text or "").strip()
    return value[:limit] if value else ""


async def prune_error_log() -> None:
    from app.services.panel_settings import get_dev_error_retention

    try:
        retention = await get_dev_error_retention()
    except Exception:
        retention = DEV_ERROR_RETENTION
    total = await DevErrorLog.all().count()
    if total <= retention:
        return
    excess = total - retention
    ids = await DevErrorLog.all().order_by("created_at").limit(excess).values_list("id", flat=True)
    if ids:
        await DevErrorLog.filter(id__in=list(ids)).delete()


async def record_error(
    *,
    level: str = "error",
    source: str = "client",
    message: str,
    stack: str = "",
    url: str = "",
    method: str = "",
    user_agent: str = "",
    user_vk_id: int | None = None,
    context: dict[str, Any] | None = None,
) -> None:
    msg = _clip(message, 4000) or "(empty)"
    await DevErrorLog.create(
        level=_clip(level, 16) or "error",
        source=_clip(source, 32) or "client",
        message=msg,
        stack=_clip(stack, 12000),
        url=_clip(url, 2048),
        method=_clip(method, 16),
        user_agent=_clip(user_agent, 512),
        user_vk_id=user_vk_id,
        context=context,
    )
    await prune_error_log()


async def record_server_exception(request: Request, exc: BaseException) -> None:
    vk_id: int | None = None
    try:
        from app.services.auth import get_session_payload

        payload = await get_session_payload(request)
        vk_id = int(payload["sub"])
    except Exception:
        pass

    await record_error(
        level="error",
        source="server",
        message=str(exc) or exc.__class__.__name__,
        stack="".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
        url=str(request.url),
        method=request.method,
        user_agent=_clip(request.headers.get("user-agent"), 512),
        user_vk_id=vk_id,
        context={"path": request.url.path},
    )
