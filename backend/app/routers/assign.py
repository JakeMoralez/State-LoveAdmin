"""Единый API назначения на должность."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import DEFAULT_SERVER_ID
from app.services.auth import require_ca_user
from app.services.discord_oauth import normalize_discord_id
from app.services.activity_log import staff_assign_detail
from app.services.audit import log_audit
from app.services.role_assign import (
    CONGRESS_ROLES,
    JUDGE_POSITIONS,
    assign_congress,
    assign_judge,
    assign_staff_with_profile,
)
from app.services.vk_resolve import resolve_vk_id_input
from app.services.staff_permissions import (
    assert_can_set_level,
    assert_can_set_nickname,
    assert_can_set_spheres,
    LEADER_REGISTRY_EDIT_MIN_LEVEL,
    staff_edit_permissions,
)

router = APIRouter(prefix="/api/assign", tags=["assign"])

ASSIGN_STAFF_MIN_LEVEL = 3
ASSIGN_ROLE_MIN_LEVEL = LEADER_REGISTRY_EDIT_MIN_LEVEL


def require_assign_user(user: dict = Depends(require_ca_user)) -> dict:
    level = int(user.get("access_level") or 0)
    if level < ASSIGN_ROLE_MIN_LEVEL:
        raise HTTPException(status_code=403, detail="Нужен уровень Следящий (2) или выше")
    return user


def _role_types_for_level(level: int) -> list[dict]:
    types = [
        {"id": "judge", "label": "Судья"},
        {"id": "congress", "label": "Конгресс"},
    ]
    if level >= ASSIGN_STAFF_MIN_LEVEL:
        types.insert(0, {"id": "staff", "label": "Следящий"})
    return types


class AssignBody(BaseModel):
    role_type: Literal["staff", "judge", "congress"]
    vk_id: str = Field(min_length=1)
    discord_id: str | None = None
    forum_account: str = Field(min_length=1)
    nickname: str = Field(min_length=1)
    access_level: int | None = None
    spheres: list[str] | None = None
    nickname_tag: str | None = None
    judge_position: str | None = None
    congress_role: Literal["speaker", "vice"] | None = None


@router.get("/options")
async def assign_options(user: dict = Depends(require_assign_user)):
    level = int(user.get("access_level") or 0)
    return {
        "role_types": _role_types_for_level(level),
        "judge_positions": list(JUDGE_POSITIONS),
        "congress_roles": [
            {"id": role_id, "label": label} for role_id, label in CONGRESS_ROLES.items()
        ],
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

    discord_raw: str | None = None
    if body.discord_id and body.discord_id.strip():
        try:
            discord_raw = normalize_discord_id(body.discord_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    actor_level = int(user.get("access_level") or 0)
    dev_persona = bool(user.get("dev_persona"))

    try:
        if body.role_type == "staff":
            if actor_level < ASSIGN_STAFF_MIN_LEVEL:
                raise HTTPException(
                    status_code=403,
                    detail="Назначение следящего — только ЗГС (3) и выше",
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
                raise HTTPException(status_code=403, detail="Недостаточно прав для назначения следящего")
            if user["vk_id"] == vk_id:
                raise HTTPException(status_code=403, detail="Нельзя назначить себя")
            if body.access_level is None:
                raise HTTPException(status_code=400, detail="Укажите уровень доступа")
            if body.spheres is None:
                raise HTTPException(status_code=400, detail="Укажите сферы")
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
            result = await assign_staff_with_profile(
                server_id,
                vk_id,
                forum_account=body.forum_account.strip(),
                nickname=body.nickname.strip(),
                access_level=body.access_level,
                spheres=normalized_spheres,
                nickname_tag=body.nickname_tag,
                discord_id=discord_raw,
                granted_by=user["vk_id"],
            )
        elif body.role_type == "judge":
            if actor_level < ASSIGN_ROLE_MIN_LEVEL:
                raise HTTPException(
                    status_code=403,
                    detail="Назначение судьи — только Следящий (2) и выше",
                )
            if not body.judge_position:
                raise HTTPException(status_code=400, detail="Укажите должность судьи")
            result = await assign_judge(
                server_id,
                vk_id,
                forum_account=body.forum_account.strip(),
                nickname=body.nickname.strip(),
                position=body.judge_position.strip(),
                discord_id=discord_raw,
                granted_by=user["vk_id"],
            )
        else:
            if actor_level < ASSIGN_ROLE_MIN_LEVEL:
                raise HTTPException(
                    status_code=403,
                    detail="Назначение в конгресс — только Следящий (2) и выше",
                )
            if not body.congress_role:
                raise HTTPException(status_code=400, detail="Укажите должность в конгрессе")
            result = await assign_congress(
                server_id,
                vk_id,
                forum_account=body.forum_account.strip(),
                nickname=body.nickname.strip(),
                congress_role=body.congress_role,
                discord_id=discord_raw,
                granted_by=user["vk_id"],
            )
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
                nickname=body.nickname.strip(),
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
                "nickname": body.nickname.strip(),
                "position": (body.judge_position or "").strip(),
            },
        )
    else:
        await log_audit(
            user["vk_id"],
            "congress_assign",
            "staff",
            vk_id,
            {
                "target_vk_id": vk_id,
                "nickname": body.nickname.strip(),
                "position": CONGRESS_ROLES.get(body.congress_role or "", body.congress_role or ""),
            },
        )

    return result
