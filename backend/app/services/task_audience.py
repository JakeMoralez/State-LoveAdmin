"""Gov-structures task audiences (cohorts) and visibility helpers."""

from __future__ import annotations

from fastapi import HTTPException

from app.domain.access_levels import GS, PGS, STRUCTURE_SUPERVISOR, SUPERVISOR, ZGS
from app.models.bot import UserServerAccess
from app.models.panel import StaffNote
from app.services.staff_spheres import (
    GOV_STRUCTURES,
    ILLEGAL_STRUCTURES,
    MINISTRY_SPHERE_KEYS,
    SERVER,
)
from app.services.sphere_work import visible_work_spheres

AUDIENCE_SUPERVISORS = "supervisors"
AUDIENCE_GS_ZGS = "gs_zgs"
AUDIENCE_STRUCTURE_MANAGERS = "structure_managers"

TASK_AUDIENCES: tuple[str, ...] = (
    AUDIENCE_SUPERVISORS,
    AUDIENCE_GS_ZGS,
    AUDIENCE_STRUCTURE_MANAGERS,
)

AUDIENCE_LABELS: dict[str, str] = {
    AUDIENCE_SUPERVISORS: "Следящие / ПС–ПГС",
    AUDIENCE_GS_ZGS: "ЗГС / ГС",
    AUDIENCE_STRUCTURE_MANAGERS: "Управляющие (структуры+)",
}

_GOV_RELATED = frozenset(MINISTRY_SPHERE_KEYS) | {GOV_STRUCTURES, ILLEGAL_STRUCTURES, SERVER}

ZGS_MIN_LEVEL = ZGS


def normalize_audience(raw: str | None) -> str | None:
    if raw is None:
        return None
    key = str(raw).strip()
    if not key:
        return None
    if key not in TASK_AUDIENCES:
        raise HTTPException(status_code=400, detail=f"Неизвестная категория: {key}")
    return key


def user_own_audience(level: int) -> str | None:
    if level <= 0:
        return None
    if level <= SUPERVISOR:
        return AUDIENCE_SUPERVISORS
    if level <= GS:
        return AUDIENCE_GS_ZGS
    return AUDIENCE_STRUCTURE_MANAGERS


def can_manage_gov_audiences(user: dict) -> bool:
    level = int(user.get("access_level") or 0)
    if user.get("panel_role") in ("owner", "lead"):
        return True
    if level < ZGS_MIN_LEVEL:
        return False
    return GOV_STRUCTURES in visible_work_spheres(user)


def visible_audiences_for_user(user: dict) -> list[str] | None:
    """None = все категории; иначе ограниченный список."""
    if can_manage_gov_audiences(user):
        return None
    own = user_own_audience(int(user.get("access_level") or 0))
    return [own] if own else []


def _level_matches_audience(level: int, audience: str) -> bool:
    if audience == AUDIENCE_SUPERVISORS:
        return PGS <= level <= SUPERVISOR
    if audience == AUDIENCE_GS_ZGS:
        return ZGS <= level <= GS
    if audience == AUDIENCE_STRUCTURE_MANAGERS:
        return level >= STRUCTURE_SUPERVISOR
    return False


def _has_gov_related_spheres(spheres: list | None) -> bool:
    if not spheres:
        return False
    return bool(set(spheres) & _GOV_RELATED)


async def resolve_cohort(server_id: int, audience: str) -> list[int]:
    """Snapshot of VK ids for a gov-structures audience cohort."""
    audience = normalize_audience(audience)
    if not audience:
        return []

    rows = await UserServerAccess.filter(server_id=server_id).all()
    candidates = [r for r in rows if _level_matches_audience(int(r.access_level or 0), audience)]
    if not candidates:
        return []

    notes = {
        n.vk_id: n
        for n in await StaffNote.filter(
            server_id=server_id,
            vk_id__in=[r.user_id for r in candidates],
        )
    }
    out: list[int] = []
    for row in candidates:
        note = notes.get(row.user_id)
        spheres = list(note.spheres or []) if note else []
        # Structure managers / high levels always included; lower ranks need gov-related sphere.
        level = int(row.access_level or 0)
        if level >= STRUCTURE_SUPERVISOR or _has_gov_related_spheres(spheres):
            out.append(int(row.user_id))
    return sorted(set(out))


def audiences_payload() -> list[dict]:
    return [{"id": key, "label": AUDIENCE_LABELS[key]} for key in TASK_AUDIENCES]
