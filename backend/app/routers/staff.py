"""Staff / следящие endpoints."""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import DEFAULT_SERVER_ID
from app.models.bot import AccessLevel, UserServerAccess
from app.models.panel import StaffNote
from app.services.auth import require_ca_user
from app.services.discord_links import links_for_vk_ids, set_discord_link
from app.services.discord_oauth import normalize_discord_id
from app.services.display_names import (
    resolve_bot_nickname,
    resolve_display_names,
    resolve_vk_photos,
)
from app.services.staff import (
    assign_staff_member,
    clear_ca_leader_nickname,
    get_ca_leader,
    get_leadership_peer_id,
    get_staff_member,
    list_ca_leaders,
    list_staff,
    revoke_ca_leader_full,
    revoke_staff_access,
    update_ca_leader_meta,
    update_leader_nickname,
    update_staff_member,
)
from app.services.activity_log import staff_assign_detail
from app.services.audit import log_audit
from app.services.staff_assign import assign_via_site_message
from app.services.staff_permissions import (
    assert_can_edit_staff_nickname,
    assert_can_manage_leadership_registry,
    assert_can_remove_from_leadership_registry,
    assert_can_revoke_staff,
    assert_can_set_ca,
    assert_can_set_level,
    assert_can_set_nickname,
    assert_can_set_spheres,
    can_manage_leadership_registry,
    can_remove_from_leadership_registry,
    staff_edit_permissions,
)

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _session_access_level(user: dict) -> int:
    """Уровень из сессии (dev-персона, MAIN_ADMIN, реальный доступ)."""
    return int(user.get("access_level") or 0)


def _actor_spheres(user: dict) -> list[str]:
    return list(user.get("spheres") or [])


def _build_staff_perms(
    user: dict,
    actor_level: int,
    target_vk_id: int,
    target_level: int,
    target_spheres: list[str] | None = None,
) -> dict:
    return staff_edit_permissions(
        actor_vk_id=user["vk_id"],
        actor_level=actor_level,
        actor_panel_role=user.get("panel_role") or "member",
        target_vk_id=target_vk_id,
        target_level=target_level,
        actor_spheres=_actor_spheres(user),
        target_spheres=target_spheres or [],
        dev_persona=bool(user.get("dev_persona")),
    )


async def _actor_access_level(user: dict, server_id: int) -> int:
    if user.get("dev_persona"):
        return _session_access_level(user)
    from app.services.access import get_access_level

    return await get_access_level(user["vk_id"], server_id)


class StaffNoteUpdate(BaseModel):
    note: str


class StaffDiscordUpdate(BaseModel):
    discord_id: str | None = None


class StaffMemberUpdate(BaseModel):
    nickname: str | None = None
    nickname_tag: str | None = None
    access_level: int | None = None
    has_ca_access: bool | None = None
    spheres: list[str] | None = None
    note: str | None = None
    discord_id: str | None = None
    revoke_staff_access: bool | None = None
    resync_nickname: bool | None = None


class StaffAssignBody(BaseModel):
    vk_id: int
    discord_id: str | None = None
    nickname: str
    nickname_tag: str | None = None
    access_level: int
    spheres: list[str]


class LeaderMemberUpdate(BaseModel):
    nickname: str | None = None
    position: str | None = None
    note: str | None = None
    discord_id: str | None = None
    forum_account: str | None = None
    clear_nickname: bool | None = None
    remove_from_registry: bool | None = None


