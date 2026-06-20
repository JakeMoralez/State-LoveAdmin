"""Staff / следящие endpoints."""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import DEFAULT_SERVER_ID
from app.models.bot import AccessLevel
from app.models.panel import StaffNote
from app.services.access import get_access_level
from app.services.auth import require_ca_user
from app.services.discord_links import links_for_vk_ids, set_discord_link
from app.services.discord_oauth import normalize_discord_id
from app.services.display_names import (
    resolve_bot_nickname,
    resolve_display_names,
    resolve_vk_photos,
)
from app.services.staff import (
    clear_ca_leader_nickname,
    get_ca_leader,
    get_leadership_peer_id,
    get_staff_member,
    list_ca_leaders,
    list_staff,
    revoke_ca_leader_full,
    revoke_staff_access,
    update_ca_leader_meta,
    update_staff_member,
)
from app.services.staff_permissions import (
    assert_can_revoke_staff,
    assert_can_set_ca,
    assert_can_set_level,
    assert_can_set_nickname,
    staff_edit_permissions,
)

router = APIRouter(prefix="/api/staff", tags=["staff"])


class StaffNoteUpdate(BaseModel):
    note: str


class StaffDiscordUpdate(BaseModel):
    discord_id: str | None = None


class StaffMemberUpdate(BaseModel):
    nickname: str | None = None
    access_level: int | None = None
    has_ca_access: bool | None = None
    note: str | None = None
    discord_id: str | None = None
    revoke_staff_access: bool | None = None


class LeaderMemberUpdate(BaseModel):
    nickname: str | None = None
    position: str | None = None
    note: str | None = None
    discord_id: str | None = None
    clear_nickname: bool | None = None
    remove_from_registry: bool | None = None


def _can_manage_discord_links(user: dict, level: int, target_vk_id: int) -> bool:
    if user["vk_id"] == target_vk_id:
        return True
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
        r["display_name"] = r.get("bot_nickname") or names.get(r["vk_id"], r["nickname"])
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
            or (r.get("position") and ql in r["position"].lower())
            or (r.get("note") and ql in r["note"].lower())
            or (r.get("faction") and ql in r["faction"].lower())
        ]

    vk_ids = {r["vk_id"] for r in rows}
    names = await resolve_display_names(vk_ids, server_id)
    photos = await resolve_vk_photos(vk_ids)
    for r in rows:
        r["display_name"] = r.get("bot_nickname") or names.get(r["vk_id"], r["nickname"])
        r["avatar_url"] = photos.get(r["vk_id"])

    peer_id = await get_leadership_peer_id(server_id)

    return {
        "server_id": server_id,
        "peer_id": peer_id,
        "total": len(rows),
        "members": rows,
        "warning": warning,
    }


def _leader_edit_permissions(user: dict, level: int, target_vk_id: int) -> dict:
    is_self = user["vk_id"] == target_vk_id
    can_edit_nick = level >= AccessLevel.PGS and not is_self
    return {
        "edit_nickname": can_edit_nick,
        "edit_position": True,
        "edit_note": True,
        "edit_discord": _can_manage_discord_links(user, level, target_vk_id),
        "clear_nickname": can_edit_nick,
        "remove_from_registry": True,
    }


