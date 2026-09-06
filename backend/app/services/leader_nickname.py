"""Ники руководителей в формате /snick: [LSPD][10] Name_Surname."""

from __future__ import annotations

import re

from app.services.staff_nickname import extract_leading_nickname_tag, strip_nickname_tags

_TAG_CHUNK_RE = re.compile(r"^[\[［]([^］\]]+)[\]］]\s*")
_RANK_TAGS = frozenset({"9", "10"})
_CONGRESS_ROLES = frozenset({"speaker", "vice-speaker", "congressman", "judge"})
_GENERIC_ADVISOR = frozenset({"advisor", "adv"})
INFERRED_POSITIONS = {
    "leader": "Лидер",
    "deputy": "Заместитель",
    "minister": "Министр",
    "advisor": "Советник",
}

FACTION_TAGS: tuple[str, ...] = (
    "GOV",
    "LC",
    "FBI",
    "LSPD",
    "RCSD",
    "SFPD",
    "SWAT",
    "LSa",
    "SFa",
    "FP",
    "LSMC",
    "LVMC",
    "SFFD",
    "CNN LS",
)

MINISTER_TAGS: tuple[str, ...] = (
    "Pr.Min",
    "Min.Just",
    "Min.Nat.Sec",
    "Min.Soc",
)

ADVISOR_TAGS: tuple[str, ...] = (
    "Ad.Pr.Min",
    "Ad.Min.Just",
    "Ad.Min.Nat.Sec",
    "Ad.Min.Soc",
)

_NAME_RE = re.compile(r"^[A-Z][A-Za-z0-9]*_[A-Z][A-Za-z0-9]*$")
_FACTION_BY_FOLD = {tag.casefold(): tag for tag in FACTION_TAGS}
_MINISTER_BY_FOLD = {tag.casefold(): tag for tag in MINISTER_TAGS}
_ADVISOR_BY_FOLD = {tag.casefold(): tag for tag in ADVISOR_TAGS}

ROLE_RANKS = {
    "leader": "10",
    "deputy": "9",
}


def validate_rp_name(name: str) -> str:
    cleaned = strip_nickname_tags(name).strip()
    if not cleaned:
        raise ValueError("Укажите никнейм: Kyo_Parker")
    if " " in cleaned:
        raise ValueError("В нике не должно быть пробелов. Формат: Kyo_Parker")
    if not _NAME_RE.match(cleaned):
        raise ValueError("Ник: латиница, одно подчёркивание. Например Kyo_Parker")
    return cleaned


def _canon(raw: str, table: dict[str, str]) -> str | None:
    cleaned = " ".join((raw or "").split())
    return table.get(cleaned.casefold())


def org_tags_for_role(
    role_type: str,
    *,
    factions: tuple[str, ...] | None = None,
    ministers: tuple[str, ...] | None = None,
    advisors: tuple[str, ...] | None = None,
) -> tuple[str, ...]:
    if role_type in ("leader", "deputy"):
        return factions or FACTION_TAGS
    if role_type == "minister":
        return ministers or MINISTER_TAGS
    if role_type == "advisor":
        return advisors or ADVISOR_TAGS
    return ()


def validate_org_tag(
    role_type: str,
    org_tag: str,
    *,
    factions: tuple[str, ...] | None = None,
    ministers: tuple[str, ...] | None = None,
    advisors: tuple[str, ...] | None = None,
) -> str:
    cleaned = " ".join((org_tag or "").split())
    if not cleaned:
        if role_type in ("leader", "deputy"):
            raise ValueError("Выберите фракцию: LSPD, FBI, …")
        if role_type == "minister":
            raise ValueError("Выберите министерство")
        raise ValueError("Выберите тег советника")

    if role_type in ("leader", "deputy"):
        table = {tag.casefold(): tag for tag in (factions or FACTION_TAGS)}
        tag = _canon(cleaned, table)
        if not tag:
            raise ValueError("Неизвестная фракция. Выберите из списка (LSPD, FBI, …)")
        return tag
    if role_type == "minister":
        table = {tag.casefold(): tag for tag in (ministers or MINISTER_TAGS)}
        tag = _canon(cleaned, table)
        if not tag:
            raise ValueError("Неизвестный тег министра")
        return tag
    if role_type == "advisor":
        table = {tag.casefold(): tag for tag in (advisors or ADVISOR_TAGS)}
        tag = _canon(cleaned, table)
        if not tag:
            raise ValueError("Неизвестный тег советника")
        return tag
    raise ValueError("Эта должность не использует фракцию")


def format_leadership_nickname(
    role_type: str,
    name: str,
    org_tag: str,
    *,
    factions: tuple[str, ...] | None = None,
    ministers: tuple[str, ...] | None = None,
    advisors: tuple[str, ...] | None = None,
) -> str:
    clean = validate_rp_name(name)
    tag = validate_org_tag(
        role_type,
        org_tag,
        factions=factions,
        ministers=ministers,
        advisors=advisors,
    )
    if role_type in ROLE_RANKS:
        nick = f"[{tag}][{ROLE_RANKS[role_type]}] {clean}"
    else:
        nick = f"[{tag}] {clean}"
    if len(nick) > 64:
        raise ValueError("Ник слишком длинный (макс. 64)")
    return nick


