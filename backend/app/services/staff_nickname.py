"""Staff nickname tags: [ЗГС МЮ&МО] / [ЗГС ГОС] / [След. ГОС] / [Куратор] Имя."""

from __future__ import annotations

import re

from app.models.bot import AccessLevel
from app.services.staff_spheres import (
    CENTRAL_APPARATUS,
    DEFENSE,
    GOV_STRUCTURES,
    HEALTH,
    ILLEGAL_STRUCTURES,
    JUSTICE,
)

_TAG_PREFIX_RE = re.compile(r"^[\[［]([^\］\]]+)[\]］]\s*")


LEVEL_NICK_TAGS: dict[int, str] = {
    # ПГС -> ПС (Проверяющий следящий) — обновлённый короткий тег
    AccessLevel.PGS: "ПС",
    AccessLevel.SUPERVISOR: "След.",
    AccessLevel.ZGS: "ЗГС",
    AccessLevel.GS: "ГС",
    AccessLevel.STRUCTURE_SUPERVISOR: "След.",
    AccessLevel.ZGS_GOS: "ЗГС",
    AccessLevel.GS_GOS: "ГС",
    AccessLevel.CURATOR: "Куратор",
    AccessLevel.ZGA: "ЗГА",
    AccessLevel.GA: "ГА",
    AccessLevel.DEVELOPER: "Разработчик",
}

MINISTRY_NICK_TAGS: dict[str, str] = {
    CENTRAL_APPARATUS: "ЦА",
    JUSTICE: "МЮ",
    DEFENSE: "МО",
    HEALTH: "МЗ",
}

MINISTRY_NICK_TAG_ORDER: tuple[str, ...] = (
    CENTRAL_APPARATUS,
    JUSTICE,
    DEFENSE,
    HEALTH,
)

STRUCTURE_NICK_TAGS: dict[str, str] = {
    GOV_STRUCTURES: "ГОС",
    ILLEGAL_STRUCTURES: "Нелег",
}

STRUCTURE_NICK_TAG_ORDER: tuple[str, ...] = (
    GOV_STRUCTURES,
    ILLEGAL_STRUCTURES,
)


def extract_leading_nickname_tag(raw: str | None) -> str | None:
    """Первый [тег] из ника (в т.ч. полноширинные ［］ из VK)."""
    rest = (raw or "").strip()
    match = _TAG_PREFIX_RE.match(rest)
    if not match:
        return None
    inner = match.group(1).strip()
    return inner or None


def normalize_custom_tag(tag: str | None) -> str | None:
    """Пустой → None (дефолт «Разработчик»)."""
    if tag is None:
        return None
    t = tag.strip().strip("[]［］").strip()
    if not t:
        return None
    if len(t) > 24 or "[" in t or "]" in t or "［" in t or "］" in t:
        raise ValueError("Тег: до 24 символов, без скобок")
    return t


def strip_nickname_tags(raw: str | None) -> str:
    """Имя без префикса [тег …] / ［тег …］."""
    rest = (raw or "").strip()
    if not rest:
        return ""
    while True:
        match = _TAG_PREFIX_RE.match(rest)
        if not match:
            break
        rest = rest[match.end() :].strip()
    return rest


def rewrite_legacy_nickname_tags(nickname: str) -> str:
    """Старые теги → актуальные (на случай ника, сохранённого до смены)."""
    text = (nickname or "").strip()
    if not text:
        return text
    replacements = (
        ("След.стр Гос", "След. ГОС"),
        ("След.стр ГОС", "След. ГОС"),
        ("ЗГС Гос", "ЗГС ГОС"),
        ("ГС Гос", "ГС ГОС"),
        ("След.стр", "След."),
    )
    for old, new in replacements:
        text = text.replace(f"[{old}]", f"[{new}]")
        text = text.replace(f"［{old}］", f"[{new}]")
    return text.replace("［", "[").replace("］", "]")


def pick_sphere_nick_tag(spheres: list[str], access_level: int) -> str | None:
    """
    1–4: сферы министерств (МЮ&МО…).
    5–7: структуры (ГОС перебивает остальные, иначе Нелег&…).
    8+: без тега сферы.
    """
    if access_level >= AccessLevel.CURATOR:
        return None

    if access_level >= AccessLevel.STRUCTURE_SUPERVISOR:
        if GOV_STRUCTURES in spheres:
            return STRUCTURE_NICK_TAGS[GOV_STRUCTURES]
        tags = [
            STRUCTURE_NICK_TAGS[key]
            for key in STRUCTURE_NICK_TAG_ORDER
            if key in spheres and key != GOV_STRUCTURES
        ]
        return "&".join(tags) if tags else None

    tags = [MINISTRY_NICK_TAGS[key] for key in MINISTRY_NICK_TAG_ORDER if key in spheres]
    return "&".join(tags) if tags else None


def format_staff_nickname(
    clean_name: str,
    access_level: int,
    spheres: list[str],
    *,
    custom_tag: str | None = None,
    is_senior: bool = False,
    senior_spheres: list[str] | None = None,
) -> str:
    """Build nickname tag(s).

    New behaviour: optionally include senior-following information.
    - If is_senior and senior_spheres provided, a secondary part is appended using
      either "Ст. След. {TAG}" or "След. {TAG}" depending on the primary role.
    """
    name = strip_nickname_tags(clean_name).strip()
    if not name:
        raise ValueError("Укажите имя для никнейма")

    # developer/custom tag handling unchanged
    if access_level >= AccessLevel.DEVELOPER:
        tag = normalize_custom_tag(custom_tag) or LEVEL_NICK_TAGS[AccessLevel.DEVELOPER]
        bracket = f"[{tag}]"
    else:
        level_tag = LEVEL_NICK_TAGS.get(access_level) or AccessLevel.title(access_level)

        # sphere tag for the main role
        main_sphere_tag = pick_sphere_nick_tag(spheres, access_level)
        if access_level >= AccessLevel.CURATOR:
            main_part = f"{level_tag}"
        else:
            main_part = f"{level_tag} {main_sphere_tag}" if main_sphere_tag else f"{level_tag}"

        # senior part
        senior_part = None
        if is_senior and senior_spheres:
            s_tag = pick_sphere_nick_tag(senior_spheres, access_level)
            if s_tag:
                # If primary role is low (<=SUPERVISOR), show senior as primary
                if access_level <= AccessLevel.SUPERVISOR:
                    senior_part = f"Ст. След. {s_tag}"
                else:
                    # For GS/ZGS and higher main roles show secondary as regular След.
                    senior_part = f"След. {s_tag}"

        if senior_part:
            # decide order: if primary is supervisor or lower, show senior first
            if access_level <= AccessLevel.SUPERVISOR:
                bracket = f"[{senior_part} | {main_part}]"
            else:
                bracket = f"[{main_part} | {senior_part}]"
        else:
            bracket = f"[{main_part}]"

    result = f"{bracket} {name}"
    if len(result) > 64:
        raise ValueError("Никнейм слишком длинный (макс. 64 символа с тегами)")
    return result