@router.get("/leaders/{vk_id}")
async def get_ca_leader_one(
    vk_id: int,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    row = await get_ca_leader(server_id, vk_id)
    if not row:
        raise HTTPException(status_code=404, detail="Не найден в реестре руководства")
    row = await _enrich_staff_row(row, server_id)
    actor_level = await get_access_level(user["vk_id"], server_id)
    row["server_id"] = server_id
    row["permissions"] = _leader_edit_permissions(user, actor_level, vk_id)
    return row


@router.patch("/leaders/{vk_id}")
async def patch_ca_leader(
    vk_id: int,
    body: LeaderMemberUpdate,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    row = await get_ca_leader(server_id, vk_id)
    if not row:
        raise HTTPException(status_code=404, detail="Не найден в реестре руководства")

    actor_level = await get_access_level(user["vk_id"], server_id)
    perms = _leader_edit_permissions(user, actor_level, vk_id)
    fields_set = body.model_fields_set
    changed = False

    if body.remove_from_registry:
        if not perms["remove_from_registry"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        try:
            await revoke_ca_leader_full(server_id, vk_id, updated_by=user["vk_id"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True, "removed": True, "vk_id": vk_id}

    if body.clear_nickname:
        if not perms["clear_nickname"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        try:
            await clear_ca_leader_nickname(server_id, vk_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        changed = True

    if "nickname" in fields_set:
        if not perms["edit_nickname"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены ника")
        assert_can_set_nickname(actor_level)
        try:
            await update_staff_member(
                server_id,
                vk_id,
                nickname=body.nickname or "",
                granted_by=user["vk_id"],
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        changed = True

    meta_kwargs: dict = {}
    if "position" in fields_set:
        if not perms["edit_position"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        meta_kwargs["position"] = body.position or ""
        changed = True

    if "note" in fields_set:
        if not perms["edit_note"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        meta_kwargs["note"] = body.note or ""
        changed = True

    if meta_kwargs:
        await update_ca_leader_meta(
            server_id,
            vk_id,
            position=meta_kwargs.get("position"),
            note=meta_kwargs.get("note"),
            updated_by=user["vk_id"],
        )

    if "discord_id" in fields_set:
        if not perms["edit_discord"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для Discord")
        try:
            discord_id = normalize_discord_id(body.discord_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await set_discord_link(
            vk_id=vk_id,
            discord_id=discord_id,
            actor_vk_id=user["vk_id"],
        )
        changed = True

    if not changed:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")

    row = await get_ca_leader(server_id, vk_id)
    if not row:
        raise HTTPException(status_code=404, detail="Не найден")
    row = await _enrich_staff_row(row, server_id)
    row["server_id"] = server_id
    row["permissions"] = perms
    return row


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


async def _enrich_staff_row(row: dict, server_id: int) -> dict:
    vk_id = row["vk_id"]
    bot_nick = row.get("bot_nickname")
    if bot_nick is None:
        bot_nick = await resolve_bot_nickname(vk_id, server_id)
    names = await resolve_display_names({vk_id}, server_id)
    photos = await resolve_vk_photos({vk_id})
    links = await links_for_vk_ids({vk_id})
    link = links.get(vk_id)
    row = {**row}
    row["bot_nickname"] = bot_nick
    row["nickname"] = bot_nick or ""
    row["display_name"] = bot_nick or names.get(vk_id, f"id{vk_id}")
    row["avatar_url"] = photos.get(vk_id)
    row["discord_id"] = link.discord_id if link else None
    row["discord_username"] = link.discord_username if link else None
    row["discord_display_name"] = link.discord_display_name if link else None
    return row


@router.get("/{vk_id}")
async def get_staff_one(
    vk_id: int,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    row = await get_staff_member(server_id, vk_id)
    if not row:
        raise HTTPException(status_code=404, detail="Не найден в реестре следящих")
    row = await _enrich_staff_row(row, server_id)
    actor_level = await get_access_level(user["vk_id"], server_id)
    perms = staff_edit_permissions(
        actor_vk_id=user["vk_id"],
        actor_level=actor_level,
        actor_panel_role=user.get("panel_role") or "member",
        target_vk_id=vk_id,
    )
    from app.services.access import panel_role

    row["server_id"] = server_id
    row["panel_role"] = panel_role(row["access_level"])
    row["permissions"] = perms
    return row


@router.patch("/{vk_id}")
async def patch_staff_member(
    vk_id: int,
    body: StaffMemberUpdate,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    actor_level = await get_access_level(user["vk_id"], server_id)
    perms = staff_edit_permissions(
        actor_vk_id=user["vk_id"],
        actor_level=actor_level,
        actor_panel_role=user.get("panel_role") or "member",
        target_vk_id=vk_id,
    )

    fields_set = body.model_fields_set
    kwargs: dict = {}

    if body.revoke_staff_access:
        if not perms["revoke_staff_access"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        row = await get_staff_member(server_id, vk_id)
        if not row:
            raise HTTPException(status_code=404, detail="Не найден в реестре следящих")
        assert_can_revoke_staff(
            actor_vk_id=user["vk_id"],
            actor_level=actor_level,
            target_vk_id=vk_id,
            target_level=int(row["access_level"]),
        )
        try:
            await revoke_staff_access(server_id, vk_id, updated_by=user["vk_id"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True, "removed": True, "vk_id": vk_id}

    if "nickname" in fields_set:
        if not perms["edit_nickname"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены ника")
        assert_can_set_nickname(actor_level)
        kwargs["nickname"] = body.nickname or ""

    if "access_level" in fields_set:
        if body.access_level is None:
            raise HTTPException(status_code=400, detail="Укажите access_level")
        if not perms["edit_access_level"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены уровня")
        assert_can_set_level(
            actor_vk_id=user["vk_id"],
            actor_level=actor_level,
            new_level=body.access_level,
        )
        kwargs["access_level"] = body.access_level

    if "has_ca_access" in fields_set:
        if body.has_ca_access is None:
            raise HTTPException(status_code=400, detail="Укажите has_ca_access")
        if not perms["edit_ca_access"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для доступа ЦА")
        assert_can_set_ca(actor_level)
        kwargs["has_ca_access"] = body.has_ca_access

    if "note" in fields_set:
        if not perms["edit_sphere"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены сферы")
        kwargs["note"] = body.note or ""

    if not kwargs and "discord_id" not in fields_set:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")

    if kwargs:
        try:
            await update_staff_member(
                server_id,
                vk_id,
                granted_by=user["vk_id"],
                **kwargs,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if "discord_id" in fields_set:
        if not perms["edit_discord"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для Discord")
        try:
            discord_id = normalize_discord_id(body.discord_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await set_discord_link(
            vk_id=vk_id,
            discord_id=discord_id,
            actor_vk_id=user["vk_id"],
        )

    row = await get_staff_member(server_id, vk_id)
    if not row:
        raise HTTPException(status_code=404, detail="Не найден")
    row = await _enrich_staff_row(row, server_id)
    from app.services.access import panel_role

    row["server_id"] = server_id
    row["panel_role"] = panel_role(row["access_level"])
    row["permissions"] = perms
    return row


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
    if not _can_manage_discord_links(user, level, vk_id):
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
