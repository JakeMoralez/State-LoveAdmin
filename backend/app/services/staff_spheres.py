"""Structured staff spheres — persistence & validation around domain grant rules.

Правила выдачи/tier: app.domain.sphere_grant_rules (единственный канон).
"""

from __future__ import annotations

from app.domain.sphere_grant_rules import (
    ALL_SPHERE_KEYS,
    CENTRAL_APPARATUS,
    CURATOR_LEVEL,
    DEFENSE,
    GOV_STRUCTURES,
    HEALTH,
    ILLEGAL_STRUCTURES,
    JUSTICE,
    MINISTRY_SPHERE_KEYS,
    SERVER,
    SPHERE_LABELS,
    STRUCTURE_SPHERE_KEYS,
    STRUCTURE_SUPERVISOR_LEVEL,
    allowed_sphere_keys_for_level,
    effective_grantable_sphere_keys,
    format_spheres_display,
)
from app.models.bot import AccessLevel, User, UserServerAccess

# Короткие алиасы для подсказок (без англ. ключей).
_SPHERE_HINT = "ца, мю, мо, мз, гос, нелег, сервер"

# Legacy free-text → sphere keys (partial match)
_LEGACY_TEXT_MAP: list[tuple[str, str]] = [
    ("центральный аппарат", CENTRAL_APPARATUS),
    ("центральное управление", CENTRAL_APPARATUS),
    ("ца", CENTRAL_APPARATUS),
    ("министерство юстиции", JUSTICE),
    ("юстиц", JUSTICE),
    ("министерство обороны", DEFENSE),
    ("оборон", DEFENSE),
    ("министерство здравоохранения", HEALTH),
    ("здравоохран", HEALTH),
    ("государственные структуры", GOV_STRUCTURES),
    ("государственные организации", GOV_STRUCTURES),
    ("гос", GOV_STRUCTURES),
    ("нелегальные", ILLEGAL_STRUCTURES),
    ("нелег", ILLEGAL_STRUCTURES),
    ("сервер", SERVER),
    ("прокуратур", JUSTICE),
]


def validate_spheres(spheres: list[str], access_level: int | None = None) -> list[str]:
    """Normalize and dedupe sphere keys; optional level guard."""
    if not spheres:
        raise ValueError(f"Укажите сферу: {_SPHERE_HINT}")
    seen: set[str] = set()
    result: list[str] = []
    for key in spheres:
        k = (key or "").strip()
        if not k:
            continue
        if k not in SPHERE_LABELS:
            raise ValueError(f"Неизвестная сфера. Укажите: {_SPHERE_HINT}")
        if k not in seen:
            seen.add(k)
            result.append(k)
    if not result:
        raise ValueError(f"Укажите сферу: {_SPHERE_HINT}")
    if access_level is not None:
        allowed = set(allowed_sphere_keys_for_level(access_level))
        bad = [k for k in result if k not in allowed]
        if bad:
            if access_level >= CURATOR_LEVEL:
                tier = "сервер"
            elif access_level >= STRUCTURE_SUPERVISOR_LEVEL:
                tier = "государственные или нелегальные структуры"
            else:
                tier = "сферы министерств (ЦА, МЮ, МО, МЗ)"
            raise ValueError(f"Для этого уровня доступны только {tier}")
    return result


def constrain_spheres_for_actor(
    actor_level: int,
    actor_spheres: list[str],
    target_current: list[str],
    requested: list[str],
    access_level: int,
) -> list[str]:
    """ЗГС/ГС может менять только свои сферы; ЗГС ГОС+ — все сферы своего tier."""
    grantable = effective_grantable_sphere_keys(actor_level, actor_spheres)
    current = set(target_current or [])
    requested_set = set(requested or [])

    locked = current - grantable
    if not locked.issubset(requested_set):
        missing = locked - requested_set
        raise ValueError(
            f"Нельзя снять сферу без прав редактора: {format_spheres_display(sorted(missing))}. "
            "Чтобы снять только свою сферу — /setsphere @user -ца (или -мю, -мо…)."
        )

    added = requested_set - current
    illegal_add = added - grantable
    if illegal_add:
        raise ValueError(
            f"Можно выдавать только свои сферы: {format_spheres_display(sorted(illegal_add))}"
        )

    removed = current - requested_set
    illegal_remove = removed - grantable
    if illegal_remove:
        raise ValueError(
            f"Нельзя снять сферу без прав редактора: {format_spheres_display(sorted(illegal_remove))}. "
            "Чтобы снять только свою сферу — /setsphere @user -ца (или -мю, -мо…)."
        )

    return validate_spheres(list(requested_set), access_level)


def has_central_apparatus(spheres: list[str]) -> bool:
    return CENTRAL_APPARATUS in spheres


def merge_spheres_for_display(stored: list[str] | None, access: UserServerAccess | None) -> list[str]:
    """Сферы для UI — только из panel.db; has_ca_access бота не расширяет список."""
    del access
    return list(stored or [])


async def sync_ca_access_from_spheres(access: UserServerAccess, spheres: list[str]) -> None:
    """Write has_ca_access from sphere selection; preserve ca_auto_peer_id."""
    from app.services.bot_users import update_server_access

    flag = has_central_apparatus(spheres)
    access.has_ca_access = flag
    await update_server_access(access.user_id, access.server_id, has_ca_access=flag)


def migrate_legacy_sphere(
    level: int,
    access: UserServerAccess | None,
    user: User,
    old_note: str,
) -> list[str]:
    """Derive initial spheres from legacy flags and free-text notes."""
    spheres: list[str] = []
    custom = (old_note or "").strip() or (user.note or "").strip()
    custom_lower = custom.lower()

    if access and access.has_ca_access:
        spheres.append(CENTRAL_APPARATUS)
    if access and access.is_judge:
        if JUSTICE not in spheres:
            spheres.append(JUSTICE)

    if custom:
        for fragment, key in _LEGACY_TEXT_MAP:
            if fragment in custom_lower and key not in spheres:
                spheres.append(key)

    allowed = set(allowed_sphere_keys_for_level(level))
    spheres = [s for s in spheres if s in allowed]

    if level >= AccessLevel.CURATOR and SERVER not in spheres:
        spheres.append(SERVER)
    if (
        level >= AccessLevel.STRUCTURE_SUPERVISOR
        and GOV_STRUCTURES not in spheres
        and GOV_STRUCTURES in allowed
    ):
        spheres.append(GOV_STRUCTURES)

    if not spheres:
        if level >= AccessLevel.STRUCTURE_SUPERVISOR:
            spheres.append(GOV_STRUCTURES)
        elif level >= AccessLevel.CURATOR:
            spheres.append(SERVER)
        elif access and access.is_judge:
            spheres.append(JUSTICE)
        elif access and access.has_ca_access:
            spheres.append(CENTRAL_APPARATUS)

    return spheres
