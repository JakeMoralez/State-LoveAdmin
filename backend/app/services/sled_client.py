"""Calls to State-LoveBot internal API."""

from __future__ import annotations

import logging

import httpx

from app.config import SLED_BOT_SECRET, SLED_INTERNAL_URL
from app.services.http_client import get_http_client
from app.services.request_id import REQUEST_ID_HEADER, get_or_create_request_id

logger = logging.getLogger(__name__)


def _sled_headers() -> dict[str, str]:
    return {
        "X-Sled-Secret": SLED_BOT_SECRET,
        REQUEST_ID_HEADER: get_or_create_request_id(),
    }


async def fetch_chat_members(peer_id: int) -> tuple[list[int] | None, str | None]:
    """None members means an inaccessible chat to skip, never a confirmed empty chat."""
    if not SLED_BOT_SECRET:
        return [], "SLED_BOT_SECRET не настроен — список участников недоступен."

    try:
        client = get_http_client()
        resp = await client.get(
            f"{SLED_INTERNAL_URL.rstrip('/')}/internal/chat-members",
            params={"peer_id": peer_id},
            headers=_sled_headers(),
            timeout=20.0,
        )
        if resp.status_code != 200:
            if resp.status_code in (401, 403):
                return [], "Бот отклонил подключение панели. Проверьте совпадение SLED_BOT_SECRET панели и бота."
            try:
                detail = resp.json()
            except ValueError:
                detail = {}
            if isinstance(detail, dict) and detail.get("error") == "membership_unavailable":
                diagnostics = detail.get("diagnostics")
                attempts = diagnostics.get("attempts", []) if isinstance(diagnostics, dict) else []
                codes = sorted({row["vk_error_code"] for row in attempts if isinstance(row, dict)
                                and type(row.get("vk_error_code")) is int and 0 < row["vk_error_code"] < 10000}) if isinstance(attempts, list) else []
                access_codes = {7, 15, 917, 922, 925, 927, 932}
                request_failed = isinstance(attempts, list) and any(
                    isinstance(row, dict) and row.get("error_kind") == "request_failed" for row in attempts
                )
                if not request_failed and (access_codes.intersection(codes) or not attempts):
                    return None, None
                suffix = f" Код VK: {', '.join(map(str, codes))}." if codes else ""
                if 917 in codes:
                    message = ("VK не дал доступа к зарегистрированной беседе. "
                               "Проверьте сохранённый ID беседы и соответствие VK_GROUP_ID сообществу бота. "
                               "Если /members в этой беседе работает, сравните ID успешного и неуспешного запросов в логе бота.")
                elif 925 in codes:
                    message = "VK сообщает, что бот не администратор этой беседы. Проверьте его права в участниках беседы."
                elif 5 in codes or 27 in codes:
                    message = "VK отклонил авторизацию запроса участников. Проверьте соответствие VK_GROUP_TOKEN и VK_GROUP_ID бота."
                else:
                    message = ("VK не предоставил боту список участников беседы. "
                               "Проверьте, что бот находится в нужной беседе и имеет права администратора.")
                if isinstance(diagnostics, dict) and diagnostics.get("user_token_configured") is True:
                    message += " Также проверьте действительность VK_USER_TOKEN и доступ его аккаунта к беседе."
                return [], message + suffix
            return [], f"Не удалось получить участников беседы: бот вернул HTTP {resp.status_code}."
        data = resp.json()
        if not isinstance(data, dict) or not isinstance(data.get("member_ids"), list):
            return [], "Бот вернул некорректный список участников беседы."
        ids = [x for x in data["member_ids"] if type(x) is int and x > 0]
        return ids, None
    except httpx.TimeoutException:
        return [], "Бот не успел получить участников беседы. Повторите запрос."
    except Exception as exc:
        logger.warning("fetch_chat_members peer=%s: %s", peer_id, type(exc).__name__)
        return [], "Не удалось связаться с ботом (SLED_INTERNAL_URL)."


