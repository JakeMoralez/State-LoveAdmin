"""Verify one-time login tokens issued by State-LoveBot (/panel)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from fastapi import HTTPException

from app.config import SLED_BOT_SECRET
from app.models.panel import PanelLoginToken


class BotLoginError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def bot_login_enabled() -> bool:
    return bool(SLED_BOT_SECRET)


def _b64url_decode(raw: str) -> bytes:
    pad = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + pad)


def _verify_signature(payload_b64: str, sig_b64: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    try:
        provided = _b64url_decode(sig_b64)
    except Exception:
        return False
    return hmac.compare_digest(expected, provided)


async def verify_and_consume_bot_login_token(token: str) -> int:
    if not SLED_BOT_SECRET:
        raise HTTPException(status_code=503, detail="Вход через бота не настроен")

    parts = token.split(".", 1)
    if len(parts) != 2:
        raise BotLoginError("invalid_token")

    payload_b64, sig_b64 = parts
    if not _verify_signature(payload_b64, sig_b64, SLED_BOT_SECRET):
        raise BotLoginError("invalid_token")

    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception as exc:
        raise BotLoginError("invalid_token") from exc

    vk_id = payload.get("vk_id")
    exp = payload.get("exp")
    jti = payload.get("jti")
    if not isinstance(vk_id, int) or not isinstance(exp, int) or not isinstance(jti, str):
        raise BotLoginError("invalid_token")

    if time.time() > exp:
        raise BotLoginError("expired")

    if await PanelLoginToken.filter(jti=jti).exists():
        raise BotLoginError("used")

    await PanelLoginToken.create(jti=jti, vk_id=vk_id)
    return vk_id
