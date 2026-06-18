"""Staff / следящие endpoints."""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import DEFAULT_SERVER_ID
from app.models.panel import StaffNote
from app.services.access import get_access_level
from app.services.auth import require_ca_user
from app.services.discord_links import links_for_vk_ids, set_discord_link
from app.services.discord_oauth import normalize_discord_id
from app.services.display_names import resolve_display_names, resolve_vk_photos
from app.services.display_names import resolve_display_names, resolve_vk_photos
from app.services.staff import get_leadership_peer_id, list_ca_leaders, list_staff

router = APIRouter(prefix="/api/staff", tags=["staff"])


class StaffNoteUpdate(BaseModel):
    note: str


class StaffDiscordUpdate(BaseModel):
    discord_id: str | None = None


def _can_manage_discord_links(user: dict, level: int) -> bool:
    return level >= 7 or user.get("panel_role") in ("owner", "lead")


def _attach_discord_fields(rows: list[dict], links: dict[int, object]) -> None:
    for row in rows:
        link = links.get(row["vk_id"])
        row["discord_id"] = link.discord_id if link else None
        row["discord_username"] = link.discord_username if link else None
        row["discord_display_name"] = link.discord_display_name if link else None


@router.get("")
async def get_staff(
    request: Request,
    server_id: int = Query(DEFAULT_SERVER_ID),
    q: str = Query(""),
    level: int | None = Query(None),
    user: dict = Depends(require_ca_user),
):
    rows = await list_staff(server_id)
    vk_ids = {r["vk_id"] for r in rows}
    links = await links_for_vk_ids(vk_ids)
    _attach_discord_fields(rows, links)

    if q:
        ql = q.lower()
        rows = [
            r
            for r in rows
            if ql in r["nickname"].lower()
            or ql in str(r["vk_id"])
            or (r.get("username") and ql in r["username"].lower())
            or (r.get("discord_id") and ql in r["discord_id"])
            or (r.get("discord_username") and ql in r["discord_username"].lower())
            or (
                r.get("discord_display_name")
                and ql in r["discord_display_name"].lower()
            )
        ]
    if level is not None:
        rows = [r for r in rows if r["access_level"] == level]

    vk_ids = {r["vk_id"] for r in rows}
    names = await resolve_display_names(vk_ids, server_id)
    photos = await resolve_vk_photos(vk_ids)
    for r in rows:
        r["display_name"] = names.get(r["vk_id"], r["nickname"])
        r["avatar_url"] = photos.get(r["vk_id"])

    grouped: dict[int, list] = {}
    for row in rows:
        grouped.setdefault(row["access_level"], []).append(row)
    levels = sorted(grouped.keys(), reverse=True)
    return {
        "server_id": server_id,
        "total": len(rows),
        "groups": [{"level": lv, "members": grouped[lv]} for lv in levels],
        "members": rows,
    }


@router.get("/leaders")
async def get_ca_leaders(
    request: Request,
    server_id: int = Query(DEFAULT_SERVER_ID),
    q: str = Query(""),
    user: dict = Depends(require_ca_user),
):
    rows, warning = await list_ca_leaders(server_id)

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

    peer_id = await get_leadership_peer_id(server_id)

    return {
        "server_id": server_id,
        "peer_id": peer_id,
        "total": len(rows),
        "members": rows,
        "warning": warning,
    }


@router.get("/export.csv")
async def export_staff_csv(
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    rows = await list_staff(server_id)
    vk_ids = {r["vk_id"] for r in rows}
    links = await links_for_vk_ids(vk_ids)
    _attach_discord_fields(rows, links)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "vk_id",
            "nickname",
            "discord_id",
            "level",
            "level_name",
            "badges",
            "ca_source",
            "granted_by",
            "note",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r["vk_id"],
                r["nickname"],
                r.get("discord_id") or "",
                r["access_level"],
                r["access_level_name"],
                " ".join(r["badges"]),
                r.get("ca_source") or "",
                r.get("granted_by") or "",
                r.get("note") or "",
            ]
        )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=staff.csv"},
    )


@router.patch("/{vk_id}/note")
async def update_staff_note(
    vk_id: int,
    body: StaffNoteUpdate,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    level = await get_access_level(user["vk_id"], server_id)
    if level < 7 and user["panel_role"] not in ("owner", "lead"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    note, _ = await StaffNote.get_or_create(
        vk_id=vk_id, server_id=server_id, defaults={"note": body.note}
    )
    note.note = body.note
    note.updated_by = user["vk_id"]
    await note.save()
    return {"ok": True, "note": note.note}


@router.patch("/{vk_id}/discord")
async def update_staff_discord(
    vk_id: int,
    body: StaffDiscordUpdate,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    level = await get_access_level(user["vk_id"], server_id)
    if not _can_manage_discord_links(user, level):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    try:
        discord_id = normalize_discord_id(body.discord_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    link = await set_discord_link(
        vk_id=vk_id,
        discord_id=discord_id,
        actor_vk_id=user["vk_id"],
    )
    return {
        "ok": True,
        "discord_id": link.discord_id if link else None,
        "discord_username": link.discord_username if link else None,
        "discord_display_name": link.discord_display_name if link else None,
    }