async def validate_judge_list_thread(
    server_id: int,
    thread_id: int,
) -> tuple[dict | None, str | None]:
    if not SLED_BOT_SECRET:
        return None, "SLED_BOT_SECRET не настроен — проверка темы недоступна."

    try:
        client = get_http_client()
        resp = await client.get(
            f"{SLED_INTERNAL_URL.rstrip('/')}/internal/forum/thread-info",
            params={"server_id": server_id, "thread_id": thread_id},
            headers=_sled_headers(),
            timeout=25.0,
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
        client = get_http_client()
        resp = await client.get(
            f"{SLED_INTERNAL_URL.rstrip('/')}/internal/health",
            headers=_sled_headers(),
            timeout=4.0,
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
        client = get_http_client()
        resp = await client.get(
            f"{SLED_INTERNAL_URL.rstrip('/')}/internal/chats",
            params={"server_id": server_id},
            headers=_sled_headers(),
            timeout=45.0,
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
        client = get_http_client()
        resp = await client.patch(
            f"{SLED_INTERNAL_URL.rstrip('/')}/internal/chats/{peer_id}",
            json=body,
            headers=_sled_headers(),
            timeout=45.0,
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


async def _bot_request(
    method: str,
    path: str,
    *,
    params: dict | None = None,
    json_body: dict | None = None,
    timeout: float = 30.0,
) -> tuple[dict | None, str | None]:
    if not SLED_BOT_SECRET:
        return None, "SLED_BOT_SECRET не настроен."
    try:
        client = get_http_client()
        resp = await client.request(
            method,
            f"{SLED_INTERNAL_URL.rstrip('/')}{path}",
            params=params,
            json=json_body,
            headers=_sled_headers(),
            timeout=timeout,
        )
        if resp.status_code >= 400:
            if path.startswith("/internal/forum/"):
                # Do not return arbitrary upstream bodies, URLs or exception text.
                if resp.status_code in (401, 403):
                    return None, "Бот отклонил межсервисную авторизацию. Проверьте настройку интеграции."
                if resp.status_code == 504:
                    return None, "Истекло время операции форума. Часть изменений могла быть выполнена; проверьте статус перед повтором."
                return None, f"Бот не выполнил операцию форума (HTTP {resp.status_code}). Проверьте параметры и состояние подключения."
            return None, _bot_error(resp, "Ошибка бота")
        data = resp.json()
        if not isinstance(data, dict):
            return None, "Бот вернул некорректный ответ."
        return data, None
    except httpx.TimeoutException:
        return None, "Бот не успел ответить. Результат операции не подтверждён; обновите статус перед повтором."
    except Exception as exc:
        logger.warning("bot_request %s %s: %s", method, path, type(exc).__name__)
        return None, "Не удалось связаться с ботом (SLED_INTERNAL_URL)."


async def forum_status() -> tuple[dict | None, str | None]:
    return await _bot_request("GET", "/internal/forum/status", timeout=20.0)


async def forum_reconnect() -> tuple[dict | None, str | None]:
    return await _bot_request("POST", "/internal/forum/reconnect", timeout=45.0)


async def forum_replace_cookies(cookies: dict) -> tuple[dict | None, str | None]:
    return await _bot_request("POST", "/internal/forum/cookies", json_body=cookies, timeout=45.0)


async def forum_sync_judges(server_id: int) -> tuple[dict | None, str | None]:
    return await _bot_request(
        "POST",
        "/internal/forum/sync-judges",
        params={"server_id": server_id},
        timeout=90.0,
    )


async def fetch_command_access(server_id: int) -> tuple[dict | None, str | None]:
    return await _bot_request(
        "GET",
        "/internal/command-access",
        params={"server_id": server_id},
        timeout=20.0,
    )


async def save_command_access(server_id: int, updates: list) -> tuple[dict | None, str | None]:
    return await _bot_request(
        "PUT",
        "/internal/command-access",
        json_body={"server_id": server_id, "updates": updates},
        timeout=30.0,
    )


async def notify_issuance_created(payload: dict) -> tuple[dict | None, str | None]:
    """Новая заявка на выдачу → беседа «Управляющие»."""
    return await _bot_request(
        "POST",
        "/internal/issuance-notify",
        json_body=payload,
        timeout=20.0,
    )
