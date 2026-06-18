"""JWT session management."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import HTTPException, Request, Response

from app.config import (
    DEV_MODE,
    DEV_SKIP_CA,
    DEV_VK_ID,
    SESSION_COOKIE_NAME,
    SESSION_SECRET,
    SESSION_TTL_HOURS,
)
from app.models.bot import AccessLevel
from app.services.access import can_use_ca_scope, get_user_profile


def create_token(
    vk_id: int,
    *,
    dev_level: int | None = None,
    dev_ca: bool | None = None,
) -> str:
    exp = datetime.now(UTC) + timedelta(hours=SESSION_TTL_HOURS)
    payload: dict = {"sub": str(vk_id), "exp": exp, "jti": str(uuid.uuid4())}
    if DEV_MODE and dev_level is not None:
        payload["dev_level"] = int(dev_level)
        payload["dev_ca"] = bool(dev_ca)
    return jwt.encode(payload, SESSION_SECRET, algorithm="HS256")


def decode_session(token: str) -> dict:
    try:
        return jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Сессия истекла") from exc


def decode_token(token: str) -> int:
    return int(decode_session(token)["sub"])


async def set_session_cookie(
    response: Response,
    vk_id: int,
    *,
    dev_level: int | None = None,
    dev_ca: bool | None = None,
) -> None:
    token = create_token(vk_id, dev_level=dev_level, dev_ca=dev_ca)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=not DEV_MODE,
        samesite="lax",
        max_age=SESSION_TTL_HOURS * 3600,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME)


async def get_session_payload(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется вход")
    return decode_session(token)


async def get_current_vk_id(request: Request) -> int:
    return int((await get_session_payload(request))["sub"])


def _dev_persona_allowed(payload: dict) -> bool:
    if not DEV_MODE or "dev_level" not in payload:
        return False
    if DEV_SKIP_CA:
        return True
    level = int(payload["dev_level"])
    return level >= AccessLevel.ZGS_GOS or bool(payload.get("dev_ca"))


async def require_ca_user(request: Request) -> dict:
    payload = await get_session_payload(request)
    vk_id = int(payload["sub"])

    if "dev_level" in payload and DEV_MODE:
        if not _dev_persona_allowed(payload):
            raise HTTPException(status_code=403, detail="Dev-персона без доступа ЦА")
        return await get_user_profile(
            vk_id,
            dev_level=int(payload["dev_level"]),
            dev_ca=bool(payload.get("dev_ca")),
        )

    dev_bypass = DEV_MODE and DEV_SKIP_CA and vk_id == DEV_VK_ID
    if not dev_bypass and not await can_use_ca_scope(vk_id):
        raise HTTPException(
            status_code=403,
            detail="Нужен доступ ЦА: /setca или беседа след. ЦА",
        )
    return await get_user_profile(vk_id)
