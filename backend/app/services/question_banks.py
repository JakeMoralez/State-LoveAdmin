"""Question banks: permissions, moderation workflow, history."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from app.config import DEFAULT_SERVER_ID
from app.models.bot import AccessLevel
from app.models.panel import QuestionBank, QuestionBankItem, QuestionBankItemEvent
from app.services.audit import log_audit
from app.services.display_names import resolve_display_name, resolve_display_names

ZGS_MIN_LEVEL = 3

STATUSES = ("draft", "pending", "confirmed", "rejected", "needs_revision")

STATUS_LABELS: dict[str, str] = {
    "draft": "Черновик",
    "pending": "На проверке",
    "confirmed": "Подтверждён",
    "rejected": "Отклонён",
    "needs_revision": "Требует доработки",
}

DIFFICULTY_LABELS: dict[int, str] = {
    1: "Очень лёгкая",
    2: "Лёгкая",
    3: "Средняя",
    4: "Сложная",
    5: "Очень сложная",
}

EVENT_LABELS: dict[str, str] = {
    "created": "создал вопрос",
    "updated": "обновил вопрос",
    "submitted": "отправил на проверку",
    "approved": "одобрил",
    "rejected": "отклонил",
    "needs_revision": "вернул на доработку",
    "comment": "оставил комментарий",
}

STATUS_TO_VERIFICATION: dict[str, str] = {
    "draft": "pending",
    "pending": "pending",
    "confirmed": "approved",
    "rejected": "rejected",
    "needs_revision": "pending",
}


def _sync_legacy_verification(item: QuestionBankItem) -> None:
    item.verification_status = STATUS_TO_VERIFICATION.get(item.status, "pending")
    if item.status in ("confirmed", "rejected", "needs_revision"):
        item.verified_by_vk_id = item.reviewed_by_vk_id
        item.verified_at = item.reviewed_at
    elif item.status in ("draft", "pending"):
        item.verified_by_vk_id = None
        item.verified_at = None

ITEM_FIELDS = (
    "text",
    "correct_answer",
    "source",
    "answer_comment",
    "tags",
    "difficulty",
)


def _level(user: dict) -> int:
    return int(user.get("access_level") or 0)


def bank_permissions(user: dict, bank: QuestionBank | None = None) -> dict[str, bool]:
    level = _level(user)
    min_submit = bank.min_submit_level if bank else 1
    min_approve = bank.min_approve_level if bank else ZGS_MIN_LEVEL
    can_manage = level >= ZGS_MIN_LEVEL
    can_submit = level >= min_submit
    can_review = level >= min_approve
    can_direct_confirm = level >= min_approve
    return {
        "can_manage": can_manage,
        "can_submit": can_submit,
        "can_review": can_review,
        "can_direct_confirm": can_direct_confirm,
    }


def assert_can_manage(user: dict) -> None:
    if not bank_permissions(user)["can_manage"]:
        raise HTTPException(status_code=403, detail="Управлять банками могут только ЗГС+")


def assert_can_submit(user: dict, bank: QuestionBank) -> None:
    if not bank_permissions(user, bank)["can_submit"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав для добавления вопросов")


def assert_can_review(user: dict, bank: QuestionBank) -> None:
    if not bank_permissions(user, bank)["can_review"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав для проверки вопросов")


def can_view_item(user: dict, item: QuestionBankItem) -> bool:
    perms = bank_permissions(user)
    if perms["can_review"]:
        return True
    if item.status == "confirmed":
        return True
    return item.created_by_vk_id == user["vk_id"]


def can_edit_item(user: dict, item: QuestionBankItem, bank: QuestionBank) -> bool:
    perms = bank_permissions(user, bank)
    if perms["can_manage"]:
        return True
    if perms["can_review"] and item.status == "pending":
        return True
    if item.created_by_vk_id != user["vk_id"]:
        return False
    return item.status in ("draft", "needs_revision", "rejected")


def can_delete_item(user: dict, item: QuestionBankItem, bank: QuestionBank) -> bool:
    if bank_permissions(user, bank)["can_manage"]:
        return True
    if item.created_by_vk_id != user["vk_id"]:
        return False
    return item.status in ("draft", "needs_revision", "rejected", "pending")


def item_filter_for_user(user: dict):
    perms = bank_permissions(user)
    if perms["can_review"]:
        return None
    from tortoise.expressions import Q

    vk_id = user["vk_id"]
    return Q(status="confirmed") | Q(created_by_vk_id=vk_id)


def _clamp_difficulty(value: int) -> int:
    return max(1, min(5, int(value)))


def _normalize_tags(tags: list | None) -> list[str]:
    if not tags:
        return []
    out: list[str] = []
    for tag in tags:
        t = str(tag).strip()
        if t and t not in out:
            out.append(t)
    return out


def _field_changes(before: QuestionBankItem, updates: dict) -> dict:
    changes: dict[str, dict] = {}
    for field in ITEM_FIELDS:
        if field not in updates:
            continue
        old = getattr(before, field)
        new = updates[field]
        if field == "tags":
            old = _normalize_tags(old)
            new = _normalize_tags(new)
        if field == "difficulty":
            new = _clamp_difficulty(new)
        if old != new:
            changes[field] = {"old": old, "new": new}
    return changes


async def record_event(
    item_id: int,
    actor_vk_id: int,
    action: str,
    *,
    comment: str = "",
    changes: dict | None = None,
) -> QuestionBankItemEvent:
    event = await QuestionBankItemEvent.create(
        item_id=item_id,
        actor_vk_id=actor_vk_id,
        action=action,
        comment=comment or "",
        changes=changes,
    )
    await log_audit(
        actor_vk_id,
        f"qb_item_{action}",
        "question_bank_item",
        item_id,
        {"comment": comment or None, "changes": changes},
    )
    return event


async def apply_item_updates(
    item: QuestionBankItem,
    actor_vk_id: int,
    updates: dict,
    *,
    record: bool = True,
) -> dict:
    changes = _field_changes(item, updates)
    for field in ITEM_FIELDS:
        if field not in updates:
            continue
        value = updates[field]
        if field == "tags":
            value = _normalize_tags(value)
        elif field == "difficulty":
            value = _clamp_difficulty(value)
        setattr(item, field, value)
    if changes:
        await item.save()
        if record:
            await record_event(item.id, actor_vk_id, "updated", changes=changes)
    return changes


async def create_item(
    bank: QuestionBank,
    actor: dict,
    data: dict,
    *,
    direct: bool = False,
) -> QuestionBankItem:
    assert_can_submit(actor, bank)
    perms = bank_permissions(actor, bank)
    if direct and not perms["can_direct_confirm"]:
        raise HTTPException(status_code=403, detail="Нельзя публиковать без проверки")

    status = "confirmed" if direct else "draft"
    now = datetime.now(timezone.utc)
    verification_status = "approved" if direct else "pending"
    item = await QuestionBankItem.create(
        bank_id=bank.id,
        server_id=bank.server_id,
        text=(data.get("text") or "").strip(),
        correct_answer=(data.get("correct_answer") or "").strip(),
        source=(data.get("source") or "").strip(),
        answer_comment=(data.get("answer_comment") or "").strip(),
        tags=_normalize_tags(data.get("tags")),
        difficulty=_clamp_difficulty(data.get("difficulty") or 3),
        status=status,
        verification_status=verification_status,
        created_by_vk_id=actor["vk_id"],
        reviewed_by_vk_id=actor["vk_id"] if direct else None,
        reviewed_at=now if direct else None,
        verified_by_vk_id=actor["vk_id"] if direct else None,
        verified_at=now if direct else None,
    )
    if not item.text:
        await item.delete()
        raise HTTPException(status_code=400, detail="Текст вопроса обязателен")

    await record_event(item.id, actor["vk_id"], "created")
    if direct:
        await record_event(item.id, actor["vk_id"], "approved", comment="Опубликовано без проверки")
    await log_audit(actor["vk_id"], "qb_item_create", "question_bank_item", item.id, {"bank_id": bank.id})
    return item


async def submit_item(item: QuestionBankItem, actor: dict, bank: QuestionBank) -> QuestionBankItem:
    if item.created_by_vk_id != actor["vk_id"] and not bank_permissions(actor, bank)["can_review"]:
        raise HTTPException(status_code=403, detail="Отправить может только автор")
    if item.status not in ("draft", "needs_revision", "rejected"):
        raise HTTPException(status_code=400, detail="Вопрос нельзя отправить на проверку из текущего статуса")
    if not item.text.strip():
        raise HTTPException(status_code=400, detail="Заполните текст вопроса")

    item.status = "pending"
    item.review_note = ""
    _sync_legacy_verification(item)
    await item.save()
    await record_event(item.id, actor["vk_id"], "submitted")
    return item


async def review_item(
    item: QuestionBankItem,
    actor: dict,
    bank: QuestionBank,
    *,
    action: str,
    review_note: str = "",
    field_updates: dict | None = None,
) -> QuestionBankItem:
    assert_can_review(actor, bank)
    if item.status != "pending":
        raise HTTPException(status_code=400, detail="Проверять можно только вопросы на проверке")

    if field_updates:
        await apply_item_updates(item, actor["vk_id"], field_updates, record=True)

    now = datetime.now(timezone.utc)
    note = (review_note or "").strip()

    if action == "approve":
        item.status = "confirmed"
        item.reviewed_by_vk_id = actor["vk_id"]
        item.reviewed_at = now
        item.review_note = note
        _sync_legacy_verification(item)
        await item.save()
        await record_event(item.id, actor["vk_id"], "approved", comment=note)
    elif action == "reject":
        item.status = "rejected"
        item.reviewed_by_vk_id = actor["vk_id"]
        item.reviewed_at = now
        item.review_note = note
        _sync_legacy_verification(item)
        await item.save()
        await record_event(item.id, actor["vk_id"], "rejected", comment=note)
    elif action == "needs_revision":
        item.status = "needs_revision"
        item.reviewed_by_vk_id = actor["vk_id"]
        item.reviewed_at = now
        item.review_note = note
        _sync_legacy_verification(item)
        await item.save()
        await record_event(item.id, actor["vk_id"], "needs_revision", comment=note)
    else:
        raise HTTPException(status_code=400, detail="Неизвестное действие проверки")

    return item


async def serialize_item(
    item: QuestionBankItem,
    *,
    names: dict[int, str] | None = None,
) -> dict:
    if names is None:
        ids = {item.created_by_vk_id}
        if item.reviewed_by_vk_id:
            ids.add(item.reviewed_by_vk_id)
        names = await resolve_display_names(ids, item.server_id)

    return {
        "id": item.id,
        "bank_id": item.bank_id,
        "text": item.text,
        "correct_answer": item.correct_answer,
        "source": item.source,
        "answer_comment": item.answer_comment,
        "tags": item.tags or [],
        "difficulty": item.difficulty,
        "difficulty_label": DIFFICULTY_LABELS.get(item.difficulty, str(item.difficulty)),
        "status": item.status,
        "status_label": STATUS_LABELS.get(item.status, item.status),
        "created_by_vk_id": item.created_by_vk_id,
        "author_name": names.get(item.created_by_vk_id, f"id{item.created_by_vk_id}"),
        "reviewed_by_vk_id": item.reviewed_by_vk_id,
        "reviewer_name": names.get(item.reviewed_by_vk_id) if item.reviewed_by_vk_id else None,
        "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
        "review_note": item.review_note or "",
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


async def serialize_bank(
    bank: QuestionBank,
    *,
    question_count: int = 0,
    pending_count: int = 0,
    permissions: dict | None = None,
) -> dict:
    return {
        "id": bank.id,
        "title": bank.title,
        "description": bank.description,
        "emoji": bank.emoji or "",
        "min_submit_level": bank.min_submit_level,
        "min_approve_level": bank.min_approve_level,
        "min_submit_level_label": AccessLevel.title(bank.min_submit_level),
        "min_approve_level_label": AccessLevel.title(bank.min_approve_level),
        "question_count": question_count,
        "pending_count": pending_count,
        "sort_order": bank.sort_order,
        "is_active": bank.is_active,
        "created_by_vk_id": bank.created_by_vk_id,
        "created_at": bank.created_at.isoformat() if bank.created_at else None,
        "updated_at": bank.updated_at.isoformat() if bank.updated_at else None,
        "permissions": permissions or bank_permissions({}, bank),
    }


async def bank_counts(bank_id: int) -> tuple[int, int]:
    confirmed = await QuestionBankItem.filter(bank_id=bank_id, status="confirmed").count()
    pending = await QuestionBankItem.filter(bank_id=bank_id, status="pending").count()
    return confirmed, pending


async def collect_tag_suggestions(server_id: int = DEFAULT_SERVER_ID) -> list[str]:
    tags: set[str] = set()
    for row in await QuestionBankItem.filter(server_id=server_id).values("tags"):
        for tag in row.get("tags") or []:
            t = str(tag).strip()
            if t:
                tags.add(t)
    return sorted(tags, key=str.lower)


def _event_actor_label(actor_name: str, role: str) -> str:
    name = (actor_name or "").strip()
    role = (role or "").strip()
    if not name:
        return role or "Пользователь"
    if role and not (name.startswith("[") or name.startswith("［")):
        return f"{role} · {name}"
    return name


def serialize_event(event: QuestionBankItemEvent, names: dict[int, str], levels: dict[int, int]) -> dict:
    actor_name = names.get(event.actor_vk_id, f"id{event.actor_vk_id}")
    level = levels.get(event.actor_vk_id)
    role = AccessLevel.title(level) if level else ""
    label = EVENT_LABELS.get(event.action, event.action)
    actor_label = _event_actor_label(actor_name, role)
    return {
        "id": event.id,
        "action": event.action,
        "action_label": label,
        "actor_vk_id": event.actor_vk_id,
        "actor_display_name": actor_name,
        "actor_role": role,
        "comment": event.comment or "",
        "changes": event.changes,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "summary": f"{actor_label} {label}".strip(),
    }


async def item_history(item_id: int, server_id: int = DEFAULT_SERVER_ID) -> list[dict]:
    events = await QuestionBankItemEvent.filter(item_id=item_id).order_by("created_at")
    actor_ids = {e.actor_vk_id for e in events}
    names = await resolve_display_names(actor_ids, server_id)

    from app.models.bot import UserServerAccess

    levels: dict[int, int] = {}
    if actor_ids:
        for acc in await UserServerAccess.filter(user_id__in=list(actor_ids), server_id=server_id):
            levels[acc.user_id] = acc.access_level

    return [serialize_event(e, names, levels) for e in events]
