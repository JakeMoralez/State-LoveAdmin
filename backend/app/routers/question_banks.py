"""Question banks API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import DEFAULT_SERVER_ID
from app.models.bot import AccessLevel
from app.models.panel import QuestionBank, QuestionBankItem
from app.services.audit import log_audit
from app.services.auth import require_ca_user
from app.services.question_banks import (
    DIFFICULTY_LABELS,
    STATUS_LABELS,
    ZGS_MIN_LEVEL,
    apply_item_updates,
    assert_can_manage,
    assert_can_submit,
    bank_counts,
    bank_permissions,
    can_delete_item,
    can_edit_item,
    can_view_item,
    collect_tag_suggestions,
    create_item,
    item_filter_for_user,
    item_history,
    review_item,
    serialize_bank,
    serialize_item,
    submit_item,
)

router = APIRouter(prefix="/api/question-banks", tags=["question-banks"])


class BankBody(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    description: str = ""
    emoji: str = Field(default="", max_length=16)
    min_submit_level: int = Field(default=1, ge=1, le=AccessLevel.DEVELOPER)
    min_approve_level: int = Field(default=ZGS_MIN_LEVEL, ge=1, le=AccessLevel.DEVELOPER)
    sort_order: int = 0
    is_active: bool = True


class ItemBody(BaseModel):
    text: str = Field(min_length=1)
    correct_answer: str = ""
    source: str = ""
    answer_comment: str = ""
    tags: list[str] = Field(default_factory=list)
    difficulty: int = Field(default=3, ge=1, le=5)


class ItemPatchBody(BaseModel):
    text: str | None = None
    correct_answer: str | None = None
    source: str | None = None
    answer_comment: str | None = None
    tags: list[str] | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)


class ReviewBody(BaseModel):
    action: str = Field(pattern="^(approve|reject|needs_revision)$")
    review_note: str = ""
    text: str | None = None
    correct_answer: str | None = None
    source: str | None = None
    answer_comment: str | None = None
    tags: list[str] | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)


async def _get_bank(bank_id: int, server_id: int = DEFAULT_SERVER_ID) -> QuestionBank:
    bank = await QuestionBank.get_or_none(id=bank_id, server_id=server_id)
    if not bank:
        raise HTTPException(status_code=404, detail="Банк не найден")
    return bank


async def _get_item(bank_id: int, item_id: int) -> QuestionBankItem:
    item = await QuestionBankItem.get_or_none(id=item_id, bank_id=bank_id)
    if not item:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    return item


def _item_patch_dict(body: ItemPatchBody) -> dict:
    data = body.model_dump(exclude_unset=True)
    return data


def _review_field_updates(body: ReviewBody) -> dict:
    return body.model_dump(exclude_unset=True, exclude={"action", "review_note"})


@router.get("/meta")
async def question_bank_meta(user: dict = Depends(require_ca_user)):
    perms = bank_permissions(user)
    tags = await collect_tag_suggestions()
    return {
        "permissions": perms,
        "status_labels": STATUS_LABELS,
        "difficulty_labels": {str(k): v for k, v in DIFFICULTY_LABELS.items()},
        "tag_suggestions": tags,
        "access_levels": [
            {"value": level, "label": AccessLevel.title(level)}
            for level in sorted(AccessLevel.NAMES.keys())
        ],
    }


@router.get("/pending-review")
async def pending_review(user: dict = Depends(require_ca_user)):
    perms = bank_permissions(user)
    if not perms["can_review"]:
        raise HTTPException(status_code=403, detail="Очередь проверки доступна ГС/ЗГС+")

    items = (
        await QuestionBankItem.filter(server_id=DEFAULT_SERVER_ID, status="pending")
        .order_by("created_at")
        .prefetch_related("bank")
    )
    bank_titles = {i.bank_id: i.bank.title for i in items if i.bank}
    vk_ids: set[int] = set()
    for item in items:
        vk_ids.add(item.created_by_vk_id)
    from app.services.display_names import resolve_display_names

    names = await resolve_display_names(vk_ids)
    out = []
    for item in items:
        row = await serialize_item(item, names=names)
        row["bank_title"] = bank_titles.get(item.bank_id, "")
        out.append(row)
    return {"items": out, "permissions": perms}


@router.get("")
async def list_banks(
    q: str | None = None,
    user: dict = Depends(require_ca_user),
):
    perms = bank_permissions(user)
    qs = QuestionBank.filter(server_id=DEFAULT_SERVER_ID)
    if not perms["can_manage"]:
        qs = qs.filter(is_active=True)
    if q:
        qs = qs.filter(title__icontains=q.strip())
    banks = await qs.order_by("sort_order", "title")
    result = []
    for bank in banks:
        confirmed, pending = await bank_counts(bank.id)
        result.append(
            await serialize_bank(
                bank,
                question_count=confirmed,
                pending_count=pending,
                permissions=bank_permissions(user, bank),
            )
        )
    return {"banks": result, "permissions": perms}


@router.post("")
async def create_bank(body: BankBody, user: dict = Depends(require_ca_user)):
    assert_can_manage(user)
    bank = await QuestionBank.create(
        server_id=DEFAULT_SERVER_ID,
        title=body.title.strip(),
        description=body.description.strip(),
        emoji=body.emoji.strip(),
        min_submit_level=body.min_submit_level,
        min_approve_level=body.min_approve_level,
        created_by_vk_id=user["vk_id"],
        sort_order=body.sort_order,
        is_active=body.is_active,
    )
    await log_audit(user["vk_id"], "qb_bank_create", "question_bank", bank.id, {"title": bank.title})
    return await serialize_bank(bank, permissions=bank_permissions(user, bank))


@router.get("/{bank_id}")
async def get_bank(
    bank_id: int,
    status: str | None = None,
    user: dict = Depends(require_ca_user),
):
    bank = await _get_bank(bank_id)
    perms = bank_permissions(user, bank)
    if not bank.is_active and not perms["can_manage"]:
        raise HTTPException(status_code=404, detail="Банк не найден")

    qs = QuestionBankItem.filter(bank_id=bank.id)
    filt = item_filter_for_user(user)
    if filt is not None:
        qs = qs.filter(filt)
    if status:
        qs = qs.filter(status=status)
    items = await qs.order_by("-created_at")

    vk_ids: set[int] = set()
    for item in items:
        vk_ids.add(item.created_by_vk_id)
        if item.reviewed_by_vk_id:
            vk_ids.add(item.reviewed_by_vk_id)
    from app.services.display_names import resolve_display_names

    names = await resolve_display_names(vk_ids)
    confirmed, pending = await bank_counts(bank.id)
    data = await serialize_bank(
        bank,
        question_count=confirmed,
        pending_count=pending,
        permissions=perms,
    )
    data["questions"] = [await serialize_item(i, names=names) for i in items]
    return data


@router.patch("/{bank_id}")
async def update_bank(bank_id: int, body: BankBody, user: dict = Depends(require_ca_user)):
    bank = await _get_bank(bank_id)
    assert_can_manage(user)
    bank.title = body.title.strip()
    bank.description = body.description.strip()
    bank.emoji = body.emoji.strip()
    bank.min_submit_level = body.min_submit_level
    bank.min_approve_level = body.min_approve_level
    bank.sort_order = body.sort_order
    bank.is_active = body.is_active
    await bank.save()
    await log_audit(user["vk_id"], "qb_bank_update", "question_bank", bank.id, {"title": bank.title})
    confirmed, pending = await bank_counts(bank.id)
    return await serialize_bank(
        bank,
        question_count=confirmed,
        pending_count=pending,
        permissions=bank_permissions(user, bank),
    )


@router.delete("/{bank_id}")
async def delete_bank(bank_id: int, user: dict = Depends(require_ca_user)):
    bank = await _get_bank(bank_id)
    assert_can_manage(user)
    await QuestionBankItem.filter(bank_id=bank.id).delete()
    await bank.delete()
    await log_audit(user["vk_id"], "qb_bank_delete", "question_bank", bank_id, {})
    return {"ok": True}


@router.post("/{bank_id}/questions")
async def create_question(
    bank_id: int,
    body: ItemBody,
    direct: bool = Query(default=False),
    user: dict = Depends(require_ca_user),
):
    bank = await _get_bank(bank_id)
    item = await create_item(bank, user, body.model_dump(), direct=direct)
    return await serialize_item(item)


@router.patch("/{bank_id}/questions/{item_id}")
async def update_question(
    bank_id: int,
    item_id: int,
    body: ItemPatchBody,
    user: dict = Depends(require_ca_user),
):
    bank = await _get_bank(bank_id)
    item = await _get_item(bank_id, item_id)
    if not can_view_item(user, item):
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    if not can_edit_item(user, item, bank):
        raise HTTPException(status_code=403, detail="Нельзя редактировать этот вопрос")

    updates = _item_patch_dict(body)
    if not updates:
        return await serialize_item(item)
    if "text" in updates and not (updates["text"] or "").strip():
        raise HTTPException(status_code=400, detail="Текст вопроса обязателен")

    if item.status == "rejected":
        item.status = "draft"
        await item.save()

    await apply_item_updates(item, user["vk_id"], updates)
    return await serialize_item(item)


@router.delete("/{bank_id}/questions/{item_id}")
async def delete_question(
    bank_id: int,
    item_id: int,
    user: dict = Depends(require_ca_user),
):
    bank = await _get_bank(bank_id)
    item = await _get_item(bank_id, item_id)
    if not can_delete_item(user, item, bank):
        raise HTTPException(status_code=403, detail="Нельзя удалить этот вопрос")
    await item.delete()
    await log_audit(user["vk_id"], "qb_item_delete", "question_bank_item", item_id, {"bank_id": bank_id})
    return {"ok": True}


@router.post("/{bank_id}/questions/{item_id}/submit")
async def submit_question(
    bank_id: int,
    item_id: int,
    user: dict = Depends(require_ca_user),
):
    bank = await _get_bank(bank_id)
    item = await _get_item(bank_id, item_id)
    assert_can_submit(user, bank)
    item = await submit_item(item, user, bank)
    return await serialize_item(item)


@router.post("/{bank_id}/questions/{item_id}/review")
async def review_question(
    bank_id: int,
    item_id: int,
    body: ReviewBody,
    user: dict = Depends(require_ca_user),
):
    bank = await _get_bank(bank_id)
    item = await _get_item(bank_id, item_id)
    item = await review_item(
        item,
        user,
        bank,
        action=body.action,
        review_note=body.review_note,
        field_updates=_review_field_updates(body),
    )
    return await serialize_item(item)


@router.get("/{bank_id}/questions/{item_id}/history")
async def question_history(
    bank_id: int,
    item_id: int,
    user: dict = Depends(require_ca_user),
):
    bank = await _get_bank(bank_id)
    item = await _get_item(bank_id, item_id)
    if not can_view_item(user, item):
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    events = await item_history(item.id, bank.server_id)
    return {"events": events}
