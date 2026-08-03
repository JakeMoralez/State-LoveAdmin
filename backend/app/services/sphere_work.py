"""Доступ к задачам, проектам и чеклисту по сферам."""

from __future__ import annotations

from fastapi import HTTPException
from tortoise.expressions import Q

from app.config import MAIN_ADMIN_ID
from app.models.bot import AccessLevel
from app.services.staff_spheres import (
    CENTRAL_APPARATUS,
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

# Старые/ошибочные значения в panel.db до миграции сфер
LEGACY_STORED_SPHERE_ALIASES: dict[str, str] = {
    "ca": "central_apparatus",
    "central": "central_apparatus",
    "центральный аппарат": "central_apparatus",
    "ца": "central_apparatus",
    "gos": "gov_structures",
    "gov": "gov_structures",
    "гос": "gov_structures",
    "illegal": "illegal_structures",
    "нелег": "illegal_structures",
    "нелегалы": "illegal_structures",
    "мю": "justice",
    "мо": "defense",
    "мз": "health",
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


def normalize_stored_work_sphere(raw: str | None) -> str:
    """Привести значение sphere из БД к каноническому ключу."""
    cleaned = (raw or "").strip()
    if not cleaned:
        return DEFAULT_WORK_SPHERE
    if cleaned in WORK_SPHERE_KEYS:
        return cleaned
    mapped = LEGACY_STORED_SPHERE_ALIASES.get(cleaned.lower())
    if mapped:
        return mapped
    return DEFAULT_WORK_SPHERE


def db_sphere_filter_values(visible: list[str]) -> list[str]:
    """Значения sphere для SQL-фильтра: канон + legacy-алиасы."""
    result = set(visible)
    for legacy, canonical in LEGACY_STORED_SPHERE_ALIASES.items():
        if canonical in visible:
            result.add(legacy)
    if CENTRAL_APPARATUS in visible:
        result.add("")
    return list(result)


def work_item_sphere_filter(visible: list[str]) -> Q:
    """Фильтр задач/проектов: канон + legacy + пустые строки для ЦА."""
    db_spheres = db_sphere_filter_values(visible)
    clause = Q(sphere__in=db_spheres)
    if CENTRAL_APPARATUS in visible:
        clause = clause | Q(sphere__isnull=True)
    return clause


def user_sphere_set(user: dict) -> set[str]:
    return set(user.get("spheres") or [])


def visible_work_spheres(user: dict) -> list[str]:
    """Вкладки: только назначенные сферы; Гос/Нелег/Сервер — все операционные; разработчик — все.

    ЗГС/ГС сфер (ур. 3–4) с министерской сферой дополнительно видят «Государственные структуры»
    (банки вопросов и остальная работа по Гос).
    """
    if _has_full_work_sphere_access(user):
        return _operational_work_sphere_list()

    mine = user_sphere_set(user)
    if not mine:
        return []

    visible: set[str] = set(mine)

    if GOV_STRUCTURES in mine or ILLEGAL_STRUCTURES in mine or SERVER in mine:
        visible |= _ALL_OPERATIONAL

    level = int(user.get("access_level") or 0)
    if AccessLevel.ZGS <= level <= AccessLevel.GS and (mine & _MINISTRY):
        visible.add(GOV_STRUCTURES)

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
