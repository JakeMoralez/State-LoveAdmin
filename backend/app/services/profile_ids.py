"""Публичные ID профилей портала (URL /profile/{public_id}).

Последовательные целые: 1, 2, 3… Legacy: длинный vk_id (≥7 цифр) → ensure + канон.
"""

from __future__ import annotations

from typing import Iterable

from tortoise.functions import Max

from app.models.panel import PanelProfileId

# Короткие числа — только public_id; длинные — возможно старый vk_id в закладке
_LEGACY_VK_MIN_DIGITS = 7


def _is_positive_int_str(value: str) -> bool:
    raw = (value or "").strip()
    return bool(raw) and raw.isdigit() and int(raw) > 0


async def _next_public_id() -> int:
    row = await PanelProfileId.annotate(m=Max("public_id")).values("m")
    current = 0
    if row:
        current = int(row[0].get("m") or 0)
    return current + 1


async def ensure_public_id(vk_id: int) -> int:
    existing = await PanelProfileId.get_or_none(vk_id=vk_id)
    if existing:
        return int(existing.public_id)
    for _ in range(16):
        candidate = await _next_public_id()
        if await PanelProfileId.exists(public_id=candidate):
            continue
        try:
            await PanelProfileId.create(vk_id=vk_id, public_id=candidate)
            return candidate
        except Exception:
            existing = await PanelProfileId.get_or_none(vk_id=vk_id)
            if existing:
                return int(existing.public_id)
    raise RuntimeError(f"Could not allocate public_id for vk_id={vk_id}")


async def ensure_public_ids(vk_ids: Iterable[int]) -> dict[int, int]:
    ids = {int(v) for v in vk_ids if v is not None}
    if not ids:
        return {}
    existing = await PanelProfileId.filter(vk_id__in=list(ids))
    out = {int(r.vk_id): int(r.public_id) for r in existing}
    missing = ids - out.keys()
    for vk_id in missing:
        out[vk_id] = await ensure_public_id(vk_id)
    return out


async def attach_public_ids(rows: list[dict]) -> None:
    mapping = await ensure_public_ids(r["vk_id"] for r in rows if r.get("vk_id") is not None)
    for r in rows:
        vk = r.get("vk_id")
        if vk is not None:
            r["public_id"] = mapping.get(int(vk))


async def resolve_profile_key(key: str) -> dict | None:
    """
    Резолв ключа из URL.
    1) public_id (любое положительное число, в т.ч. 1..6)
    2) legacy длинный vk_id (≥7 цифр) → выдать/найти public_id
    """
    raw = (key or "").strip()
    if not _is_positive_int_str(raw):
        return None
    n = int(raw)

    by_public = await PanelProfileId.get_or_none(public_id=n)
    if by_public:
        return {"vk_id": int(by_public.vk_id), "public_id": int(by_public.public_id)}

    if len(raw) >= _LEGACY_VK_MIN_DIGITS:
        public_id = await ensure_public_id(n)
        return {"vk_id": n, "public_id": public_id}
    return None


async def renumber_profile_ids_if_needed() -> None:
    """
    Если в таблице ещё строковые/дырявые id — перенумеровать 1..N по created_at.
    Вызывать после того, как схема int уже на месте (или через raw rebuild).
    """
    rows = await PanelProfileId.all().order_by("created_at", "vk_id")
    if not rows:
        return
    ids = [int(r.public_id) for r in rows]
    expected = list(range(1, len(ids) + 1))
    if ids == expected:
        return
    # Временные отрицательные, чтобы не конфликтовать unique
    for i, row in enumerate(rows, start=1):
        row.public_id = -i
        await row.save()
    for i, row in enumerate(rows, start=1):
        row.public_id = i
        await row.save()