def extract_org_tag(raw: str | None) -> str:
    tag = extract_leading_nickname_tag(raw)
    return tag or ""


def iter_nickname_tags(raw: str | None) -> tuple[list[str], str]:
    rest = (raw or "").strip()
    tags: list[str] = []
    while True:
        match = _TAG_CHUNK_RE.match(rest)
        if not match:
            break
        tags.append(match.group(1).strip())
        rest = rest[match.end() :].lstrip()
    return tags, rest.strip()


def infer_leadership_from_nickname(nickname: str | None) -> dict[str, str | None]:
    """Должность и тег из формата /snick: [LSPD][10] Name, [Pr.Min] Name."""
    empty = {"position": None, "org_tag": None, "role_type": None}
    tags, _name = iter_nickname_tags(nickname)
    if not tags:
        return empty

    from app.services.leader_spheres import canon_org_tag

    first = tags[0]
    first_fold = first.casefold()
    role_part = first.split("|", 1)[0].strip().casefold()
    if role_part == "judge":
        return {"position": None, "org_tag": "Judge", "role_type": None}
    if role_part == "speaker":
        return {"position": "Спикер конгресса", "org_tag": "Speaker", "role_type": None}
    if role_part == "vice-speaker":
        return {"position": "Вице-спикер конгресса", "org_tag": "Vice-Speaker", "role_type": None}
    if role_part == "congressman":
        org = canon_org_tag(first) or None
        return {"position": None, "org_tag": org, "role_type": None}

    advisor = _canon(first, _ADVISOR_BY_FOLD)
    if advisor or first_fold in _GENERIC_ADVISOR:
        return {
            "position": INFERRED_POSITIONS["advisor"],
            "org_tag": advisor,
            "role_type": "advisor",
        }

    minister = _canon(first, _MINISTER_BY_FOLD)
    if minister:
        return {
            "position": INFERRED_POSITIONS["minister"],
            "org_tag": minister,
            "role_type": "minister",
        }

    rank = tags[1] if len(tags) >= 2 and tags[1] in _RANK_TAGS else None
    faction = _canon(first, _FACTION_BY_FOLD)
    if first in _RANK_TAGS and len(tags) >= 2:
        rank = first
        faction = _canon(tags[1], _FACTION_BY_FOLD)

    if not faction:
        from app.services.leader_spheres import _POS_PREFIX_RE

        prefix = _POS_PREFIX_RE.match(first)
        org = canon_org_tag(first) or None
        if prefix and org:
            head = prefix.group(0).casefold()
            role = "deputy" if head.startswith("зам") else "leader"
            return {
                "position": INFERRED_POSITIONS[role],
                "org_tag": org,
                "role_type": role,
            }
        return {"position": None, "org_tag": org, "role_type": None}

    if rank == "10":
        return {
            "position": INFERRED_POSITIONS["leader"],
            "org_tag": faction,
            "role_type": "leader",
        }
    if rank == "9":
        return {
            "position": INFERRED_POSITIONS["deputy"],
            "org_tag": faction,
            "role_type": "deputy",
        }
    return {"position": None, "org_tag": faction, "role_type": None}


def canonicalize_leadership_nickname(nickname: str | None) -> str | None:
    """Канон: [LSPD][10] Name_Surname — без пробела между тегами, пробел перед именем."""
    raw = (nickname or "").strip()
    if not raw:
        return None
    inferred = infer_leadership_from_nickname(raw)
    tags, name = iter_nickname_tags(raw)
    name = strip_nickname_tags(name) or name
    if not tags or not name:
        return None

    first = tags[0]
    role_part = first.split("|", 1)[0].strip().casefold()
    try:
        clean = validate_rp_name(name)
    except ValueError:
        clean = name.strip()
    if not clean:
        return None

    if role_part == "judge":
        canon = f"[Judge] {clean}"
        return None if canon == raw else canon
    if role_part == "speaker":
        extra = next((t for t in tags[1:] if t in _RANK_TAGS), None)
        if extra and "|" in first:
            from app.services.leader_spheres import canon_org_tag

            faction = canon_org_tag(first.split("|", 1)[1]) or first.split("|", 1)[1].strip()
            canon = f"[Speaker | {faction}][{extra}] {clean}"
        else:
            canon = f"[Speaker] {clean}"
        return None if canon == raw else canon
    if role_part == "vice-speaker":
        extra = next((t for t in tags[1:] if t in _RANK_TAGS), None)
        if extra and "|" in first:
            from app.services.leader_spheres import canon_org_tag

            faction = canon_org_tag(first.split("|", 1)[1]) or first.split("|", 1)[1].strip()
            canon = f"[Vice-Speaker | {faction}][{extra}] {clean}"
        else:
            canon = f"[Vice-Speaker] {clean}"
        return None if canon == raw else canon

    role = inferred.get("role_type")
    org = inferred.get("org_tag")
    if not role:
        return None
    try:
        if role in ROLE_RANKS:
            if not org:
                return None
            canon = format_leadership_nickname(role, name, org)
        elif org:
            canon = format_leadership_nickname(role, name, org)
        else:
            canon = f"[{first}] {clean}"
    except ValueError:
        return None
    return None if canon == raw else canon
