"""User profile."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.services.auth import require_ca_user

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
async def get_profile(user: dict = Depends(require_ca_user)):
    return user
