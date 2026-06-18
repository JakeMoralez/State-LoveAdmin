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
from app.services.display_names import resolve_display_names, resolve_vk_photos
from app.services.staff import list_staff

router = APIRouter(prefix="/api/staff", tags=["staff"])


class StaffNoteUpdate(BaseModel):
    note: str


@router.get("")
async def get_staff(
    request: Request,
    server_id: int = Query(DEFAULT_SERVER_ID),
    q: str = Query(""),
    level: int | None = Query(None),
    user: dict = Depends(require_ca_user),
):
    rows = await list_staff(server_id)
    if q:
        ql = q.lower()
        rows = [
            r
            for r in rows
            if ql in r["nickname"].lower()
            or ql in str(r["vk_id"])
            or (r.get("username") and ql in r["username"].lower())
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


@router.get("/export.csv")
async def export_staff_csv(
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    rows = await list_staff(server_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["vk_id", "nickname", "level", "level_name", "badges", "ca_source", "granted_by", "note"]
    )
    for r in rows:
        writer.writerow(
            [
                r["vk_id"],
                r["nickname"],
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
