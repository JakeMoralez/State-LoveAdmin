"""Discord OAuth2 helpers."""

from __future__ import annotations

import urllib.parse

import httpx

from app.config import DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI

DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize"
DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"
DISCORD_USER_URL = "https://discord.com/api/users/@me"


def discord_oauth_configured() -> bool:
    return bool(DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET)


def build_authorize_url(state: str) -> str:
    params = urllib.parse.urlencode(
        {
            "client_id": DISCORD_CLIENT_ID,
            "redirect_uri": DISCORD_REDIRECT_URI,
            "response_type": "code",
            "scope": "identify",
            "state": state,
        }
    )
    return f"{DISCORD_AUTHORIZE_URL}?{params}"


async def exchange_code(code: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(
            DISCORD_TOKEN_URL,
            data={
                "client_id": DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": DISCORD_REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token_data = token_resp.json()
        if token_resp.status_code >= 400 or "access_token" not in token_data:
            raise ValueError(token_data.get("error_description") or "Discord token error")

        user_resp = await client.get(
            DISCORD_USER_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        user_data = user_resp.json()
        if user_resp.status_code >= 400 or "id" not in user_data:
            raise ValueError("Discord user error")
        return user_data


def normalize_discord_id(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = raw.strip()
    if not value:
        return None
    if not value.isdigit() or not (17 <= len(value) <= 20):
        raise ValueError("Некорректный Discord ID")
    return value
