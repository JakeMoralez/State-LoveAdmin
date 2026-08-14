"""Loot case CRUD and weighted spin."""

from __future__ import annotations

import random
import uuid

from fastapi import HTTPException

from app.models.panel import LootCase, LootCasePrize

MIN_PRIZES_FOR_SPIN = 2
DEFAULT_SPIN_DURATION_MS = 28000
LEGACY_SPIN_DURATION_MS = 12000
LEGACY_SPIN_DURATION_MS_V2 = 20000
MIN_SPIN_DURATION_MS = 3000
MAX_SPIN_DURATION_MS = 45000


def normalize_spin_duration_ms(value: int | None) -> int:
    if value is None or int(value) in (LEGACY_SPIN_DURATION_MS, LEGACY_SPIN_DURATION_MS_V2):
        return DEFAULT_SPIN_DURATION_MS
    return max(MIN_SPIN_DURATION_MS, min(MAX_SPIN_DURATION_MS, int(value)))


def serialize_prize(p: LootCasePrize) -> dict:
    return {
        "id": p.id,
        "case_id": p.case_id,
        "title": p.title,
        "image_url": p.image_url,
        "weight": p.weight,
        "sort_order": p.sort_order,
        "rarity_label": p.rarity_label,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


async def serialize_case(case: LootCase, *, include_prizes: bool = False) -> dict:
    prize_count = await LootCasePrize.filter(case_id=case.id).count()
    data = {
        "id": case.id,
        "title": case.title,
        "description": case.description,
        "cover_image_url": case.cover_image_url,
        "is_active": case.is_active,
        "spin_duration_ms": normalize_spin_duration_ms(getattr(case, "spin_duration_ms", None)),
        "created_by_vk_id": case.created_by_vk_id,
        "prize_count": prize_count,
        "can_spin": prize_count >= MIN_PRIZES_FOR_SPIN,
        "created_at": case.created_at.isoformat(),
        "updated_at": case.updated_at.isoformat(),
    }
    if include_prizes:
        prizes = await LootCasePrize.filter(case_id=case.id).order_by("sort_order", "id")
        data["prizes"] = [serialize_prize(p) for p in prizes]
    return data


async def get_case_or_404(case_id: int) -> LootCase:
    case = await LootCase.get_or_none(id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Кейс не найден")
    return case


async def get_prize_or_404(case_id: int, prize_id: int) -> LootCasePrize:
    prize = await LootCasePrize.get_or_none(id=prize_id, case_id=case_id)
    if not prize:
        raise HTTPException(status_code=404, detail="Приз не найден")
    return prize


async def list_spin_prizes(case_id: int) -> list[LootCasePrize]:
    prizes = await LootCasePrize.filter(case_id=case_id).order_by("sort_order", "id")
    if len(prizes) < MIN_PRIZES_FOR_SPIN:
        raise HTTPException(
            status_code=400,
            detail=f"Нужно минимум {MIN_PRIZES_FOR_SPIN} приза для прокрутки",
        )
    for p in prizes:
        if p.weight < 1:
            raise HTTPException(status_code=400, detail="Вес приза должен быть >= 1")
    return prizes


def normalize_rarity(label: str) -> str:
    key = (label or "").strip().lower()
    if not key or key == "common" or "обыч" in key:
        return ""
    if "legend" in key or "легенд" in key:
        return "legendary"
    if "epic" in key or "эпич" in key:
        return "epic"
    if "uncommon" in key or "необыч" in key:
        return "uncommon"
    if "rare" in key or "редк" in key:
        return "rare"
    return key


# Сначала редкость, затем приз внутри редкости с учётом «в ленте» (weight).
RARITY_DROP_WEIGHT = {
    "": 50,
    "uncommon": 25,
    "rare": 12,
    "epic": 5,
    "legendary": 2,
}


def _prize_copies(prize: LootCasePrize) -> int:
    return max(1, int(getattr(prize, "weight", 1) or 1))


def pick_weighted_prize(prizes: list[LootCasePrize]) -> LootCasePrize:
    buckets: dict[str, list[LootCasePrize]] = {}
    for prize in prizes:
        rarity = normalize_rarity(prize.rarity_label)
        buckets.setdefault(rarity, []).append(prize)
    keys = list(buckets)
    rarity_weights = [RARITY_DROP_WEIGHT.get(key, RARITY_DROP_WEIGHT[""]) for key in keys]
    rarity = random.choices(keys, weights=rarity_weights, k=1)[0]
    pool = buckets[rarity]
    return random.choices(pool, weights=[_prize_copies(p) for p in pool], k=1)[0]


async def spin_case(case_id: int) -> dict:
    case = await get_case_or_404(case_id)
    prizes = await list_spin_prizes(case_id)
    winner = pick_weighted_prize(prizes)
    return {
        "spin_token": str(uuid.uuid4()),
        "spin_duration_ms": normalize_spin_duration_ms(getattr(case, "spin_duration_ms", None)),
        "prize": serialize_prize(winner),
        "prizes": [serialize_prize(p) for p in prizes],
    }
