"""Developer panel: error log."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.config import (
    BOT_DATABASE_URL,
    DEFAULT_SERVER_ID,
    SLED_INTERNAL_URL,
    is_postgres_url,
    is_sqlite_url,
    sqlite_file_path,
)
from app.models.panel import DevErrorLog
from app.services.auth import get_session_payload, require_ca_user
from app.services.audit import log_audit
from app.services.dev_access import can_view_dev_panel
from app.services.dev_catalog import get_catalog, save_catalog
from app.services.display_names import resolve_display_names, resolve_vk_photos
from app.services.error_log import record_error
from app.services.sled_client import fetch_dev_chats, patch_dev_chat, ping_bot
from app.services.staff import (
    list_leadership_candidates,
    list_staff,
    remove_ca_leader,
    set_ca_leader,
    update_ca_leader_faction,
)

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


async def require_leadership_manager(request: Request) -> dict:
    user = await require_dev_user(request)
    return user


class LeadershipFlagUpdate(BaseModel):
    is_leader: bool
    faction: str = ""


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


@router.get("/leadership")
async def list_leadership_registry(
    server_id: int = Query(DEFAULT_SERVER_ID),
    q: str = Query(""),
    _user: dict = Depends(require_leadership_manager),
):
    rows = await list_leadership_candidates(server_id)

    if q:
        ql = q.lower()
        rows = [
            r
            for r in rows
            if ql in r["nickname"].lower()
            or ql in str(r["vk_id"])
            or (r.get("faction") and ql in r["faction"].lower())
        ]

    vk_ids = {r["vk_id"] for r in rows}
    names = await resolve_display_names(vk_ids, server_id)
    photos = await resolve_vk_photos(vk_ids)
    for r in rows:
        r["display_name"] = names.get(r["vk_id"], r["nickname"])
        r["avatar_url"] = photos.get(r["vk_id"])

    leaders_count = sum(1 for r in rows if r["is_leader"])
    return {
        "server_id": server_id,
        "total": len(rows),
        "leaders_count": leaders_count,
        "members": rows,
    }


@router.patch("/leadership/{vk_id}")
async def patch_leadership_flag(
    vk_id: int,
    body: LeadershipFlagUpdate,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_leadership_manager),
):
    if body.is_leader:
        try:
            await set_ca_leader(
                server_id,
                vk_id,
                faction=body.faction,
                updated_by=user["vk_id"],
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if body.faction.strip():
            try:
                await update_ca_leader_faction(
                    server_id,
                    vk_id,
                    body.faction,
                    updated_by=user["vk_id"],
                )
            except ValueError:
                pass
    else:
        await remove_ca_leader(server_id, vk_id)

    return {"ok": True, "is_leader": body.is_leader}


class CatalogUpdate(BaseModel):
    factions: list[str] | None = None
    ministers: list[dict] | None = None
    advisors: list[dict] | None = None
    judge_positions: list[str] | None = None
    tag_spheres: dict[str, str] | None = None


class ChatSettingsUpdate(BaseModel):
    chat_kind: str | None = None
    sphere: str | None = None
    kick_on_leave: str | None = None
    kick_on_rejoin: str | None = None
    auto_mute_on_join: str | None = None


@router.get("/system")
async def get_dev_system(_user: dict = Depends(require_dev_user)):
    bot_db_exists: bool | None = None
    bot_db_label = BOT_DATABASE_URL
    if is_sqlite_url(BOT_DATABASE_URL):
        bot_db = sqlite_file_path(BOT_DATABASE_URL)
        bot_db_label = bot_db or BOT_DATABASE_URL
        bot_db_exists = bool(bot_db and not bot_db.startswith(":") and Path(bot_db).exists())
    elif is_postgres_url(BOT_DATABASE_URL):
        bot_db_label = "postgresql"
        bot_db_exists = True
    try:
        staff_count = len(await list_staff(DEFAULT_SERVER_ID))
    except Exception:
        staff_count = -1
    bot_ok, bot_error = await ping_bot()
    return {
        "server_id": DEFAULT_SERVER_ID,
        "bot_db": bot_db_label,
        "bot_db_exists": bot_db_exists,
        "staff_count": staff_count,
        "sled_url": SLED_INTERNAL_URL,
        "bot_ok": bot_ok,
        "bot_error": bot_error,
    }


@router.get("/catalog")
async def get_dev_catalog(_user: dict = Depends(require_dev_user)):
    return await get_catalog()


@router.put("/catalog")
async def put_dev_catalog(body: CatalogUpdate, user: dict = Depends(require_dev_user)):
    payload = {key: value for key, value in body.model_dump().items() if value is not None}
    current = await get_catalog()
    current.update(payload)
    saved = await save_catalog(current, updated_by=user["vk_id"])
    await log_audit(user["vk_id"], "dev_catalog_update", "catalog", 1, {"keys": list(payload)})
    return saved


@router.get("/chats")
async def get_dev_chats(
    server_id: int = Query(DEFAULT_SERVER_ID),
    _user: dict = Depends(require_dev_user),
):
    data, error = await fetch_dev_chats(server_id)
    if error:
        raise HTTPException(status_code=502, detail=error)
    return data


@router.patch("/chats/{peer_id}")
async def patch_dev_chat_settings(
    peer_id: int,
    body: ChatSettingsUpdate,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_dev_user),
):
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")
    payload["server_id"] = server_id
    payload["updated_by"] = user["vk_id"]
    data, error = await patch_dev_chat(peer_id, payload)
    if error:
        raise HTTPException(status_code=400 if "Недопустимый" in error or "Укажите" in error else 502, detail=error)
    await log_audit(
        user["vk_id"],
        "dev_chat_update",
        "chat",
        peer_id,
        {"peer_id": peer_id, **{k: v for k, v in payload.items() if k != "updated_by"}},
    )
    return data
