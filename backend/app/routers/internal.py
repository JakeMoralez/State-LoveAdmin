"""Internal API for State-LoveBot (localhost + shared secret)."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import DEFAULT_SERVER_ID, SLED_BOT_SECRET
from app.models.bot import UserServerAccess
from app.models.panel import StaffNote
from app.services.discord_links import links_for_vk_ids, set_discord_link
from app.services.discord_oauth import normalize_discord_id
from app.services.internal_assign import assign_staff_from_bot
from app.services.staff import sync_spheres_from_bot
from app.services.staff_spheres import validate_spheres

router = APIRouter(prefix="/internal", tags=["internal"])


def _check_secret(header: str | None) -> None:
    if not SLED_BOT_SECRET or header != SLED_BOT_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


class DiscordLinkBody(BaseModel):
    vk_id: int
    discord_id: str | None = None


class StaffSpheresBody(BaseModel):
    actor_vk_id: int | None = None
    spheres: list[str] | None = None
    grant_central_apparatus: bool | None = None
    grant_sphere: str | None = None
    revoke_sphere: str | None = None
    is_senior: bool | None = None
    senior_spheres: list[str] | None = None


@router.get("/staff-spheres")
async def get_staff_spheres_list(
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)
    from app.services.staff_spheres import ALL_SPHERE_KEYS, SPHERE_LABELS

    return {
        "spheres": [
            {"key": key, "label": SPHERE_LABELS.get(key, key)}
            for key in ALL_SPHERE_KEYS
        ]
    }


class StaffAssignBody(BaseModel):
    actor_vk_id: int
    vk_id: int
    forum_account: str = Field(min_length=1)
    nickname: str = Field(min_length=1)
    access_level: int
    spheres: list[str] = Field(min_length=1)
    discord_id: str = Field(min_length=1)
    nickname_tag: str | None = None


class StaffRevokeBody(BaseModel):
    actor_vk_id: int


class StaffSphereRemoveBody(BaseModel):
    actor_vk_id: int
    sphere: str


@router.get("/discord-link")
async def get_discord_link(
    vk_id: int,
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)
    links = await links_for_vk_ids({vk_id})
    link = links.get(vk_id)
    return {
        "vk_id": vk_id,
        "discord_id": link.discord_id if link else None,
        "discord_username": link.discord_username if link else None,
        "discord_display_name": link.discord_display_name if link else None,
    }


@router.put("/discord-link")
async def update_discord_link(
    body: DiscordLinkBody,
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)

    try:
        discord_id = normalize_discord_id(body.discord_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    link = await set_discord_link(
        vk_id=body.vk_id,
        discord_id=discord_id,
        actor_vk_id=body.vk_id,
    )
    return {
        "ok": True,
        "discord_id": link.discord_id if link else None,
    }


@router.put("/staff-spheres/{vk_id}")
async def put_staff_spheres(
    vk_id: int,
    body: StaffSpheresBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)

    async def _assert_actor_can_edit_spheres(
        *,
        requested: list[str] | None = None,
        senior_requested: list[str] | None = None,
    ) -> list[str] | None:
        """Require actor_vk_id; hierarchy + grantable spheres. Returns normalized main spheres."""
        from app.models.bot import AccessLevel
        from app.services.access import get_access_level
        from app.services.staff_permissions import assert_can_set_spheres
        from app.services.staff_spheres import effective_grantable_sphere_keys

        if body.actor_vk_id is None:
            raise HTTPException(
                status_code=400,
                detail="Укажите actor_vk_id",
            )

        actor_level = await get_access_level(body.actor_vk_id, server_id)
        target_level = await get_access_level(vk_id, server_id)
        if actor_level < AccessLevel.ZGS and body.actor_vk_id != vk_id:
            raise HTTPException(
                status_code=403,
                detail="Нужен уровень ЗГС для смены сфер другому",
            )
        if (
            body.actor_vk_id != vk_id
            and actor_level < AccessLevel.DEVELOPER
            and target_level >= actor_level
        ):
            raise HTTPException(
                status_code=403,
                detail="Нельзя менять сферы пользователя своего уровня или выше",
            )

        actor_note = await StaffNote.get_or_none(
            vk_id=body.actor_vk_id, server_id=server_id
        )
        target_note = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
        actor_spheres = list(actor_note.spheres or []) if actor_note else []
        target_current = list(target_note.spheres or []) if target_note else []

        normalized: list[str] | None = None
        if requested is not None:
            normalized = assert_can_set_spheres(
                actor_vk_id=body.actor_vk_id,
                actor_level=actor_level,
                actor_panel_role="",
                actor_spheres=actor_spheres,
                target_current=target_current,
                requested=requested,
                target_level=target_level,
            )

        if senior_requested:
            if actor_level < AccessLevel.DEVELOPER:
                grantable = set(
                    effective_grantable_sphere_keys(actor_level, actor_spheres)
                )
                bad = [s for s in senior_requested if s not in grantable]
                if bad:
                    from app.services.staff_spheres import format_spheres_display

                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Старшие сферы можно ставить только из своих: "
                            f"{format_spheres_display(bad)}"
                        ),
                    )
        return normalized

    if body.spheres is not None:
        try:
            normalized = validate_spheres(body.spheres)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        senior_spheres = body.senior_spheres
        if senior_spheres is not None:
            if senior_spheres:
                try:
                    senior_spheres = validate_spheres(senior_spheres)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc
            else:
                senior_spheres = []

        normalized = await _assert_actor_can_edit_spheres(
            requested=normalized,
            senior_requested=senior_spheres,
        )
        assert normalized is not None

        from app.services.staff import update_staff_member

        try:
            await update_staff_member(
                server_id,
                vk_id,
                spheres=normalized,
                is_senior=body.is_senior,
                senior_spheres=senior_spheres,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "ok": True,
            "vk_id": vk_id,
            "spheres": normalized,
            "is_senior": body.is_senior,
            "senior_spheres": senior_spheres,
        }

    if body.grant_central_apparatus is not None:
        # Системный sync бота (вход/выход след. ЦА) — без actor hierarchy.
        try:
            spheres = await sync_spheres_from_bot(
                server_id,
                vk_id,
                grant_central_apparatus=body.grant_central_apparatus,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True, "vk_id": vk_id, "spheres": spheres}

    if body.grant_sphere or body.revoke_sphere:
        from app.services.staff import sync_sphere_from_bot

        key = (body.grant_sphere or body.revoke_sphere or "").strip()
        try:
            spheres = await sync_sphere_from_bot(
                server_id,
                vk_id,
                key,
                grant=bool(body.grant_sphere),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True, "vk_id": vk_id, "spheres": spheres}

    if body.is_senior is not None or body.senior_spheres is not None:
        from app.services.staff import update_staff_member

        senior_spheres = body.senior_spheres
        if senior_spheres is not None:
            if senior_spheres:
                try:
                    senior_spheres = validate_spheres(senior_spheres)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc
            else:
                senior_spheres = []

        await _assert_actor_can_edit_spheres(senior_requested=senior_spheres)

        try:
            await update_staff_member(
                server_id,
                vk_id,
                is_senior=body.is_senior,
                senior_spheres=senior_spheres,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "ok": True,
            "vk_id": vk_id,
            "is_senior": body.is_senior,
            "senior_spheres": senior_spheres,
        }

    raise HTTPException(
        status_code=400,
        detail="Укажите spheres, grant_central_apparatus, is_senior или senior_spheres",
    )


@router.post("/staff-revoke/{vk_id}")
async def post_staff_revoke(
    vk_id: int,
    body: StaffRevokeBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)

    from app.models.bot import AccessLevel
    from app.services.access import get_access_level
    from app.services.staff import revoke_staff_access
    from app.services.staff_permissions import assert_can_revoke_staff

    actor_level = await get_access_level(body.actor_vk_id, server_id)
    target_level = await get_access_level(vk_id, server_id)

    try:
        assert_can_revoke_staff(
            actor_vk_id=body.actor_vk_id,
            actor_level=actor_level,
            target_vk_id=vk_id,
            target_level=target_level,
        )
        await revoke_staff_access(
            server_id,
            vk_id,
            updated_by=body.actor_vk_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True, "vk_id": vk_id}


@router.post("/staff-sphere-remove/{vk_id}")
async def post_staff_sphere_remove(
    vk_id: int,
    body: StaffSphereRemoveBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    """Снять одну сферу после poolkick (старший в своей сфере или ЗГС+)."""
    _check_secret(x_sled_secret)

    from app.services.staff import remove_staff_sphere_on_poolkick
    from app.services.staff_spheres import validate_spheres

    try:
        sphere = validate_spheres([body.sphere.strip()])[0]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = await remove_staff_sphere_on_poolkick(
            server_id,
            vk_id,
            sphere=sphere,
            actor_vk_id=body.actor_vk_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    return {"ok": True, **result}


@router.post("/staff-assign")
async def post_staff_assign(
    body: StaffAssignBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)

    try:
        discord_raw = normalize_discord_id(body.discord_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    actor_access = await UserServerAccess.get_or_none(
        user_id=body.actor_vk_id,
        server_id=server_id,
    )
    actor_level = actor_access.access_level if actor_access else 0
    actor_note = await StaffNote.get_or_none(vk_id=body.actor_vk_id, server_id=server_id)
    actor_spheres = list(actor_note.spheres or []) if actor_note else []

    try:
        result = await assign_staff_from_bot(
            server_id,
            body.vk_id,
            actor_vk_id=body.actor_vk_id,
            actor_level=actor_level,
            actor_spheres=actor_spheres,
            forum_account=body.forum_account.strip(),
            nickname=body.nickname.strip(),
            access_level=body.access_level,
            spheres=body.spheres,
            discord_id=discord_raw,
            nickname_tag=body.nickname_tag,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    return result


class AcademyReportBody(BaseModel):
    actor_vk_id: int
    assignment_id: int
    body: str = ""
    proof_urls: list[str] = Field(default_factory=list)


async def _academy_actor(vk_id: int, server_id: int) -> dict:
    from app.services.access import get_access_level

    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    return {
        "vk_id": vk_id,
        "access_level": await get_access_level(vk_id, server_id),
        "is_senior": bool(access and getattr(access, "is_senior", False)),
    }


@router.get("/academy/me/{vk_id}")
async def internal_academy_me(
    vk_id: int,
    server_id: int = Query(DEFAULT_SERVER_ID),
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)
    from app.services import academy as academy_svc

    actor = await _academy_actor(vk_id, server_id)
    cadet = await academy_svc.get_cadet(server_id, vk_id)
    if cadet:
        data = await academy_svc.serialize_cadet(cadet)
        assignments = await academy_svc.list_assignments(server_id, actor)
        data["open_assignments"] = [
            a
            for a in assignments
            if vk_id in (a.get("assignee_vk_ids") or [])
            and not any(r and r.get("vk_id") == vk_id and r.get("status") == "accepted" for r in (a.get("reports") or []))
        ]
        return {"ok": True, "cadet": data, "is_lead": academy_svc.is_academy_lead(actor)}
    roster = await academy_svc.list_roster(server_id, actor) if academy_svc.is_academy_lead(actor) else []
    return {"ok": True, "cadet": None, "is_lead": academy_svc.is_academy_lead(actor), "roster": roster[:8]}


@router.get("/academy/student/{vk_id}")
async def internal_academy_student(
    vk_id: int,
    actor_vk_id: int = Query(...),
    server_id: int = Query(DEFAULT_SERVER_ID),
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)
    from app.services import academy as academy_svc

    actor = await _academy_actor(actor_vk_id, server_id)
    cadet = await academy_svc.get_cadet(server_id, vk_id)
    if not cadet:
        raise HTTPException(status_code=404, detail="Академик не найден")
    if not academy_svc.can_view_cadet(actor, cadet):
        raise HTTPException(status_code=403, detail="Нет доступа")
    return {"ok": True, "cadet": await academy_svc.serialize_cadet(cadet)}


@router.get("/academy/leaderboard")
async def internal_academy_leaderboard(
    actor_vk_id: int = Query(...),
    server_id: int = Query(DEFAULT_SERVER_ID),
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)
    from app.services import academy as academy_svc

    actor = await _academy_actor(actor_vk_id, server_id)
    rows = await academy_svc.list_roster(server_id, actor)
    return {"ok": True, "members": rows[:10]}


@router.post("/academy/report")
async def internal_academy_report(
    body: AcademyReportBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)
    from app.services import academy as academy_svc

    actor = await _academy_actor(body.actor_vk_id, server_id)
    try:
        report = await academy_svc.submit_report(
            body.assignment_id,
            actor,
            body=body.body,
            proof_urls=body.proof_urls,
        )
    except (ValueError, PermissionError, LookupError) as exc:
        status = 403 if isinstance(exc, PermissionError) else 404 if isinstance(exc, LookupError) else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    return {"ok": True, "report": academy_svc._report_payload(report)}