def _can_manage_discord_links(user: dict, level: int, target_vk_id: int) -> bool:
    if user["vk_id"] == target_vk_id:
        return True
    return level >= AccessLevel.ZGS or user.get("panel_role") in ("owner", "lead")


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
    actor_vk_id = user["vk_id"]
    can_edit_fields = can_manage_leadership_registry(
        actor_level=level,
        actor_vk_id=actor_vk_id,
        target_vk_id=target_vk_id,
    )
    can_remove = can_remove_from_leadership_registry(
        actor_level=level,
        actor_vk_id=actor_vk_id,
        target_vk_id=target_vk_id,
    )
    return {
        "edit_nickname": can_edit_fields,
        "edit_forum_account": can_edit_fields,
        "edit_position": can_edit_fields,
        "edit_note": can_edit_fields,
        "edit_discord": _can_manage_discord_links(user, level, target_vk_id),
        "clear_nickname": can_remove,
        "remove_from_registry": can_remove,
        "manage_registry": can_edit_fields,
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
    actor_level = await _actor_access_level(user, server_id)
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

    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    actor_level = await _actor_access_level(user, server_id)
    perms = _leader_edit_permissions(user, actor_level, vk_id)
    fields_set = body.model_fields_set
    changed = False

    if body.remove_from_registry:
        assert_can_remove_from_leadership_registry(
            actor_level=actor_level,
            actor_vk_id=user["vk_id"],
            target_vk_id=vk_id,
        )
        if not perms["remove_from_registry"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        try:
            await revoke_ca_leader_full(server_id, vk_id, updated_by=user["vk_id"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await log_audit(
            user["vk_id"],
            "leader_remove",
            "leader",
            vk_id,
            {"target_vk_id": vk_id, "target_nickname": row.get("nickname")},
        )
        return {"ok": True, "removed": True, "vk_id": vk_id}

    if body.clear_nickname:
        assert_can_remove_from_leadership_registry(
            actor_level=actor_level,
            actor_vk_id=user["vk_id"],
            target_vk_id=vk_id,
        )
        if not perms["clear_nickname"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        try:
            await clear_ca_leader_nickname(server_id, vk_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await log_audit(
            user["vk_id"],
            "leader_clear_nickname",
            "leader",
            vk_id,
            {"target_vk_id": vk_id, "target_nickname": row.get("nickname")},
        )
        changed = True

    registry_fields = {"nickname", "position", "note", "forum_account"}
    if registry_fields & fields_set:
        assert_can_manage_leadership_registry(
            actor_level=actor_level,
            actor_vk_id=user["vk_id"],
            target_vk_id=vk_id,
        )

    if "nickname" in fields_set:
        if not perms["edit_nickname"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены ника")
        assert_can_set_nickname(actor_level)
        try:
            await update_leader_nickname(
                server_id,
                vk_id,
                nickname=body.nickname or "",
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        changed = True

    meta_kwargs: dict = {}
    if "position" in fields_set:
        if not perms["edit_position"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        pos = (body.position or "").strip()
        if access and access.is_judge:
            from app.services.role_assign import validate_judge_position

            pos = validate_judge_position(pos)
        meta_kwargs["position"] = pos
        changed = True

    if "forum_account" in fields_set:
        if not perms["edit_forum_account"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для форума")
        from app.services.role_assign import _apply_forum_account

        try:
            await _apply_forum_account(vk_id, body.forum_account or "")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
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

    leader_audit: dict = {"target_vk_id": vk_id, "target_nickname": row.get("nickname")}
    if meta_kwargs.get("position"):
        leader_audit["position"] = meta_kwargs["position"]
    await log_audit(user["vk_id"], "leader_update", "leader", vk_id, leader_audit)

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
            "sphere",
            "spheres",
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
                r.get("sphere") or "",
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


@router.post("/assign")
async def post_staff_assign(
    body: StaffAssignBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    actor_level = _session_access_level(user)
    dev_persona = bool(user.get("dev_persona"))
    perms = _build_staff_perms(user, actor_level, body.vk_id, 0, [])
    if not perms["assign_staff"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав для назначения")
    if user["vk_id"] == body.vk_id:
        raise HTTPException(status_code=403, detail="Нельзя назначить себя")

    assert_can_set_level(
        actor_vk_id=user["vk_id"],
        actor_level=actor_level,
        new_level=body.access_level,
        target_vk_id=body.vk_id,
        target_level=0,
        dev_persona=dev_persona,
    )
    assert_can_set_nickname(actor_level)

    normalized_spheres = assert_can_set_spheres(
        actor_vk_id=user["vk_id"],
        actor_level=actor_level,
        actor_panel_role=user.get("panel_role") or "member",
        actor_spheres=_actor_spheres(user),
        target_current=[],
        requested=body.spheres,
        target_level=body.access_level,
        dev_persona=dev_persona,
    )

    if not (body.nickname or "").strip():
        raise HTTPException(status_code=400, detail="Укажите никнейм")

    try:
        row = await assign_staff_member(
            server_id,
            body.vk_id,
            nickname=body.nickname.strip(),
            access_level=body.access_level,
            spheres=normalized_spheres,
            granted_by=user["vk_id"],
            nickname_tag=body.nickname_tag,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if body.discord_id:
        try:
            discord_id = normalize_discord_id(body.discord_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await set_discord_link(
            vk_id=body.vk_id,
            discord_id=discord_id,
            actor_vk_id=user["vk_id"],
        )

    row = await _enrich_staff_row(row, server_id)
    from app.services.access import panel_role

    await log_audit(
        user["vk_id"],
        "staff_assign",
        "staff",
        body.vk_id,
        staff_assign_detail(
            target_vk_id=body.vk_id,
            nickname=row.get("nickname") or body.nickname.strip(),
            access_level=int(row["access_level"]),
            spheres=list(row.get("spheres") or []),
        ),
    )

    row["server_id"] = server_id
    row["panel_role"] = panel_role(row["access_level"])
    row["permissions"] = _build_staff_perms(
        user, actor_level, body.vk_id, int(row["access_level"]), list(row.get("spheres") or [])
    )
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
    actor_level = _session_access_level(user)
    target_level = int(row["access_level"])
    perms = _build_staff_perms(
        user, actor_level, vk_id, target_level, list(row.get("spheres") or [])
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
    actor_level = _session_access_level(user)
    dev_persona = bool(user.get("dev_persona"))
    row_before = await get_staff_member(server_id, vk_id)
    if not row_before:
        raise HTTPException(status_code=404, detail="Не найден в реестре следящих")
    target_level = int(row_before["access_level"])
    perms = _build_staff_perms(
        user,
        actor_level,
        vk_id,
        target_level,
        list(row_before.get("spheres") or []),
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
            dev_persona=dev_persona,
        )
        try:
            await revoke_staff_access(server_id, vk_id, updated_by=user["vk_id"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await log_audit(
            user["vk_id"],
            "staff_revoke",
            "staff",
            vk_id,
            {"target_vk_id": vk_id, "target_nickname": row.get("nickname")},
        )
        return {"ok": True, "removed": True, "vk_id": vk_id}

    if "nickname" in fields_set:
        if not perms["edit_nickname"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены ника")
        assert_can_edit_staff_nickname(
            actor_vk_id=user["vk_id"],
            actor_level=actor_level,
            target_vk_id=vk_id,
            target_level=target_level,
            dev_persona=dev_persona,
        )
        kwargs["nickname"] = body.nickname or ""

    if "nickname_tag" in fields_set:
        if not perms["edit_nickname"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены тега")
        assert_can_edit_staff_nickname(
            actor_vk_id=user["vk_id"],
            actor_level=actor_level,
            target_vk_id=vk_id,
            target_level=target_level,
            dev_persona=dev_persona,
        )
        kwargs["nickname_tag"] = body.nickname_tag or ""
        kwargs["nickname_tag_provided"] = True

    if "access_level" in fields_set:
        if body.access_level is None:
            raise HTTPException(status_code=400, detail="Укажите access_level")
        if not perms["edit_access_level"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены уровня")
        row_before = await get_staff_member(server_id, vk_id)
        prev_level = int(row_before["access_level"]) if row_before else 0
        if prev_level <= 0 and body.access_level > 0:
            raise HTTPException(status_code=400, detail=assign_via_site_message())
        assert_can_set_level(
            actor_vk_id=user["vk_id"],
            actor_level=actor_level,
            new_level=body.access_level,
            target_vk_id=vk_id,
            target_level=prev_level,
            dev_persona=dev_persona,
        )
        kwargs["access_level"] = body.access_level

    if "has_ca_access" in fields_set:
        if body.has_ca_access is None:
            raise HTTPException(status_code=400, detail="Укажите has_ca_access")
        if not perms["edit_ca_access"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для доступа ЦА")
        assert_can_set_ca(actor_level)
        kwargs["has_ca_access"] = body.has_ca_access

    if "spheres" in fields_set:
        if body.spheres is None:
            raise HTTPException(status_code=400, detail="Укажите spheres")
        if not perms["edit_spheres"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены сфер")
        sphere_target_level = (
            body.access_level
            if "access_level" in fields_set and body.access_level is not None
            else target_level
        )
        kwargs["spheres"] = assert_can_set_spheres(
            actor_vk_id=user["vk_id"],
            actor_level=actor_level,
            actor_panel_role=user.get("panel_role") or "member",
            actor_spheres=_actor_spheres(user),
            target_current=list(row_before.get("spheres") or []),
            requested=body.spheres,
            target_level=sphere_target_level,
            dev_persona=dev_persona,
        )

    if "note" in fields_set:
        if not perms["edit_sphere"]:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены сферы")
        kwargs["note"] = body.note or ""

    if body.resync_nickname:
        row = await get_staff_member(server_id, vk_id)
        if not row:
            raise HTTPException(status_code=404, detail="Не найден в реестре следящих")
        if not (
            perms["edit_nickname"]
            or perms["edit_access_level"]
            or perms["edit_spheres"]
        ):
            raise HTTPException(status_code=403, detail="Недостаточно прав для синхронизации ника")
        from app.services.staff_nickname import strip_nickname_tags

        if "nickname" not in kwargs:
            clean = strip_nickname_tags(
                body.nickname or row.get("bot_nickname") or row.get("nickname") or "",
            ).strip()
            if clean and perms["edit_nickname"]:
                kwargs["nickname"] = clean
        if "access_level" not in kwargs and perms["edit_access_level"]:
            kwargs["access_level"] = row["access_level"]
        if "spheres" not in kwargs and perms["edit_spheres"]:
            kwargs["spheres"] = list(row.get("spheres") or [])

    if not kwargs and "discord_id" not in fields_set:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")

    if kwargs:
        audit_detail: dict = {
            "target_vk_id": vk_id,
            "target_nickname": row_before.get("nickname"),
        }
        if "access_level" in kwargs:
            audit_detail["access_level"] = {
                "from": target_level,
                "from_name": AccessLevel.title(target_level),
                "to": kwargs["access_level"],
                "to_name": AccessLevel.title(int(kwargs["access_level"])),
            }
        if "nickname" in kwargs or "nickname_tag" in kwargs:
            audit_detail["nickname"] = True
        if "spheres" in kwargs:
            audit_detail["spheres"] = list(kwargs["spheres"])
        if "has_ca_access" in kwargs:
            audit_detail["has_ca_access"] = kwargs["has_ca_access"]
        if "note" in kwargs:
            audit_detail["note"] = True

        try:
            await update_staff_member(
                server_id,
                vk_id,
                granted_by=user["vk_id"],
                **kwargs,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        await log_audit(user["vk_id"], "staff_update", "staff", vk_id, audit_detail)

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
    row["permissions"] = _build_staff_perms(
        user, actor_level, vk_id, int(row["access_level"]), list(row.get("spheres") or [])
    )
    return row


@router.patch("/{vk_id}/note")
async def update_staff_note(
    vk_id: int,
    body: StaffNoteUpdate,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    level = _session_access_level(user)
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
    level = _session_access_level(user)
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
