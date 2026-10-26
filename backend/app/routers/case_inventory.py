"""Staff-owned cases and manual prize issuance, separate from developer previews."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.services.auth import require_ca_user
from app.services import case_grants as svc
from app.models.panel import LootCase
from app.services.cases import serialize_case

router = APIRouter(prefix="/api/cases", tags=["cases"])
rewards_router = APIRouter(prefix="/api/issuance/cases", tags=["case-rewards"])


class GrantBody(BaseModel):
    case_id: int
    recipient_vk_id: int
    request_key: UUID


@router.get("")
async def inventory(all_grants: bool = False, status: str | None = Query(None, pattern="^(available|history)$"), limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0), user=Depends(require_ca_user)):
    return await svc.list_grants(user, all_grants, limit, offset, status)


@router.get("/templates")
async def templates(user=Depends(require_ca_user)):
    svc.require_manager(user)
    cases = [await serialize_case(c) for c in await LootCase.filter(is_active=True).order_by("title")]
    return {"cases": [c for c in cases if c["can_spin"]]}


@router.post("/grants")
async def grant(body: GrantBody, user=Depends(require_ca_user)):
    return await svc.grant_case(user, body.case_id, body.recipient_vk_id, str(body.request_key))


@router.get("/grants/{grant_id}")
async def detail(grant_id: int, user=Depends(require_ca_user)):
    return await svc.serialize_grant(await svc.get_grant(grant_id, user, own=True), user)


@router.post("/grants/{grant_id}/open")
async def open_case(grant_id: int, user=Depends(require_ca_user)):
    return await svc.open_grant(grant_id, user)


@router.post("/grants/{grant_id}/revoke")
async def revoke(grant_id: int, user=Depends(require_ca_user)):
    return await svc.revoke_grant(grant_id, user)


@rewards_router.get("")
async def rewards(limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0), user=Depends(require_ca_user)):
    return await svc.list_rewards(user, limit, offset)


@rewards_router.post("/{reward_id}/{action}")
async def review(reward_id: int, action: str, user=Depends(require_ca_user)):
    if action not in {"issue", "reject", "unissue", "unreject"}:
        raise HTTPException(404, "Действие не найдено")
    return await svc.review_reward(reward_id, user, action)
