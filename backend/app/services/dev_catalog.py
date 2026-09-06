"""Справочники назначения: фракции, министры, советники, должности судей."""

from __future__ import annotations

from copy import deepcopy

from app.models.panel import PanelCatalog
from app.services.leader_nickname import ADVISOR_TAGS, FACTION_TAGS, MINISTER_TAGS
from app.services.role_assign import JUDGE_POSITIONS

DEFAULT_MINISTER_ITEMS: list[dict[str, str]] = [
    {"value": "Pr.Min", "label": "Премьер-министр"},
    {"value": "Min.Just", "label": "Министр юстиции"},
    {"value": "Min.Nat.Sec", "label": "Министр нац. безопасности"},
    {"value": "Min.Soc", "label": "Министр соц. служб"},
]

DEFAULT_ADVISOR_ITEMS: list[dict[str, str]] = [
    {"value": "Ad.Pr.Min", "label": "Советник премьера"},
    {"value": "Ad.Min.Just", "label": "Советник мин. юстиции"},
    {"value": "Ad.Min.Nat.Sec", "label": "Советник мин. нац. безопасности"},
    {"value": "Ad.Min.Soc", "label": "Советник мин. соц. служб"},
]


def default_catalog() -> dict:
    return {
        "factions": list(FACTION_TAGS),
        "ministers": deepcopy(DEFAULT_MINISTER_ITEMS),
        "advisors": deepcopy(DEFAULT_ADVISOR_ITEMS),
        "judge_positions": list(JUDGE_POSITIONS),
    }


def _clean_tag(raw: object) -> str | None:
    text = " ".join(str(raw or "").split())
    if not text or len(text) > 32:
        return None
    return text


def _clean_items(raw: object, *, fallback: list[dict[str, str]]) -> list[dict[str, str]]:
    if not isinstance(raw, list) or not raw:
        return deepcopy(fallback)
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in raw:
        if isinstance(row, str):
            value = _clean_tag(row)
            label = value
        elif isinstance(row, dict):
            value = _clean_tag(row.get("value") or row.get("id") or row.get("tag"))
            label = str(row.get("label") or value or "").strip()
        else:
            continue
        if not value:
            continue
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append({"value": value, "label": label or value})
    return out or deepcopy(fallback)


def _clean_strings(raw: object, *, fallback: list[str]) -> list[str]:
    if not isinstance(raw, list) or not raw:
        return list(fallback)
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = " ".join(str(item or "").split())
        if not text or text.casefold() in seen:
            continue
        seen.add(text.casefold())
        out.append(text)
    return out or list(fallback)


def normalize_catalog(raw: object | None) -> dict:
    data = raw if isinstance(raw, dict) else {}
    defaults = default_catalog()
    factions_raw = data.get("factions")
    if isinstance(factions_raw, list) and factions_raw and isinstance(factions_raw[0], dict):
        factions = [item["value"] for item in _clean_items(factions_raw, fallback=[])]
        if not factions:
            factions = list(defaults["factions"])
    else:
        factions = _clean_strings(factions_raw, fallback=defaults["factions"])
    return {
        "factions": factions,
        "ministers": _clean_items(data.get("ministers") or data.get("minister_tags"), fallback=defaults["ministers"]),
        "advisors": _clean_items(data.get("advisors") or data.get("advisor_tags"), fallback=defaults["advisors"]),
        "judge_positions": _clean_strings(data.get("judge_positions"), fallback=defaults["judge_positions"]),
    }


async def get_catalog() -> dict:
    row = await PanelCatalog.get_or_none(id=1)
    if not row or not row.data:
        return default_catalog()
    return normalize_catalog(row.data)


async def save_catalog(data: object, *, updated_by: int | None) -> dict:
    cleaned = normalize_catalog(data)
    row, _ = await PanelCatalog.get_or_create(id=1, defaults={"data": cleaned})
    row.data = cleaned
    row.updated_by = updated_by
    await row.save()
    return cleaned


async def get_org_tag_lists() -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    catalog = await get_catalog()
    factions = tuple(catalog["factions"]) or FACTION_TAGS
    ministers = tuple(item["value"] for item in catalog["ministers"]) or MINISTER_TAGS
    advisors = tuple(item["value"] for item in catalog["advisors"]) or ADVISOR_TAGS
    return factions, ministers, advisors


async def get_judge_positions() -> tuple[str, ...]:
    catalog = await get_catalog()
    positions = tuple(catalog["judge_positions"])
    return positions or JUDGE_POSITIONS
