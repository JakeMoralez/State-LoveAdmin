"""AZ / virts issuance requests."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import HTTPException

from app.models.bot import AccessLevel
from app.models.panel import IssuanceRequest
from app.services import messages
from app.services.audit import log_audit
from app.services.display_names import resolve_display_names

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


def _can_edit_row(user: dict, row: IssuanceRequest) -> bool:
    if row.status != STATUS_PENDING:
        return False
    if can_review(user):
        return True
    return int(row.created_by_vk_id) == int(user["vk_id"])


def _permissions(user: dict, row: IssuanceRequest) -> dict:
    pending = row.status == STATUS_PENDING
    issued = row.status == STATUS_ISSUED
    rejected = row.status == STATUS_REJECTED
    edit = _can_edit_row(user, row)
    review = can_review(user)
    return {
        "can_edit": edit,
        "can_delete": edit,
        "can_issue": review and pending,
        "can_unissue": review and issued,
        "can_reject": review and pending,
        "can_unreject": review and rejected,
    }


def _nick(names: dict[int, str], vk_id: int | None) -> str | None:
    if vk_id is None:
        return None
    return names.get(int(vk_id)) or f"id{vk_id}"


async def _names_for(rows: list[IssuanceRequest]) -> dict[int, str]:
    ids: set[int] = set()
    for row in rows:
        ids.add(int(row.created_by_vk_id))
        if row.reviewed_by_vk_id:
            ids.add(int(row.reviewed_by_vk_id))
    return await resolve_display_names(ids)


def serialize(row: IssuanceRequest, user: dict, names: dict[int, str] | None = None) -> dict:
    names = names or {}
    created_id = int(row.created_by_vk_id)
    issued_id = int(row.reviewed_by_vk_id) if row.reviewed_by_vk_id and row.status == STATUS_ISSUED else None
    return {
        "id": row.id,
        "server_id": row.server_id,
        "kind": row.kind,
        "role_title": row.role_title,
        "nickname": row.nickname,
        "amount": int(row.amount),
        "amount_label": format_amount(int(row.amount), row.kind),
        "reason": row.reason,
        "proof_url": row.proof_url,
        "status": row.status,
        "created_by_vk_id": created_id,
        "created_by_name": _nick(names, created_id),
        "reviewed_by_vk_id": int(row.reviewed_by_vk_id) if row.reviewed_by_vk_id else None,
        "issued_by_vk_id": issued_id,
        "issued_by_name": _nick(names, issued_id),
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "permissions": _permissions(user, row),
    }


async def _serialize(row: IssuanceRequest, user: dict) -> dict:
    return serialize(row, user, await _names_for([row]))


def _audit_detail(row: IssuanceRequest) -> dict:
    return {
        "kind": row.kind,
        "target_nickname": row.nickname,
        "nickname": row.nickname,
        "amount": int(row.amount),
        "amount_label": format_amount(int(row.amount), row.kind),
        "role_title": row.role_title,
    }


async def list_requests(server_id: int, kind: str, user: dict) -> dict:
    require_view(user)
    rows = await IssuanceRequest.filter(server_id=server_id, kind=kind)
    rows.sort(key=lambda r: (_STATUS_ORDER.get(r.status, 9), -(r.id or 0)))
    issued = [r for r in rows if r.status == STATUS_ISSUED]
    total = sum(int(r.amount) for r in issued)
    names = await _names_for(rows)
    return {
        "kind": kind,
        "items": [serialize(r, user, names) for r in rows],
        "total_issued": total,
        "total_issued_label": format_amount(total, kind) if issued else format_amount(0, kind),
        "permissions": {
            "can_create": can_create(user),
            "can_review": can_review(user),
        },
    }


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
    row = await IssuanceRequest.create(
        server_id=server_id,
        kind=kind,
        role_title=_clean_text(role_title, required=messages.ISSUANCE_ROLE_REQUIRED, max_len=128),
        nickname=_clean_text(nickname, required=messages.ISSUANCE_NICK_REQUIRED, max_len=128),
        amount=parse_amount(amount),
        reason=_clean_text(reason, required=messages.ISSUANCE_REASON_REQUIRED, max_len=2000),
        proof_url=_clean_url(proof_url),
        status=STATUS_PENDING,
        created_by_vk_id=int(user["vk_id"]),
    )
    await log_audit(user["vk_id"], "issuance_created", "issuance_request", row.id, _audit_detail(row))
    return await _serialize(row, user)


async def _get(request_id: int) -> IssuanceRequest:
    row = await IssuanceRequest.get_or_none(id=request_id)
    if not row:
        raise HTTPException(status_code=404, detail=messages.ISSUANCE_NOT_FOUND)
    return row


async def update_request(
    request_id: int,
    user: dict,
    *,
    role_title: str | None = None,
    nickname: str | None = None,
    amount=None,
    reason: str | None = None,
    proof_url: str | None = None,
) -> dict:
    require_view(user)
    row = await _get(request_id)
    if not _can_edit_row(user, row):
        raise HTTPException(
            status_code=403,
            detail=messages.ISSUANCE_EDIT_FORBIDDEN
            if row.status == STATUS_PENDING
            else messages.ISSUANCE_BAD_STATUS,
        )
    if role_title is not None:
        row.role_title = _clean_text(role_title, required=messages.ISSUANCE_ROLE_REQUIRED, max_len=128)
    if nickname is not None:
        row.nickname = _clean_text(nickname, required=messages.ISSUANCE_NICK_REQUIRED, max_len=128)
    if amount is not None:
        row.amount = parse_amount(amount)
    if reason is not None:
        row.reason = _clean_text(reason, required=messages.ISSUANCE_REASON_REQUIRED, max_len=2000)
    if proof_url is not None:
        row.proof_url = _clean_url(proof_url)
    await row.save()
    return await _serialize(row, user)


async def issue_request(request_id: int, user: dict) -> dict:
    require_review(user)
    row = await _get(request_id)
    if row.status != STATUS_PENDING:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_STATUS)
    row.status = STATUS_ISSUED
    row.reviewed_by_vk_id = int(user["vk_id"])
    row.reviewed_at = datetime.now(timezone.utc)
    await row.save()
    await log_audit(user["vk_id"], "issuance_issued", "issuance_request", row.id, _audit_detail(row))
    return await _serialize(row, user)


async def unissue_request(request_id: int, user: dict) -> dict:
    require_review(user)
    row = await _get(request_id)
    if row.status != STATUS_ISSUED:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_STATUS)
    row.status = STATUS_PENDING
    row.reviewed_by_vk_id = None
    row.reviewed_at = None
    await row.save()
    await log_audit(user["vk_id"], "issuance_unissued", "issuance_request", row.id, _audit_detail(row))
    return await _serialize(row, user)


async def reject_request(request_id: int, user: dict) -> dict:
    require_review(user)
    row = await _get(request_id)
    if row.status != STATUS_PENDING:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_STATUS)
    row.status = STATUS_REJECTED
    row.reviewed_by_vk_id = int(user["vk_id"])
    row.reviewed_at = datetime.now(timezone.utc)
    await row.save()
    await log_audit(user["vk_id"], "issuance_rejected", "issuance_request", row.id, _audit_detail(row))
    return await _serialize(row, user)


async def unreject_request(request_id: int, user: dict) -> dict:
    require_review(user)
    row = await _get(request_id)
    if row.status != STATUS_REJECTED:
        raise HTTPException(status_code=400, detail=messages.ISSUANCE_BAD_STATUS)
    row.status = STATUS_PENDING
    row.reviewed_by_vk_id = None
    row.reviewed_at = None
    await row.save()
    await log_audit(user["vk_id"], "issuance_unrejected", "issuance_request", row.id, _audit_detail(row))
    return await _serialize(row, user)


async def delete_request(request_id: int, user: dict) -> None:
    require_view(user)
    row = await _get(request_id)
    if not _can_edit_row(user, row):
        raise HTTPException(
            status_code=403,
            detail=messages.ISSUANCE_DELETE_FORBIDDEN
            if row.status == STATUS_PENDING
            else messages.ISSUANCE_BAD_STATUS,
        )
    detail = _audit_detail(row)
    await log_audit(user["vk_id"], "issuance_deleted", "issuance_request", row.id, detail)
    await row.delete()
