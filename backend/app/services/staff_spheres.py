"""Structured staff spheres — panel source of truth."""

from __future__ import annotations

from app.models.bot import AccessLevel, User, UserServerAccess

CENTRAL_APPARATUS = "central_apparatus"
JUSTICE = "justice"
DEFENSE = "defense"
HEALTH = "health"
GOV_STRUCTURES = "gov_structures"
ILLEGAL_STRUCTURES = "illegal_structures"
SERVER = "server"

SPHERE_LABELS: dict[str, str] = {
    CENTRAL_APPARATUS: "Центральный аппарат",
    JUSTICE: "Министерство Юстиции",
    DEFENSE: "Министерство Обороны",
    HEALTH: "Министерство Здравоохранения",
    GOV_STRUCTURES: "Государственные структуры",
    ILLEGAL_STRUCTURES: "Нелегальные структуры",
    SERVER: "Сервер",
}

MINISTRY_SPHERE_KEYS: tuple[str, ...] = (
    CENTRAL_APPARATUS,
    JUSTICE,
    DEFENSE,
    HEALTH,
)

STRUCTURE_SPHERE_KEYS: tuple[str, ...] = (
    GOV_STRUCTURES,
    ILLEGAL_STRUCTURES,
)

ALL_SPHERE_KEYS: tuple[str, ...] = MINISTRY_SPHERE_KEYS + STRUCTURE_SPHERE_KEYS + (SERVER,)

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


def allowed_sphere_keys_for_level(level: int) -> tuple[str, ...]:
    """1–4: сферы министерств; 5–7: структуры; 8+: сервер."""
    if level >= AccessLevel.CURATOR:
        return (SERVER,)
    if level >= AccessLevel.STRUCTURE_SUPERVISOR:
        return STRUCTURE_SPHERE_KEYS
    return MINISTRY_SPHERE_KEYS


def effective_grantable_sphere_keys(actor_level: int, actor_spheres: list[str]) -> set[str]:
    """Сферы, которые актор может выдавать и снимать у других."""
    grantable = set(actor_spheres or [])
    if actor_level >= AccessLevel.CURATOR:
        grantable |= set(allowed_sphere_keys_for_level(AccessLevel.CURATOR))
    elif actor_level >= AccessLevel.STRUCTURE_SUPERVISOR:
        grantable |= set(STRUCTURE_SPHERE_KEYS)
    return grantable


def validate_spheres(spheres: list[str], access_level: int | None = None) -> list[str]:
    """Normalize and dedupe sphere keys; optional level guard."""
    if not spheres:
        raise ValueError("Выберите хотя бы одну сферу")
    seen: set[str] = set()
    result: list[str] = []
    for key in spheres:
        k = (key or "").strip()
        if not k:
            continue
        if k not in SPHERE_LABELS:
            raise ValueError(f"Неизвестная сфера: {k}")
        if k not in seen:
            seen.add(k)
            result.append(k)
    if not result:
        raise ValueError("Выберите хотя бы одну сферу")
    if access_level is not None:
        allowed = set(allowed_sphere_keys_for_level(access_level))
        bad = [k for k in result if k not in allowed]
        if bad:
            if access_level >= AccessLevel.CURATOR:
                tier = "сервер"
            elif access_level >= AccessLevel.STRUCTURE_SUPERVISOR:
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
            f"Нельзя снять сферу без прав редактора: {format_spheres_display(sorted(missing))}"
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
            f"Нельзя снять сферу без прав редактора: {format_spheres_display(sorted(illegal_remove))}"
        )

    return validate_spheres(list(requested_set), access_level)


def format_spheres_display(spheres: list[str]) -> str:
    if not spheres:
        return "—"
    return ", ".join(SPHERE_LABELS.get(k, k) for k in spheres)


def has_central_apparatus(spheres: list[str]) -> bool:
    return CENTRAL_APPARATUS in spheres


def merge_spheres_for_display(stored: list[str] | None, access: UserServerAccess | None) -> list[str]:
    """Сферы для UI — только из panel.db; has_ca_access бота не расширяет список."""
    del access
    return list(stored or [])


async def sync_ca_access_from_spheres(access: UserServerAccess, spheres: list[str]) -> None:
    """Write has_ca_access from sphere selection; preserve ca_auto_peer_id."""
    access.has_ca_access = has_central_apparatus(spheres)
    await access.save(update_fields=["has_ca_access"])


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
