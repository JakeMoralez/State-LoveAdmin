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


async def validate_judge_list_thread(
    server_id: int,
    thread_id: int,
) -> tuple[dict | None, str | None]:
    if not SLED_BOT_SECRET:
        return None, "SLED_BOT_SECRET не настроен — проверка темы недоступна."

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.get(
                f"{SLED_INTERNAL_URL.rstrip('/')}/internal/forum/thread-info",
                params={"server_id": server_id, "thread_id": thread_id},
                headers={"X-Sled-Secret": SLED_BOT_SECRET},
            )
            if resp.status_code == 404:
                return None, "Тема не найдена на форуме."
            if resp.status_code == 503:
                detail = resp.json().get("error", resp.text[:200])
                return None, f"Форум недоступен: {detail}"
            if resp.status_code != 200:
                detail = resp.text[:200] if resp.text else resp.status_code
                return None, f"Бот не проверил тему ({detail})."
            return resp.json(), None
    except Exception as exc:
        logger.warning(
            "validate_judge_list_thread server=%s thread=%s: %s",
            server_id,
            thread_id,
            exc,
        )
        return None, "Не удалось связаться с ботом (SLED_INTERNAL_URL)."
