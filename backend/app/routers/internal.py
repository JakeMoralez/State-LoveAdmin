"""Internal API for State-LoveBot (localhost + shared secret)."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import SLED_BOT_SECRET
from app.services.access import can_use_ca_scope
from app.services.discord_links import links_for_vk_ids, set_discord_link
from app.services.discord_oauth import normalize_discord_id

router = APIRouter(prefix="/internal", tags=["internal"])


def _check_secret(header: str | None) -> None:
    if not SLED_BOT_SECRET or header != SLED_BOT_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


class DiscordLinkBody(BaseModel):
    vk_id: int
    discord_id: str | None = None


@router.get("/discord-link")
async def get_discord_link(
    vk_id: int,
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)
    links = await links_for_vk_ids({vk_id})
    link = links.get(vk_id)
    return {
        "vk_id": vk_id,
        "discord_id": link.discord_id if link else None,
    }


@router.put("/discord-link")
async def update_discord_link(
    body: DiscordLinkBody,
    x_sled_secret: str | None = Header(default=None, alias="X-Sled-Secret"),
):
    _check_secret(x_sled_secret)
    if not await can_use_ca_scope(body.vk_id):
        raise HTTPException(status_code=403, detail="Нужен доступ ЦА")

    try:
        discord_id = normalize_discord_id(body.discord_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    link = await set_discord_link(
        vk_id=body.vk_id,
        discord_id=discord_id,
        actor_vk_id=body.vk_id,
    )
    return {
        "ok": True,
        "discord_id": link.discord_id if link else None,
    }
