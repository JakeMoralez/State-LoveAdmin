"""JWT session management (sliding idle + absolute lifetime)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from fastapi import HTTPException, Request, Response

from app.config import (
    DEV_MODE,
    DEV_SKIP_CA,
    DEV_VK_ID,
    SESSION_ABSOLUTE_HOURS,
    SESSION_COOKIE_NAME,
    SESSION_COOKIE_PATH,
    SESSION_IDLE_HOURS,
    SESSION_SECRET,
    SESSION_SLIDE_THRESHOLD,
)
from app.models.bot import AccessLevel
from app.services.access import can_use_portal, get_user_profile


def _cookie_secure() -> bool:
    return not DEV_MODE


def _cookie_kwargs() -> dict[str, Any]:
    return {
        "httponly": True,
        "secure": _cookie_secure(),
        "samesite": "lax",
        "path": SESSION_COOKIE_PATH,
    }


def _as_utc_dt(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=UTC)
    return None


def create_token(
    vk_id: int,
    *,
    dev_level: int | None = None,
    dev_ca: bool | None = None,
    dev_spheres: list[str] | None = None,
    iat: datetime | None = None,
    jti: str | None = None,
) -> str:
    now = datetime.now(UTC)
    issued = iat or now
    exp = now + timedelta(hours=SESSION_IDLE_HOURS)
    payload: dict = {
        "sub": str(vk_id),
        "iat": issued,
        "exp": exp,
        "jti": jti or str(uuid.uuid4()),
    }
    if DEV_MODE and dev_level is not None:
        payload["dev_level"] = int(dev_level)
        payload["dev_ca"] = bool(dev_ca)
        if dev_spheres is not None:
            payload["dev_spheres"] = list(dev_spheres)
    return jwt.encode(payload, SESSION_SECRET, algorithm="HS256")


def decode_session(token: str) -> dict:
    try:
        return jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Сессия истекла") from exc


def decode_token(token: str) -> int:
    return int(decode_session(token)["sub"])


def assert_absolute_ok(payload: dict) -> None:
    """Жёсткий потолок с iat. Legacy-токены без iat пропускаем до следующего slide."""
    iat = _as_utc_dt(payload.get("iat"))
    if iat is None:
        return
    age = datetime.now(UTC) - iat
    if age > timedelta(hours=SESSION_ABSOLUTE_HOURS):
        raise HTTPException(status_code=401, detail="Сессия истекла")


def _write_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_IDLE_HOURS * 3600,
        **_cookie_kwargs(),
    )


async def set_session_cookie(
    response: Response,
    vk_id: int,
    *,
    dev_level: int | None = None,
    dev_ca: bool | None = None,
    dev_spheres: list[str] | None = None,
) -> None:
    token = create_token(vk_id, dev_level=dev_level, dev_ca=dev_ca, dev_spheres=dev_spheres)
    _write_session_cookie(response, token)


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path=SESSION_COOKIE_PATH,
        secure=_cookie_secure(),
        httponly=True,
        samesite="lax",
    )


def touch_session(response: Response, payload: dict) -> bool:
    """
    Продлить cookie, если до exp осталось меньше SESSION_SLIDE_THRESHOLD от idle.
    Сохраняет sub/jti/iat/dev_*. Возвращает True, если cookie обновлена.
    """
    assert_absolute_ok(payload)
    now = datetime.now(UTC)
    exp = _as_utc_dt(payload.get("exp"))
    if exp is None:
        return False
    remaining = exp - now
    threshold = timedelta(hours=SESSION_IDLE_HOURS * SESSION_SLIDE_THRESHOLD)
    if remaining > threshold:
        return False

    iat = _as_utc_dt(payload.get("iat")) or now
    # Absolute: не выдавать exp дальше absolute от iat
    absolute_end = iat + timedelta(hours=SESSION_ABSOLUTE_HOURS)
    idle_end = now + timedelta(hours=SESSION_IDLE_HOURS)
    if idle_end > absolute_end:
        # Уже на грани absolute — можно слегка продлить до absolute_end, если ещё есть запас
        if absolute_end <= now:
            raise HTTPException(status_code=401, detail="Сессия истекла")
        # create_token всегда ставит idle; для капа пересоберём вручную ниже
        pass

    vk_id = int(payload["sub"])
    jti = str(payload.get("jti") or uuid.uuid4())
    dev_level = int(payload["dev_level"]) if "dev_level" in payload and DEV_MODE else None
    dev_ca = bool(payload.get("dev_ca")) if dev_level is not None else None
    raw_spheres = payload.get("dev_spheres") if dev_level is not None else None
    dev_spheres = [str(s) for s in raw_spheres] if isinstance(raw_spheres, list) else None

    token = create_token(
        vk_id,
        iat=iat,
        jti=jti,
        dev_level=dev_level,
        dev_ca=dev_ca,
        dev_spheres=dev_spheres,
    )
    # Если idle_end за absolute — укоротить exp в токене
    if idle_end > absolute_end:
        decoded = jwt.decode(token, SESSION_SECRET, algorithms=["HS256"], options={"verify_exp": False})
        decoded["exp"] = absolute_end
        token = jwt.encode(decoded, SESSION_SECRET, algorithm="HS256")
        max_age = max(1, int((absolute_end - now).total_seconds()))
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            max_age=max_age,
            **_cookie_kwargs(),
        )
    else:
        _write_session_cookie(response, token)
    return True


async def get_session_payload(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется вход")
    payload = decode_session(token)
    assert_absolute_ok(payload)
    return payload


async def get_current_vk_id(request: Request) -> int:
    return int((await get_session_payload(request))["sub"])


def _dev_persona_allowed(payload: dict) -> bool:
    if not DEV_MODE or "dev_level" not in payload:
        return False
    return int(payload["dev_level"]) >= AccessLevel.PGS


async def require_ca_user(request: Request, response: Response) -> dict:
    payload = await get_session_payload(request)
    touch_session(response, payload)
    vk_id = int(payload["sub"])

    if "dev_level" in payload and DEV_MODE:
        if not _dev_persona_allowed(payload):
            raise HTTPException(status_code=403, detail="Dev-персона: нужен уровень ПС+")
        raw_spheres = payload.get("dev_spheres")
        dev_spheres = [str(s) for s in raw_spheres] if isinstance(raw_spheres, list) else None
        return await get_user_profile(
            vk_id,
            dev_level=int(payload["dev_level"]),
            dev_ca=bool(payload.get("dev_ca")),
            dev_spheres=dev_spheres,
        )

    dev_bypass = DEV_MODE and DEV_SKIP_CA and vk_id == DEV_VK_ID
    if not dev_bypass and not await can_use_portal(vk_id):
        raise HTTPException(
            status_code=403,
            detail="Нужен уровень ПС (1) или выше для входа на портал",
        )
    return await get_user_profile(vk_id)
