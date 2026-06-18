"""Calls to State-LoveBot internal API."""

from __future__ import annotations

import logging

import httpx

from app.config import SLED_BOT_SECRET, SLED_INTERNAL_URL

logger = logging.getLogger(__name__)


async def fetch_chat_members(peer_id: int) -> tuple[list[int], str | None]:
    if not SLED_BOT_SECRET:
        return [], "SLED_BOT_SECRET не настроен — список участников недоступен."

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"{SLED_INTERNAL_URL.rstrip('/')}/internal/chat-members",
                params={"peer_id": peer_id},
                headers={"X-Sled-Secret": SLED_BOT_SECRET},
            )
            if resp.status_code != 200:
                detail = resp.text[:200] if resp.text else resp.status_code
                return [], f"Бот не вернул список участников ({detail})."
            data = resp.json()
            ids = [int(x) for x in data.get("member_ids") or [] if int(x) > 0]
            return ids, None
    except Exception as exc:
        logger.warning("fetch_chat_members peer=%s: %s", peer_id, exc)
        return [], "Не удалось связаться с ботом (SLED_INTERNAL_URL)."
