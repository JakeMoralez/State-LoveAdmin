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


def _bot_error(resp: httpx.Response, fallback: str) -> str:
    try:
        detail = resp.json().get("error")
        if detail:
            return str(detail)
    except Exception:
        pass
    return f"{fallback} ({resp.text[:200] if resp.text else resp.status_code})"


async def ping_bot() -> tuple[bool, str | None]:
    if not SLED_BOT_SECRET:
        return False, "SLED_BOT_SECRET не настроен."
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(
                f"{SLED_INTERNAL_URL.rstrip('/')}/internal/health",
                headers={"X-Sled-Secret": SLED_BOT_SECRET},
            )
            if resp.status_code != 200:
                return False, _bot_error(resp, "Бот не ответил")
            return True, None
    except Exception as exc:
        logger.warning("ping_bot: %s", exc)
        return False, "Не удалось связаться с ботом (SLED_INTERNAL_URL)."


async def fetch_dev_chats(server_id: int) -> tuple[dict | None, str | None]:
    if not SLED_BOT_SECRET:
        return None, "SLED_BOT_SECRET не настроен — беседы недоступны."
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.get(
                f"{SLED_INTERNAL_URL.rstrip('/')}/internal/chats",
                params={"server_id": server_id},
                headers={"X-Sled-Secret": SLED_BOT_SECRET},
            )
            if resp.status_code != 200:
                return None, _bot_error(resp, "Бот не вернул список бесед")
            data = resp.json()
            if not isinstance(data, dict):
                return None, "Бот вернул некорректный список бесед."
            return data, None
    except Exception as exc:
        logger.warning("fetch_dev_chats server=%s: %s", server_id, exc)
        return None, "Не удалось связаться с ботом (SLED_INTERNAL_URL)."


async def patch_dev_chat(peer_id: int, body: dict) -> tuple[dict | None, str | None]:
    if not SLED_BOT_SECRET:
        return None, "SLED_BOT_SECRET не настроен — беседы недоступны."
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.patch(
                f"{SLED_INTERNAL_URL.rstrip('/')}/internal/chats/{peer_id}",
                json=body,
                headers={"X-Sled-Secret": SLED_BOT_SECRET},
            )
            if resp.status_code == 400:
                return None, _bot_error(resp, "Не удалось сохранить беседу")
            if resp.status_code != 200:
                return None, _bot_error(resp, "Бот не сохранил беседу")
            data = resp.json()
            if not isinstance(data, dict):
                return None, "Бот вернул некорректный ответ."
            return data, None
    except Exception as exc:
        logger.warning("patch_dev_chat peer=%s: %s", peer_id, exc)
        return None, "Не удалось связаться с ботом (SLED_INTERNAL_URL)."
