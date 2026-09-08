"""AZ / virts issuance HTTP API."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.config import DEFAULT_SERVER_ID
from app.services.auth import require_ca_user
from app.services import issuance as svc

router = APIRouter(prefix="/api/issuance", tags=["issuance"])


class IssuanceCreate(BaseModel):
    kind: str
    role_title: str = Field(min_length=1, max_length=128)
    nickname: str = Field(min_length=1, max_length=128)
    amount: int | str
    reason: str = Field(min_length=1, max_length=2000)
    proof_url: str = Field(default="", max_length=1024)


class IssuanceUpdate(BaseModel):
    role_title: str | None = Field(default=None, max_length=128)
    nickname: str | None = Field(default=None, max_length=128)
    amount: int | str | None = None
    reason: str | None = Field(default=None, max_length=2000)
    proof_url: str | None = Field(default=None, max_length=1024)


@router.get("")
async def list_issuance(
    kind: str,
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    return await svc.list_requests(server_id, svc.parse_kind(kind), user)


@router.post("")
async def create_issuance(
    body: IssuanceCreate,
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    return await svc.create_request(
        server_id=server_id,
        user=user,
        kind=body.kind,
        role_title=body.role_title,
        nickname=body.nickname,
        amount=body.amount,
        reason=body.reason,
        proof_url=body.proof_url,
    )


@router.patch("/{request_id}")
async def update_issuance(
    request_id: int,
    body: IssuanceUpdate,
    user: dict = Depends(require_ca_user),
):
    return await svc.update_request(
        request_id,
        user,
        role_title=body.role_title,
        nickname=body.nickname,
        amount=body.amount,
        reason=body.reason,
        proof_url=body.proof_url,
    )


@router.post("/{request_id}/issue")
async def issue_issuance(request_id: int, user: dict = Depends(require_ca_user)):
    return await svc.issue_request(request_id, user)


@router.post("/{request_id}/unissue")
async def unissue_issuance(request_id: int, user: dict = Depends(require_ca_user)):
    return await svc.unissue_request(request_id, user)


@router.post("/{request_id}/reject")
async def reject_issuance(request_id: int, user: dict = Depends(require_ca_user)):
    return await svc.reject_request(request_id, user)


@router.post("/{request_id}/unreject")
async def unreject_issuance(request_id: int, user: dict = Depends(require_ca_user)):
    return await svc.unreject_request(request_id, user)


@router.delete("/{request_id}")
async def delete_issuance(request_id: int, user: dict = Depends(require_ca_user)):
    await svc.delete_request(request_id, user)
    return {"ok": True}
