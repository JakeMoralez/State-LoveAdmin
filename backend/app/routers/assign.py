"""Единый API назначения на должность."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import DEFAULT_SERVER_ID
from app.models.bot import AccessLevel, User, UserServerAccess
from app.models.panel import DiscordLink
from app.services.auth import require_ca_user
from app.services import messages
from app.services.discord_oauth import normalize_discord_id
from app.services.activity_log import staff_assign_detail
from app.services.audit import log_audit
from app.services.dev_catalog import get_catalog
from app.services.role_assign import (
    CONGRESS_ROLES,
    LEADERSHIP_POSITIONS,
    assign_congress,
    assign_judge,
    assign_leadership,
    assign_staff_with_profile,
    normalize_forum_account,
)
from app.services.staff import parse_appointment_date
from app.services.vk_resolve import resolve_vk_id_input
from app.services.staff_permissions import (
    ASSIGN_STAFF_MIN_LEVEL,
    assert_can_set_level,
    assert_can_set_nickname,
    assert_can_set_spheres,
    LEADER_REGISTRY_EDIT_MIN_LEVEL,
    staff_edit_permissions,
)

router = APIRouter(prefix="/api/assign", tags=["assign"])

ASSIGN_ROLE_MIN_LEVEL = LEADER_REGISTRY_EDIT_MIN_LEVEL


def require_assign_user(user: dict = Depends(require_ca_user)) -> dict:
    level = int(user.get("access_level") or 0)
    if level < ASSIGN_ROLE_MIN_LEVEL:
        raise HTTPException(status_code=403, detail=messages.ASSIGN_NEED_SUPERVISOR)
    return user


def _role_types_for_level(level: int) -> list[dict]:
    types = [
        {"id": "leader", "label": "Лидер"},
        {"id": "deputy", "label": "Заместитель"},
        {"id": "minister", "label": "Министр"},
        {"id": "advisor", "label": "Советник"},
        {"id": "judge", "label": "Судья"},
        {"id": "congress", "label": "Конгресс"},
    ]
    if level >= ASSIGN_STAFF_MIN_LEVEL:
        types.insert(0, {"id": "staff", "label": "Следящий"})
    return types


LEADERSHIP_TYPES = frozenset(LEADERSHIP_POSITIONS)


class AssignBody(BaseModel):
    role_type: Literal["staff", "judge", "congress", "leader", "deputy", "minister", "advisor"]
    vk_id: str = Field(min_length=1)
    discord_id: str = ""
    forum_account: str = ""
    nickname: str = ""
    access_level: int | None = None
    spheres: list[str] | None = None
    nickname_tag: str | None = None
    judge_position: str | None = None
    org_tag: str | None = None
    congress_role: Literal["speaker", "vice"] | None = None
    granted_at: str | None = None
    is_senior: bool | None = None
    senior_spheres: list[str] | None = None


@router.get("/options")
async def assign_options(user: dict = Depends(require_assign_user)):
    level = int(user.get("access_level") or 0)
    catalog = await get_catalog()
    return {
        "role_types": _role_types_for_level(level),
        "judge_positions": list(catalog["judge_positions"]),
        "leadership_positions": [
            {"id": key, "label": label} for key, label in LEADERSHIP_POSITIONS.items()
        ],
        "congress_roles": [
            {"id": role_id, "label": label} for role_id, label in CONGRESS_ROLES.items()
        ],
        "factions": list(catalog["factions"]),
        "minister_tags": list(catalog["ministers"]),
        "advisor_tags": list(catalog["advisors"]),
    }


@router.post("")
async def post_assign(
    body: AssignBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_assign_user),
):
    try:
        vk_id = await resolve_vk_id_input(body.vk_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    bot_user = await User.get_or_none(vk_id=vk_id)
    link = await DiscordLink.get_or_none(vk_id=vk_id)
    existing_nick = (access.nickname or "").strip() if access else ""
    existing_forum = (bot_user.username or "").strip() if bot_user else ""
    try:
        if existing_forum:
            existing_forum = normalize_forum_account(existing_forum)
        else:
            existing_forum = ""
    except ValueError:
        existing_forum = ""
    existing_discord = (link.discord_id or "").strip() if link else ""

    try:
        discord_raw = normalize_discord_id(body.discord_id) if (body.discord_id or "").strip() else None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    discord_raw = discord_raw or existing_discord or None
    nickname = (body.nickname or "").strip() or existing_nick
    forum_account = (body.forum_account or "").strip() or existing_forum
    leadership = body.role_type in LEADERSHIP_TYPES
    if not nickname:
        raise HTTPException(status_code=400, detail=messages.NICKNAME_REQUIRED)
    if not leadership:
        if not forum_account:
            raise HTTPException(status_code=400, detail=messages.FORUM_REQUIRED)
        if not discord_raw:
            raise HTTPException(status_code=400, detail=messages.DISCORD_REQUIRED)

    actor_level = int(user.get("access_level") or 0)
    dev_persona = bool(user.get("dev_persona"))
    appointed = parse_appointment_date(body.granted_at) if body.granted_at else None

    try:
        if body.role_type == "staff":
            if actor_level < ASSIGN_STAFF_MIN_LEVEL:
                raise HTTPException(
                    status_code=403,
                    detail=messages.ASSIGN_STAFF_NEED_ZGS,
                )
            perms = staff_edit_permissions(
                actor_vk_id=user["vk_id"],
                actor_level=actor_level,
                actor_panel_role=user.get("panel_role") or "member",
                target_vk_id=vk_id,
                target_level=0,
                actor_spheres=list(user.get("spheres") or []),
                target_spheres=[],
                dev_persona=dev_persona,
            )
            if not perms["assign_staff"]:
                raise HTTPException(status_code=403, detail=messages.ASSIGN_STAFF_FORBIDDEN)
            if user["vk_id"] == vk_id:
                raise HTTPException(status_code=403, detail=messages.SELF_ASSIGN_FORBIDDEN)
            if body.access_level is None:
                raise HTTPException(status_code=400, detail=messages.LEVEL_REQUIRED)
            if body.spheres is None:
                raise HTTPException(status_code=400, detail=messages.SPHERES_REQUIRED)
            assert_can_set_level(
                actor_vk_id=user["vk_id"],
                actor_level=actor_level,
                new_level=body.access_level,
                target_vk_id=vk_id,
                target_level=0,
                dev_persona=dev_persona,
            )
            assert_can_set_nickname(actor_level)
            normalized_spheres = assert_can_set_spheres(
                actor_vk_id=user["vk_id"],
                actor_level=actor_level,
                actor_panel_role=user.get("panel_role") or "member",
                actor_spheres=list(user.get("spheres") or []),
                target_current=[],
                requested=body.spheres,
                target_level=body.access_level,
                dev_persona=dev_persona,
            )
            if body.is_senior and not body.senior_spheres:
                raise HTTPException(
                    status_code=400,
                    detail=messages.ASSIGN_SENIOR_SPHERE,
                )
            extra_spheres: list[str] | None = None
            extra_senior = bool(body.is_senior)
            if extra_senior:
                extra_spheres = assert_can_set_spheres(
                    actor_vk_id=user["vk_id"],
                    actor_level=actor_level,
                    actor_panel_role=user.get("panel_role") or "member",
                    actor_spheres=list(user.get("spheres") or []),
                    target_current=[],
                    requested=body.senior_spheres or [],
                    target_level=AccessLevel.SUPERVISOR,
                    dev_persona=dev_persona,
                )
            result = await assign_staff_with_profile(
                server_id,
                vk_id,
                forum_account=forum_account,
                nickname=nickname,
                access_level=body.access_level,
                spheres=normalized_spheres,
                nickname_tag=body.nickname_tag,
                discord_id=discord_raw,
                granted_by=user["vk_id"],
                granted_at=appointed,
                is_senior=extra_senior,
                senior_spheres=extra_spheres,
            )
        elif body.role_type == "judge":
            if actor_level < ASSIGN_ROLE_MIN_LEVEL:
                raise HTTPException(
                    status_code=403,
                    detail=messages.ASSIGN_JUDGE_NEED_SUPERVISOR,
                )
            if not body.judge_position:
                raise HTTPException(status_code=400, detail=messages.ASSIGN_JUDGE_POSITION)
            result = await assign_judge(
                server_id,
                vk_id,
                forum_account=forum_account,
                nickname=nickname,
                position=body.judge_position.strip(),
                discord_id=discord_raw,
                granted_by=user["vk_id"],
                granted_at=appointed,
            )
        elif body.role_type == "congress":
            if actor_level < ASSIGN_ROLE_MIN_LEVEL:
                raise HTTPException(
                    status_code=403,
                    detail=messages.ASSIGN_CONGRESS_NEED_SUPERVISOR,
                )
            if not body.congress_role:
                raise HTTPException(status_code=400, detail=messages.ASSIGN_CONGRESS_POSITION)
            result = await assign_congress(
                server_id,
                vk_id,
                forum_account=forum_account,
                nickname=nickname,
                congress_role=body.congress_role,
                discord_id=discord_raw,
                granted_by=user["vk_id"],
                granted_at=appointed,
            )
        elif body.role_type in LEADERSHIP_TYPES:
            if actor_level < ASSIGN_ROLE_MIN_LEVEL:
                raise HTTPException(
                    status_code=403,
                    detail=messages.ASSIGN_NEED_SUPERVISOR,
                )
            if not (body.org_tag or "").strip():
                raise HTTPException(status_code=400, detail=messages.LEADER_ORG_REQUIRED)
            result = await assign_leadership(
                server_id,
                vk_id,
                role_type=body.role_type,
                nickname=nickname,
                org_tag=body.org_tag or "",
                forum_account=forum_account,
                discord_id=discord_raw,
                granted_by=user["vk_id"],
                granted_at=appointed,
            )
        else:
            raise HTTPException(status_code=400, detail=messages.VALIDATION_GENERIC)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if body.role_type == "staff":
        await log_audit(
            user["vk_id"],
            "staff_assign",
            "staff",
            vk_id,
            staff_assign_detail(
                target_vk_id=vk_id,
                nickname=nickname,
                access_level=body.access_level or 0,
                spheres=list(body.spheres or []),
            ),
        )
    elif body.role_type == "judge":
        await log_audit(
            user["vk_id"],
            "judge_assign",
            "staff",
            vk_id,
            {
                "target_vk_id": vk_id,
                "nickname": nickname,
                "position": (body.judge_position or "").strip(),
            },
        )
    elif body.role_type == "congress":
        await log_audit(
            user["vk_id"],
            "congress_assign",
            "staff",
            vk_id,
            {
                "target_vk_id": vk_id,
                "nickname": nickname,
                "position": CONGRESS_ROLES.get(body.congress_role or "", body.congress_role or ""),
            },
        )
    else:
        await log_audit(
            user["vk_id"],
            "leader_assign",
            "leader",
            vk_id,
            {
                "target_vk_id": vk_id,
                "nickname": result.get("nickname", nickname),
                "position": LEADERSHIP_POSITIONS.get(body.role_type, body.role_type),
                "org_tag": result.get("org_tag"),
            },
        )

    actor_name = (user.get("bot_nickname") or user.get("nickname") or str(user["vk_id"]))
    role_label = {
        "staff": "следящим",
        "judge": "судьёй",
        "congress": "в конгресс",
        "leader": "лидером",
        "deputy": "заместителем",
        "minister": "министром",
        "advisor": "советником",
    }.get(body.role_type, "в штат")
    from app.services.vk_notify import notify_assignment

    await notify_assignment(
        vk_id,
        f"👤 Вас назначили {role_label}",
        [f"Ник: {result.get('nickname') or nickname}", f"Назначил: {actor_name}"],
    )

    return result
