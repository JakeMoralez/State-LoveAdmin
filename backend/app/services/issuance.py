"""AZ / virts issuance: пакеты + строки (merge по nick+kind)."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import HTTPException

from app.models.bot import AccessLevel
from app.models.panel import IssuanceLine, IssuanceRequest
from app.services import messages
from app.services.audit import log_audit
from app.services.display_names import resolve_display_names
from app.services.sled_client import notify_issuance_created

logger = logging.getLogger(__name__)

CREATE_MIN_LEVEL = AccessLevel.ZGS
REVIEW_MIN_LEVEL = AccessLevel.STRUCTURE_SUPERVISOR

KIND_AZ = "az"
KIND_VIRTS = "virts"
KINDS = frozenset({KIND_AZ, KIND_VIRTS})

STATUS_PENDING = "pending"
STATUS_ISSUED = "issued"
STATUS_REJECTED = "rejected"

_STATUS_ORDER = {STATUS_PENDING: 0, STATUS_ISSUED: 1, STATUS_REJECTED: 2}


def _level(user: dict) -> int:
    return int(user.get("access_level") or 0)


def can_view(user: dict) -> bool:
    return _level(user) >= CREATE_MIN_LEVEL or user.get("panel_role") == "owner"


def can_create(user: dict) -> bool:
    return can_view(user)


def can_review(user: dict) -> bool:
    return _level(user) >= REVIEW_MIN_LEVEL or user.get("panel_role") == "owner"


def require_view(user: dict) -> None:
    if not can_view(user):
        raise HTTPException(status_code=403, detail=messages.ISSUANCE_VIEW_FORBIDDEN)


def require_create(user: dict) -> None:
    if not can_create(user):
        raise HTTPException(status_code=403, detail=messages.ISSUANCE_CREATE_FORBIDDEN)


def require_review(user: dict) -> None:
    if not can_review(user):
        raise HTTPException(status_code=403, detail=messages.ISSUANCE_REVIEW_FORBIDDEN)


def parse_kind(raw: str | None) -> str:
    kind = (raw or "").strip().lower()
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_KIND)
    return kind


def parse_amount(raw) -> int:
    if isinstance(raw, bool):
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_AMOUNT)
    if isinstance(raw, int):
        value = raw
    else:
        digits = re.sub(r"[^\d]", "", str(raw or ""))
        if not digits:
            raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_AMOUNT)
        value = int(digits)
    if value <= 0:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_AMOUNT)
    return value


def format_amount(amount: int, kind: str) -> str:
    grouped = f"{int(amount):,}".replace(",", " ")
    if kind == KIND_AZ:
        return f"{grouped} AZ"
    return f"{grouped}$"


def normalize_nickname(raw: str) -> str:
    return (raw or "").strip().casefold()


def _clean_url(raw: str | None) -> str:
    url = (raw or "").strip()
    if not url:
        return ""
    if not re.match(r"^https?://", url, re.I):
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_PROOF_BAD)
    return url[:1024]


def _clean_text(raw: str | None, *, required: str, max_len: int) -> str:
    text = (raw or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail=required)
    return text[:max_len]


def _can_edit_bag(user: dict, bag: IssuanceRequest) -> bool:
    if bag.status != STATUS_PENDING:
        return False
    if can_review(user):
        return True
    return int(bag.created_by_vk_id) == int(user["vk_id"])


def _can_edit_line(user: dict, bag: IssuanceRequest, line: IssuanceLine) -> bool:
    if bag.status != STATUS_PENDING:
        return False
    if can_review(user):
        return True
    return int(line.created_by_vk_id) == int(user["vk_id"]) or int(bag.created_by_vk_id) == int(
        user["vk_id"]
    )


def _bag_permissions(user: dict, bag: IssuanceRequest) -> dict:
    pending = bag.status == STATUS_PENDING
    issued = bag.status == STATUS_ISSUED
    rejected = bag.status == STATUS_REJECTED
    edit = _can_edit_bag(user, bag)
    review = can_review(user)
    return {
        "can_edit": edit,
        "can_delete": edit,
        "can_issue": review and pending,
        "can_unissue": review and issued,
        "can_reject": review and pending,
        "can_unreject": review and rejected,
    }


def _line_permissions(user: dict, bag: IssuanceRequest, line: IssuanceLine) -> dict:
    edit = _can_edit_line(user, bag, line)
    return {"can_edit": edit, "can_delete": edit}


def _nick(names: dict[int, str], vk_id: int | None) -> str | None:
    if vk_id is None:
        return None
    return names.get(int(vk_id)) or f"id{vk_id}"


async def _names_for_bags(bags: list[IssuanceRequest], lines: list[IssuanceLine]) -> dict[int, str]:
    ids: set[int] = set()
    for bag in bags:
        ids.add(int(bag.created_by_vk_id))
        if bag.reviewed_by_vk_id:
            ids.add(int(bag.reviewed_by_vk_id))
    for line in lines:
        ids.add(int(line.created_by_vk_id))
    return await resolve_display_names(ids)


def _serialize_line(
    line: IssuanceLine,
    bag: IssuanceRequest,
    user: dict,
    names: dict[int, str],
) -> dict:
    created_id = int(line.created_by_vk_id)
    return {
        "id": line.id,
        "request_id": int(bag.id),
        "role_title": line.role_title,
        "amount": int(line.amount),
        "amount_label": format_amount(int(line.amount), bag.kind),
        "reason": line.reason,
        "proof_url": line.proof_url,
        "created_by_vk_id": created_id,
        "created_by_name": _nick(names, created_id),
        "created_at": line.created_at.isoformat() if line.created_at else None,
        "permissions": _line_permissions(user, bag, line),
    }


def serialize(
    bag: IssuanceRequest,
    user: dict,
    *,
    lines: list[IssuanceLine] | None = None,
    names: dict[int, str] | None = None,
    appended: bool = False,
) -> dict:
    names = names or {}
    lines = lines or []
    created_id = int(bag.created_by_vk_id)
    issued_id = int(bag.reviewed_by_vk_id) if bag.reviewed_by_vk_id and bag.status == STATUS_ISSUED else None
    total = int(bag.amount)
    return {
        "id": bag.id,
        "server_id": bag.server_id,
        "kind": bag.kind,
        "role_title": bag.role_title,
        "nickname": bag.nickname,
        "amount": total,
        "amount_label": format_amount(total, bag.kind),
        "reason": bag.reason,
        "proof_url": bag.proof_url,
        "status": bag.status,
        "created_by_vk_id": created_id,
        "created_by_name": _nick(names, created_id),
        "reviewed_by_vk_id": int(bag.reviewed_by_vk_id) if bag.reviewed_by_vk_id else None,
        "issued_by_vk_id": issued_id,
        "issued_by_name": _nick(names, issued_id),
        "reviewed_at": bag.reviewed_at.isoformat() if bag.reviewed_at else None,
        "created_at": bag.created_at.isoformat() if bag.created_at else None,
        "permissions": _bag_permissions(user, bag),
        "lines": [_serialize_line(ln, bag, user, names) for ln in sorted(lines, key=lambda x: x.id or 0)],
        "line_count": len(lines),
        "appended": appended,
    }


async def _lines_for(bag_id: int) -> list[IssuanceLine]:
    return await IssuanceLine.filter(request_id=bag_id).order_by("id")


async def _serialize(bag: IssuanceRequest, user: dict, *, appended: bool = False) -> dict:
    lines = await _lines_for(int(bag.id))
    names = await _names_for_bags([bag], lines)
    return serialize(bag, user, lines=lines, names=names, appended=appended)


def _audit_detail(bag: IssuanceRequest) -> dict:
    return {
        "kind": bag.kind,
        "target_nickname": bag.nickname,
        "nickname": bag.nickname,
        "amount": int(bag.amount),
        "amount_label": format_amount(int(bag.amount), bag.kind),
        "role_title": bag.role_title,
    }


async def _recalc_bag(bag: IssuanceRequest) -> None:
    lines = await _lines_for(int(bag.id))
    bag.amount = sum(int(ln.amount) for ln in lines)
    if lines:
        first = lines[0]
        bag.role_title = first.role_title
        bag.reason = first.reason if len(lines) == 1 else f"{len(lines)} позиций"
        bag.proof_url = first.proof_url if len(lines) == 1 else ""
    else:
        bag.amount = 0
    await bag.save()


async def list_requests(server_id: int, kind: str, user: dict) -> dict:
    require_view(user)
    bags = await IssuanceRequest.filter(server_id=server_id, kind=kind)
    bags.sort(key=lambda r: (_STATUS_ORDER.get(r.status, 9), -(r.id or 0)))
    issued = [r for r in bags if r.status == STATUS_ISSUED]
    total = sum(int(r.amount) for r in issued)
    all_lines: list[IssuanceLine] = []
    lines_by_bag: dict[int, list[IssuanceLine]] = {}
    if bags:
        all_lines = await IssuanceLine.filter(request_id__in=[b.id for b in bags]).order_by("id")
        for ln in all_lines:
            lines_by_bag.setdefault(int(ln.request_id), []).append(ln)
    names = await _names_for_bags(bags, all_lines)
    return {
        "kind": kind,
        "items": [
            serialize(b, user, lines=lines_by_bag.get(int(b.id), []), names=names) for b in bags
        ],
        "total_issued": total,
        "total_issued_label": format_amount(total, kind) if issued else format_amount(0, kind),
        "permissions": {
            "can_create": can_create(user),
            "can_review": can_review(user),
        },
    }


async def _find_pending_bag(server_id: int, kind: str, nick_norm: str) -> IssuanceRequest | None:
    candidates = await IssuanceRequest.filter(
        server_id=server_id, kind=kind, status=STATUS_PENDING
    )
    for bag in candidates:
        norm = (bag.nickname_norm or "").strip() or normalize_nickname(bag.nickname)
        if norm == nick_norm:
            return bag
    return None


async def create_request(
    *,
    server_id: int,
    user: dict,
    kind: str,
    role_title: str,
    nickname: str,
    amount,
    reason: str,
    proof_url: str,
) -> dict:
    require_create(user)
    kind = parse_kind(kind)
    nick = _clean_text(nickname, required=messages.ISSUANCE_NICK_REQUIRED, max_len=128)
    nick_norm = normalize_nickname(nick)
    role = _clean_text(role_title, required=messages.ISSUANCE_ROLE_REQUIRED, max_len=128)
    amt = parse_amount(amount)
    why = _clean_text(reason, required=messages.ISSUANCE_REASON_REQUIRED, max_len=2000)
    proof = _clean_url(proof_url)
    actor = int(user["vk_id"])

    existing = await _find_pending_bag(server_id, kind, nick_norm)
    appended = False
    if existing:
        bag = existing
        await IssuanceLine.create(
            request_id=bag.id,
            role_title=role,
            amount=amt,
            reason=why,
            proof_url=proof,
            created_by_vk_id=actor,
        )
        await _recalc_bag(bag)
        await bag.refresh_from_db()
        appended = True
        await log_audit(
            actor,
            "issuance_created",
            "issuance_request",
            bag.id,
            {**_audit_detail(bag), "appended": True},
        )
        serialized = await _serialize(bag, user, appended=True)
        await _notify_managers(bag, user, appended=True)
        return serialized

    bag = await IssuanceRequest.create(
        server_id=server_id,
        kind=kind,
        role_title=role,
        nickname=nick,
        nickname_norm=nick_norm,
        amount=amt,
        reason=why,
        proof_url=proof,
        status=STATUS_PENDING,
        created_by_vk_id=actor,
    )
    await IssuanceLine.create(
        request_id=bag.id,
        role_title=role,
        amount=amt,
        reason=why,
        proof_url=proof,
        created_by_vk_id=actor,
    )
    await log_audit(actor, "issuance_created", "issuance_request", bag.id, _audit_detail(bag))
    serialized = await _serialize(bag, user, appended=False)
    await _notify_managers(bag, user, appended=False)
    return serialized


async def _notify_managers(bag: IssuanceRequest, user: dict, *, appended: bool) -> None:
    try:
        names = await resolve_display_names([int(user["vk_id"])])
        created_by_name = names.get(int(user["vk_id"])) or f"id{user['vk_id']}"
        payload = {
            "server_id": int(bag.server_id),
            "request_id": int(bag.id),
            "kind": bag.kind,
            "nickname": bag.nickname,
            "amount": int(bag.amount),
            "amount_label": format_amount(int(bag.amount), bag.kind),
            "role_title": bag.role_title,
            "reason": bag.reason,
            "proof_url": bag.proof_url or "",
            "created_by_vk_id": int(user["vk_id"]),
            "created_by_name": created_by_name,
            "appended": appended,
        }
        data, err = await notify_issuance_created(payload)
        if err:
            logger.warning("issuance managers notify failed id=%s: %s", bag.id, err)
        elif data is not None and not data.get("ok", True):
            logger.warning("issuance managers notify rejected id=%s: %s", bag.id, data)
    except Exception as exc:
        logger.warning("issuance managers notify error id=%s: %s", bag.id, exc)


async def _get_bag(request_id: int) -> IssuanceRequest:
    row = await IssuanceRequest.get_or_none(id=request_id)
    if not row:
        raise HTTPException(status_code=404, detail=messages.ISSUANCE_NOT_FOUND)
    return row


async def _get_line(line_id: int) -> tuple[IssuanceLine, IssuanceRequest]:
    line = await IssuanceLine.get_or_none(id=line_id)
    if not line:
        raise HTTPException(status_code=404, detail=messages.ISSUANCE_LINE_NOT_FOUND)
    bag = await _get_bag(int(line.request_id))
    return line, bag


async def update_request(
    request_id: int,
    user: dict,
    *,
    nickname: str | None = None,
) -> dict:
    """Правка пакета: только ник (строки — через update_line)."""
    require_view(user)
    bag = await _get_bag(request_id)
    if not _can_edit_bag(user, bag):
        raise HTTPException(
            status_code=403,
            detail=messages.ISSUANCE_EDIT_FORBIDDEN
            if bag.status == STATUS_PENDING
            else messages.ISSUANCE_BAD_STATUS,
        )
    if nickname is not None:
        nick = _clean_text(nickname, required=messages.ISSUANCE_NICK_REQUIRED, max_len=128)
        bag.nickname = nick
        bag.nickname_norm = normalize_nickname(nick)
    await bag.save()
    return await _serialize(bag, user)


async def update_line(
    line_id: int,
    user: dict,
    *,
    role_title: str | None = None,
    amount=None,
    reason: str | None = None,
    proof_url: str | None = None,
) -> dict:
    require_view(user)
    line, bag = await _get_line(line_id)
    if not _can_edit_line(user, bag, line):
        raise HTTPException(
            status_code=403,
            detail=messages.ISSUANCE_EDIT_FORBIDDEN
            if bag.status == STATUS_PENDING
            else messages.ISSUANCE_BAD_STATUS,
        )
    if role_title is not None:
        line.role_title = _clean_text(role_title, required=messages.ISSUANCE_ROLE_REQUIRED, max_len=128)
    if amount is not None:
        line.amount = parse_amount(amount)
    if reason is not None:
        line.reason = _clean_text(reason, required=messages.ISSUANCE_REASON_REQUIRED, max_len=2000)
    if proof_url is not None:
        line.proof_url = _clean_url(proof_url)
    await line.save()
    await _recalc_bag(bag)
    await bag.refresh_from_db()
    return await _serialize(bag, user)


async def delete_line(line_id: int, user: dict) -> dict | None:
    """Удаляет строку; если строк не осталось — удаляет пакет. None = пакет удалён."""
    require_view(user)
    line, bag = await _get_line(line_id)
    if not _can_edit_line(user, bag, line):
        raise HTTPException(
            status_code=403,
            detail=messages.ISSUANCE_DELETE_FORBIDDEN
            if bag.status == STATUS_PENDING
            else messages.ISSUANCE_BAD_STATUS,
        )
    await line.delete()
    remaining = await _lines_for(int(bag.id))
    if not remaining:
        detail = _audit_detail(bag)
        await log_audit(user["vk_id"], "issuance_deleted", "issuance_request", bag.id, detail)
        await bag.delete()
        return None
    await _recalc_bag(bag)
    await bag.refresh_from_db()
    return await _serialize(bag, user)


async def issue_request(request_id: int, user: dict) -> dict:
    require_review(user)
    bag = await _get_bag(request_id)
    if bag.status != STATUS_PENDING:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_STATUS)
    bag.status = STATUS_ISSUED
    bag.reviewed_by_vk_id = int(user["vk_id"])
    bag.reviewed_at = datetime.now(timezone.utc)
    await bag.save()
    await log_audit(user["vk_id"], "issuance_issued", "issuance_request", bag.id, _audit_detail(bag))
    return await _serialize(bag, user)


async def unissue_request(request_id: int, user: dict) -> dict:
    require_review(user)
    bag = await _get_bag(request_id)
    if bag.status != STATUS_ISSUED:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_STATUS)
    # Если уже есть другой pending на тот же ник — нельзя вернуть в pending
    nick_norm = (bag.nickname_norm or "").strip() or normalize_nickname(bag.nickname)
    conflict = await _find_pending_bag(int(bag.server_id), bag.kind, nick_norm)
    if conflict and int(conflict.id) != int(bag.id):
        raise HTTPException(
            status_code=400,
            detail="Уже есть открытая заявка на этот ник — снимите выдачу нельзя",
        )
    bag.status = STATUS_PENDING
    bag.reviewed_by_vk_id = None
    bag.reviewed_at = None
    await bag.save()
    await log_audit(user["vk_id"], "issuance_unissued", "issuance_request", bag.id, _audit_detail(bag))
    return await _serialize(bag, user)


async def reject_request(request_id: int, user: dict) -> dict:
    require_review(user)
    bag = await _get_bag(request_id)
    if bag.status != STATUS_PENDING:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_STATUS)
    bag.status = STATUS_REJECTED
    bag.reviewed_by_vk_id = int(user["vk_id"])
    bag.reviewed_at = datetime.now(timezone.utc)
    await bag.save()
    await log_audit(user["vk_id"], "issuance_rejected", "issuance_request", bag.id, _audit_detail(bag))
    return await _serialize(bag, user)


async def unreject_request(request_id: int, user: dict) -> dict:
    require_review(user)
    bag = await _get_bag(request_id)
    if bag.status != STATUS_REJECTED:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_STATUS)
    nick_norm = (bag.nickname_norm or "").strip() or normalize_nickname(bag.nickname)
    conflict = await _find_pending_bag(int(bag.server_id), bag.kind, nick_norm)
    if conflict and int(conflict.id) != int(bag.id):
        raise HTTPException(
            status_code=400,
            detail="Уже есть открытая заявка на этот ник — снять отклонение нельзя",
        )
    bag.status = STATUS_PENDING
    bag.reviewed_by_vk_id = None
    bag.reviewed_at = None
    await bag.save()
    await log_audit(user["vk_id"], "issuance_unrejected", "issuance_request", bag.id, _audit_detail(bag))
    return await _serialize(bag, user)


async def delete_request(request_id: int, user: dict) -> None:
    require_view(user)
    bag = await _get_bag(request_id)
    if not _can_edit_bag(user, bag):
        raise HTTPException(
            status_code=403,
            detail=messages.ISSUANCE_DELETE_FORBIDDEN
            if bag.status == STATUS_PENDING
            else messages.ISSUANCE_BAD_STATUS,
        )
    detail = _audit_detail(bag)
    await IssuanceLine.filter(request_id=bag.id).delete()
    await log_audit(user["vk_id"], "issuance_deleted", "issuance_request", bag.id, detail)
    await bag.delete()


async def migrate_issuance_lines() -> None:
    """Каждый старый пакет без строк → одна line; заполнить nickname_norm."""
    bags = await IssuanceRequest.all()
    for bag in bags:
        norm = (getattr(bag, "nickname_norm", None) or "").strip()
        if not norm:
            bag.nickname_norm = normalize_nickname(bag.nickname)
            await bag.save()
        count = await IssuanceLine.filter(request_id=bag.id).count()
        if count:
            continue
        await IssuanceLine.create(
            request_id=bag.id,
            role_title=bag.role_title or "—",
            amount=int(bag.amount or 0) or 1,
            reason=bag.reason or "—",
            proof_url=bag.proof_url or "",
            created_by_vk_id=int(bag.created_by_vk_id),
            created_at=bag.created_at,
        )
