"""Доступ к задачам, проектам и чеклисту по сферам."""

from __future__ import annotations

from fastapi import HTTPException

from app.config import MAIN_ADMIN_ID
from app.models.bot import AccessLevel
from app.services.staff_spheres import (
    GOV_STRUCTURES,
    ILLEGAL_STRUCTURES,
    MINISTRY_SPHERE_KEYS,
    SERVER,
)

DEFAULT_WORK_SPHERE = "central_apparatus"

WORK_SPHERE_KEYS: tuple[str, ...] = (
    "central_apparatus",
    "justice",
    "defense",
    "health",
    "gov_structures",
    "illegal_structures",
    "server",
)

SPHERE_LABELS: dict[str, str] = {
    "central_apparatus": "Центральный аппарат",
    "justice": "Министерство Юстиции",
    "defense": "Министерство Обороны",
    "health": "Министерство Здравоохранения",
    "gov_structures": "Государственные структуры",
    "illegal_structures": "Нелегальные структуры",
    "server": "Сервер",
}

_MINISTRY = frozenset(MINISTRY_SPHERE_KEYS)
_STRUCTURES = frozenset({GOV_STRUCTURES, ILLEGAL_STRUCTURES})
_ALL_OPERATIONAL = _MINISTRY | _STRUCTURES


def _operational_work_sphere_list() -> list[str]:
    return [key for key in WORK_SPHERE_KEYS if key != SERVER]


def _has_full_work_sphere_access(user: dict) -> bool:
    level = int(user.get("access_level") or 0)
    vk_id = int(user.get("vk_id") or 0)
    if level >= AccessLevel.DEVELOPER:
        return True
    return bool(MAIN_ADMIN_ID and vk_id == MAIN_ADMIN_ID)


def normalize_work_sphere(raw: str | None) -> str:
    cleaned = (raw or "").strip()
    if cleaned in WORK_SPHERE_KEYS:
        return cleaned
    return DEFAULT_WORK_SPHERE


def user_sphere_set(user: dict) -> set[str]:
    return set(user.get("spheres") or [])


def visible_work_spheres(user: dict) -> list[str]:
    """Вкладки: свои сферы; Гос/Нелег/Сервер — все операционные; разработчик — все сферы."""
    if _has_full_work_sphere_access(user):
        return _operational_work_sphere_list()

    mine = user_sphere_set(user)
    if not mine:
        return []

    visible: set[str] = set(mine)

    if GOV_STRUCTURES in mine or ILLEGAL_STRUCTURES in mine or SERVER in mine:
        visible |= _ALL_OPERATIONAL

    # «Сервер» — право видеть все сферы, отдельного чеклиста/задач нет
    visible.discard(SERVER)

    return [key for key in WORK_SPHERE_KEYS if key in visible]


def resolve_work_sphere(user: dict, raw: str | None) -> str:
    """Сфера запроса: из query или первая доступная (не ЦА по умолчанию)."""
    visible = visible_work_spheres(user)
    if not visible:
        raise HTTPException(status_code=403, detail="Нет назначенных сфер для работы")

    key = (raw or "").strip()
    if not key:
        return visible[0]
    if key not in WORK_SPHERE_KEYS:
        raise HTTPException(status_code=400, detail=f"Неизвестная сфера: {key}")
    if key not in visible:
        label = SPHERE_LABELS.get(key, key)
        raise HTTPException(status_code=403, detail=f"Нет доступа к сфере «{label}»")
    return key


def resolve_work_spheres(user: dict, raw: list[str] | None) -> list[str]:
    """Несколько сфер в query (?sphere=a&sphere=b); без параметра — все доступные."""
    visible = visible_work_spheres(user)
    if not visible:
        raise HTTPException(status_code=403, detail="Нет назначенных сфер для работы")

    if not raw:
        return visible

    result: list[str] = []
    seen: set[str] = set()
    for item in raw:
        key = (item or "").strip()
        if not key or key in seen:
            continue
        if key not in WORK_SPHERE_KEYS:
            raise HTTPException(status_code=400, detail=f"Неизвестная сфера: {key}")
        if key not in visible:
            label = SPHERE_LABELS.get(key, key)
            raise HTTPException(status_code=403, detail=f"Нет доступа к сфере «{label}»")
        seen.add(key)
        result.append(key)

    return result if result else visible


def assert_sphere_access(user: dict, sphere: str) -> str:
    return resolve_work_sphere(user, sphere)


def work_spheres_payload(user: dict) -> list[dict]:
    return [
        {"id": key, "label": SPHERE_LABELS.get(key, key)}
        for key in visible_work_spheres(user)
    ]
