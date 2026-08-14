"""Dev-only loot case CRUD and spin."""

from __future__ import annotations

import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.routers.dev import require_dev_user
from app.services.audit import log_audit
from app.services.cases import (
    MAX_SPIN_DURATION_MS,
    MIN_SPIN_DURATION_MS,
    get_case_or_404,
    get_prize_or_404,
    normalize_spin_duration_ms,
    serialize_case,
    serialize_prize,
    spin_case,
)
from app.models.panel import LootCase, LootCasePrize

router = APIRouter(prefix="/api/dev/cases", tags=["dev-cases"])


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    description: str = ""
    cover_image_url: str = ""
    is_active: bool = True
    spin_duration_ms: int = Field(default=28000, ge=MIN_SPIN_DURATION_MS, le=MAX_SPIN_DURATION_MS)


class CaseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None
    cover_image_url: str | None = None
    is_active: bool | None = None
    spin_duration_ms: int | None = Field(default=None, ge=MIN_SPIN_DURATION_MS, le=MAX_SPIN_DURATION_MS)


class PrizeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    image_url: str = ""
    weight: int = Field(default=1, ge=1, le=10000)
    sort_order: int = 0
    rarity_label: str = Field(default="", max_length=64)


class PrizeBulkItem(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    image_url: str = ""
    weight: int = Field(default=1, ge=1, le=10000)
    sort_order: int | None = None
    rarity_label: str = Field(default="", max_length=64)


class PrizeBulkImport(BaseModel):
    prizes: list[PrizeBulkItem] = Field(min_length=1, max_length=200)
    replace: bool = False


class PrizeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    image_url: str | None = None
    weight: int | None = Field(default=None, ge=1, le=10000)
    sort_order: int | None = None
    rarity_label: str | None = Field(default=None, max_length=64)


@router.get("")
async def list_cases(user: dict = Depends(require_dev_user)):
    cases = await LootCase.all().order_by("-updated_at")
    result = [await serialize_case(c) for c in cases]
    return {"cases": result}


@router.post("")
async def create_case(body: CaseCreate, user: dict = Depends(require_dev_user)):
    case = await LootCase.create(
        title=body.title.strip(),
        description=body.description.strip(),
        cover_image_url=body.cover_image_url.strip(),
        is_active=body.is_active,
        spin_duration_ms=normalize_spin_duration_ms(body.spin_duration_ms),
        created_by_vk_id=user["vk_id"],
    )
    await log_audit(user["vk_id"], "loot_case_create", "loot_case", case.id, {"title": case.title})
    return await serialize_case(case, include_prizes=True)


@router.get("/{case_id}")
async def get_case(case_id: int, user: dict = Depends(require_dev_user)):
    case = await get_case_or_404(case_id)
    return await serialize_case(case, include_prizes=True)


@router.patch("/{case_id}")
async def update_case(
    case_id: int,
    body: CaseUpdate,
    user: dict = Depends(require_dev_user),
):
    case = await get_case_or_404(case_id)
    fields = body.model_dump(exclude_unset=True)
    if "title" in fields and fields["title"] is not None:
        fields["title"] = fields["title"].strip()
    if "description" in fields and fields["description"] is not None:
        fields["description"] = fields["description"].strip()
    if "cover_image_url" in fields and fields["cover_image_url"] is not None:
        fields["cover_image_url"] = fields["cover_image_url"].strip()
    if "spin_duration_ms" in fields and fields["spin_duration_ms"] is not None:
        fields["spin_duration_ms"] = normalize_spin_duration_ms(fields["spin_duration_ms"])
    for key, value in fields.items():
        setattr(case, key, value)
    await case.save()
    await log_audit(user["vk_id"], "loot_case_update", "loot_case", case.id, fields)
    return await serialize_case(case, include_prizes=True)


@router.delete("/{case_id}")
async def delete_case(case_id: int, user: dict = Depends(require_dev_user)):
    case = await get_case_or_404(case_id)
    await LootCasePrize.filter(case_id=case_id).delete()
    title = case.title
    await case.delete()
    await log_audit(user["vk_id"], "loot_case_delete", "loot_case", case_id, {"title": title})
    return {"ok": True}


@router.get("/{case_id}/prizes")
async def list_prizes(case_id: int, user: dict = Depends(require_dev_user)):
    await get_case_or_404(case_id)
    prizes = await LootCasePrize.filter(case_id=case_id).order_by("sort_order", "id")
    return {"prizes": [serialize_prize(p) for p in prizes]}


@router.post("/{case_id}/prizes")
async def create_prize(
    case_id: int,
    body: PrizeCreate,
    user: dict = Depends(require_dev_user),
):
    await get_case_or_404(case_id)
    prize = await LootCasePrize.create(
        case_id=case_id,
        title=body.title.strip(),
        image_url=body.image_url.strip(),
        weight=body.weight,
        sort_order=body.sort_order,
        rarity_label=body.rarity_label.strip(),
    )
    await log_audit(
        user["vk_id"],
        "loot_case_prize_create",
        "loot_case_prize",
        prize.id,
        {"case_id": case_id, "title": prize.title},
    )
    return serialize_prize(prize)


@router.post("/{case_id}/prizes/bulk")
async def import_prizes(
    case_id: int,
    body: PrizeBulkImport,
    user: dict = Depends(require_dev_user),
):
    case = await get_case_or_404(case_id)
    if body.replace:
        await LootCasePrize.filter(case_id=case_id).delete()
        start_order = 0
    else:
        start_order = await LootCasePrize.filter(case_id=case_id).count()

    created: list[LootCasePrize] = []
    for i, item in enumerate(body.prizes):
        prize = await LootCasePrize.create(
            case_id=case_id,
            title=item.title.strip(),
            image_url=(item.image_url or "").strip(),
            weight=item.weight,
            sort_order=item.sort_order if item.sort_order is not None else start_order + i,
            rarity_label=(item.rarity_label or "").strip(),
        )
        created.append(prize)

    await log_audit(
        user["vk_id"],
        "loot_case_prize_bulk",
        "loot_case",
        case_id,
        {"replace": body.replace, "count": len(created), "titles": [p.title for p in created[:30]]},
    )
    return await serialize_case(case, include_prizes=True)


@router.post("/{case_id}/prizes/shuffle")
async def shuffle_prizes(case_id: int, user: dict = Depends(require_dev_user)):
    case = await get_case_or_404(case_id)
    prizes = await LootCasePrize.filter(case_id=case_id)
    if len(prizes) < 2:
        raise HTTPException(status_code=400, detail="Нужно минимум 2 приза")
    order = list(range(len(prizes)))
    random.shuffle(order)
    for prize, sort_order in zip(prizes, order):
        prize.sort_order = sort_order
        await prize.save(update_fields=["sort_order"])
    await log_audit(
        user["vk_id"],
        "loot_case_prize_shuffle",
        "loot_case",
        case_id,
        {"count": len(prizes)},
    )
    return await serialize_case(case, include_prizes=True)


@router.patch("/{case_id}/prizes/{prize_id}")
async def update_prize(
    case_id: int,
    prize_id: int,
    body: PrizeUpdate,
    user: dict = Depends(require_dev_user),
):
    prize = await get_prize_or_404(case_id, prize_id)
    fields = body.model_dump(exclude_unset=True)
    if "title" in fields and fields["title"] is not None:
        fields["title"] = fields["title"].strip()
    if "image_url" in fields and fields["image_url"] is not None:
        fields["image_url"] = fields["image_url"].strip()
    if "rarity_label" in fields and fields["rarity_label"] is not None:
        fields["rarity_label"] = fields["rarity_label"].strip()
    for key, value in fields.items():
        setattr(prize, key, value)
    await prize.save()
    await log_audit(
        user["vk_id"],
        "loot_case_prize_update",
        "loot_case_prize",
        prize.id,
        fields,
    )
    return serialize_prize(prize)


@router.delete("/{case_id}/prizes/{prize_id}")
async def delete_prize(
    case_id: int,
    prize_id: int,
    user: dict = Depends(require_dev_user),
):
    prize = await get_prize_or_404(case_id, prize_id)
    title = prize.title
    await prize.delete()
    await log_audit(
        user["vk_id"],
        "loot_case_prize_delete",
        "loot_case_prize",
        prize_id,
        {"case_id": case_id, "title": title},
    )
    return {"ok": True}


@router.post("/{case_id}/spin")
async def spin(case_id: int, user: dict = Depends(require_dev_user)):
    result = await spin_case(case_id)
    await log_audit(
        user["vk_id"],
        "loot_case_spin",
        "loot_case",
        case_id,
        {"prize_id": result["prize"]["id"], "prize_title": result["prize"]["title"]},
    )
    return result
