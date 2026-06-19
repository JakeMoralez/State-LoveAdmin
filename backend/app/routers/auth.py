"""Discord OAuth and session endpoints."""

from __future__ import annotations

import secrets
import urllib.parse

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from app.config import (
    DEV_MODE,
    DEV_SKIP_CA,
    DEV_VK_ID,
    PANEL_BASE_URL,
    VK_APP_ID,
    VK_APP_SECRET,
    VK_GROUP_ID,
    VK_REDIRECT_URI,
)
from app.models.bot import AccessLevel
from app.models.panel import DiscordLink
from app.services.leadership_access import can_manage_leaders
from app.services.access import can_use_ca_scope
from app.services.bot_login import BotLoginError, bot_login_enabled, verify_and_consume_bot_login_token
from app.services.display_names import resolve_vk_photos
from app.services.dev_access import can_view_dev_panel
from app.services.discord_links import link_by_discord_id, upsert_discord_profile
from app.services.discord_oauth import (
    build_authorize_url,
    discord_oauth_configured,
    exchange_code,
)
from app.services.auth import (
    clear_session_cookie,
    require_ca_user,
    set_session_cookie,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_oauth_states: dict[str, bool] = {}


class DevLoginBody(BaseModel):
    access_level: int = Field(ge=0, le=AccessLevel.DEVELOPER, default=AccessLevel.DEVELOPER)
    has_ca_access: bool = True
    vk_id: int | None = None


def _access_level_options() -> list[dict]:
    return [
        {"value": level, "label": AccessLevel.title(level)}
        for level in sorted(AccessLevel.NAMES.keys())
    ]


def _login_redirect(error: str | None = None) -> RedirectResponse:
    url = f"{PANEL_BASE_URL.rstrip('/')}/login"
    if error:
        url = f"{url}?{urllib.parse.urlencode({'error': error})}"
    return RedirectResponse(url)


async def _dev_login_response(
    *,
    access_level: int,
    has_ca_access: bool,
    vk_id: int | None,
    json_response: bool,
):
    if not DEV_MODE:
        raise HTTPException(status_code=404, detail="Тестовый вход отключён")

    uid = vk_id or DEV_VK_ID or None
    if not uid:
        raise HTTPException(
            status_code=400,
            detail="Укажите VK ID в форме или задайте DEV_VK_ID в .env",
        )

    if not DEV_SKIP_CA:
        if access_level < AccessLevel.ZGS_GOS and not has_ca_access:
            raise HTTPException(status_code=403, detail="Нужен доступ ЦА или уровень ЗГС ГОС+")
        if DEV_VK_ID and uid == DEV_VK_ID and not await can_use_ca_scope(uid):
            raise HTTPException(status_code=403, detail="DEV_VK_ID без доступа ЦА")

    if json_response:
        response: Response = JSONResponse({"ok": True, "redirect": "/dashboard"})
    else:
        response = RedirectResponse(f"{PANEL_BASE_URL}/dashboard")

    await set_session_cookie(
        response,
        uid,
        dev_level=access_level,
        dev_ca=has_ca_access,
    )
    return response


@router.get("/discord")
async def discord_login():
    if DEV_MODE and DEV_VK_ID:
        return RedirectResponse("/api/auth/dev-login")
    if not discord_oauth_configured():
        raise HTTPException(status_code=503, detail="Discord OAuth не настроен")
    state = secrets.token_urlsafe(16)
    _oauth_states[state] = True
    return RedirectResponse(build_authorize_url(state))


@router.get("/vk")
async def vk_login():
    raise HTTPException(
        status_code=410,
        detail="Вход через VK OAuth отключён. Используйте Discord или /panel в боте.",
    )


@router.get("/config")
async def auth_config():
    return {
        "dev_mode": DEV_MODE,
        "dev_skip_ca": DEV_SKIP_CA,
        "dev_vk_id": DEV_VK_ID if DEV_MODE else None,
        "discord_configured": discord_oauth_configured(),
        "bot_login_enabled": bot_login_enabled(),
        "vk_group_id": VK_GROUP_ID if VK_GROUP_ID else None,
        "access_levels": _access_level_options() if DEV_MODE else [],
    }


@router.get("/dev-login")
async def dev_login_get(
    json: bool = False,
    access_level: int | None = None,
    has_ca_access: bool | None = None,
    vk_id: int | None = None,
):
    level = access_level if access_level is not None else AccessLevel.DEVELOPER
    ca = has_ca_access if has_ca_access is not None else True
    return await _dev_login_response(
        access_level=level,
        has_ca_access=ca,
        vk_id=vk_id,
        json_response=json,
    )


@router.post("/dev-login")
async def dev_login_post(body: DevLoginBody):
    return await _dev_login_response(
        access_level=body.access_level,
        has_ca_access=body.has_ca_access,
        vk_id=body.vk_id,
        json_response=True,
    )


@router.get("/discord/callback")
async def discord_callback(code: str | None = None, state: str | None = None):
    if not code:
        return _login_redirect("oauth")
    if state not in _oauth_states:
        return _login_redirect("oauth")
    del _oauth_states[state]

    try:
        user_data = await exchange_code(code)
    except ValueError:
        return _login_redirect("oauth")

    discord_id = str(user_data["id"])
    link = await link_by_discord_id(discord_id)
    if not link:
        return _login_redirect("not_linked")

    vk_id = int(link.vk_id)
    await upsert_discord_profile(link, user_data)

    if not await can_use_ca_scope(vk_id):
        return _login_redirect("no_access")

    response = RedirectResponse(f"{PANEL_BASE_URL}/dashboard")
    await set_session_cookie(response, vk_id)
    return response


@router.get("/bot/callback")
async def bot_login_callback(token: str | None = None):
    if not token:
        return _login_redirect("invalid_token")
    try:
        vk_id = await verify_and_consume_bot_login_token(token)
    except BotLoginError as exc:
        return _login_redirect(exc.code)

    if not await can_use_ca_scope(vk_id):
        return _login_redirect("no_access")

    response = RedirectResponse(f"{PANEL_BASE_URL}/dashboard")
    await set_session_cookie(response, vk_id)
    return response


@router.get("/vk/callback")
async def vk_callback(code: str | None = None, state: str | None = None):
    if not code:
        raise HTTPException(status_code=400, detail="Нет кода авторизации")
    if state not in _oauth_states:
        raise HTTPException(status_code=400, detail="Неверный state")
    del _oauth_states[state]

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.get(
            "https://oauth.vk.com/access_token",
            params={
                "client_id": VK_APP_ID,
                "client_secret": VK_APP_SECRET,
                "redirect_uri": VK_REDIRECT_URI,
                "code": code,
            },
        )
        token_data = token_resp.json()
        if "error" in token_data:
            raise HTTPException(status_code=400, detail=token_data.get("error_description", "OAuth error"))

        vk_id = int(token_data["user_id"])
        access_token = token_data["access_token"]

        await client.get(
            "https://api.vk.com/method/users.get",
            params={
                "user_ids": vk_id,
                "fields": "photo_100",
                "access_token": access_token,
                "v": "5.199",
            },
        )

    if not await can_use_ca_scope(vk_id):
        raise HTTPException(
            status_code=403,
            detail="Нужен доступ ЦА: /setca или беседа след. ЦА",
        )

    response = RedirectResponse(f"{PANEL_BASE_URL}/dashboard")
    await set_session_cookie(response, vk_id)
    return response


@router.post("/logout")
async def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


def _can_manage_discord_links(user: dict, level: int) -> bool:
    return level >= 7 or user.get("panel_role") in ("owner", "lead")


@router.get("/me")
async def me(request: Request):
    user = await require_ca_user(request)
    photos = await resolve_vk_photos({user["vk_id"]})
    user["avatar_url"] = photos.get(user["vk_id"]) or "https://vk.com/images/camera_100.png"
    user["can_dev_panel"] = can_view_dev_panel(user["vk_id"], int(user.get("access_level") or 0))

    level = int(user.get("access_level") or 0)
    user["can_manage_discord_links"] = _can_manage_discord_links(user, level)
    user["can_manage_leaders"] = can_manage_leaders(user)

    link = await DiscordLink.get_or_none(vk_id=user["vk_id"])
    user["discord_id"] = link.discord_id if link else None
    user["discord_username"] = link.discord_username if link else None
    user["discord_display_name"] = link.discord_display_name if link else None
    return user
