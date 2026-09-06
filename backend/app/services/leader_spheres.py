"""Тег фракции / министерства → сфера следящих."""

from __future__ import annotations

import re

from app.services.staff_spheres import ALL_SPHERE_KEYS

VALID_SPHERES = frozenset(ALL_SPHERE_KEYS)

DEFAULT_TAG_SPHERES: dict[str, str] = {
    "GOV": "gov_structures",
    "LC": "gov_structures",
    "FBI": "gov_structures",
    "LSPD": "gov_structures",
    "RCSD": "gov_structures",
    "SFPD": "gov_structures",
    "SWAT": "gov_structures",
    "FP": "gov_structures",
    "LSa": "defense",
    "SFa": "defense",
    "LSMC": "health",
    "LVMC": "health",
    "SFFD": "health",
    "CNN LS": "gov_structures",
    "Pr.Min": "central_apparatus",
    "Min.Just": "justice",
    "Min.Nat.Sec": "defense",
    "Min.Soc": "central_apparatus",
    "Ad.Pr.Min": "central_apparatus",
    "Ad.Min.Just": "justice",
    "Ad.Min.Nat.Sec": "defense",
    "Ad.Min.Soc": "central_apparatus",
}

# Кириллица и старые написания → канонический тег из справочника.
TAG_ALIASES: dict[str, str] = {
    "gov": "GOV",
    "гов": "GOV",
    "lc": "LC",
    "лк": "LC",
    "fbi": "FBI",
    "фбр": "FBI",
    "lspd": "LSPD",
    "лспд": "LSPD",
    "rcsd": "RCSD",
    "ркшд": "RCSD",
    "sfpd": "SFPD",
    "сфпд": "SFPD",
    "swat": "SWAT",
    "сват": "SWAT",
    "fp": "FP",
    "lsa": "LSa",
    "лса": "LSa",
    "sfa": "SFa",
    "сфа": "SFa",
    "lsmc": "LSMC",
    "лсмк": "LSMC",
    "lvmc": "LVMC",
    "лвмк": "LVMC",
    "sffd": "SFFD",
    "сффд": "SFFD",
    "cnn": "CNN LS",
    "cnn ls": "CNN LS",
}

_POS_PREFIX_RE = re.compile(r"^(?:заместитель|зам|лидер)[.\s]*", re.IGNORECASE)
_RANK_TAG_RE = re.compile(r"^(?:9|10)$")


def canon_org_tag(raw: str | None) -> str:
    text = " ".join((raw or "").split())
    if "|" in text:
        text = text.split("|")[-1].strip()
    text = _POS_PREFIX_RE.sub("", text).strip(" .")
    if not text:
        return ""
    return TAG_ALIASES.get(text.casefold(), text)


def resolve_leadership_sphere(
    nickname: str | None,
    tag_spheres: dict[str, str] | None = None,
) -> str | None:
    from app.services.leader_nickname import extract_org_tag

    raw = extract_org_tag(nickname)
    if not raw or _RANK_TAG_RE.match(raw.strip()):
        return None
    tag = canon_org_tag(raw)
    if not tag:
        return None
    mapping = tag_spheres or DEFAULT_TAG_SPHERES
    folded = {key.casefold(): value for key, value in mapping.items()}
    sphere = folded.get(tag.casefold())
    if sphere == "server":
        return "gov_structures"
    if sphere in VALID_SPHERES:
        return sphere
    return None


def clean_tag_spheres(
    raw: object | None,
    *,
    known_tags: list[str],
) -> dict[str, str]:
    src = raw if isinstance(raw, dict) else {}
    out: dict[str, str] = {}
    seen: set[str] = set()
    for tag in known_tags:
        cleaned = " ".join(str(tag or "").split())
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        chosen = src.get(cleaned) or src.get(key) or DEFAULT_TAG_SPHERES.get(cleaned)
        if chosen == "server":
            chosen = "gov_structures"
        if chosen in VALID_SPHERES:
            out[cleaned] = chosen
    for raw_key, raw_val in src.items():
        tag = " ".join(str(raw_key or "").split())
        if not tag or tag.casefold() in seen:
            continue
        sphere = "gov_structures" if raw_val == "server" else raw_val
        if sphere in VALID_SPHERES:
            seen.add(tag.casefold())
            out[tag] = sphere
    return out
