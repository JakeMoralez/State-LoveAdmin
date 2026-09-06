"""Ники руководителей в формате /snick: [LSPD] [10] Name_Surname."""

from __future__ import annotations

import re

from app.services.staff_nickname import extract_leading_nickname_tag, strip_nickname_tags

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
        nick = f"[{tag}] [{ROLE_RANKS[role_type]}] {clean}"
    else:
        nick = f"[{tag}] {clean}"
    if len(nick) > 64:
        raise ValueError("Ник слишком длинный (макс. 64)")
    return nick


def extract_org_tag(raw: str | None) -> str:
    tag = extract_leading_nickname_tag(raw)
    return tag or ""
