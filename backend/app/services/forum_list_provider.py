"""Read-only r-arrow API adapter. Exceptions contain no upstream text or credentials."""
import asyncio
import time
from collections import deque

import httpx

BASE = "https://r-arrow.ru/api/v1"
_requests: deque[float] = deque()
clock = time.monotonic


class ProviderError(Exception):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


class Provider:
    def __init__(self, key: str, heartbeat, waiting, client=None):
        self.key = key
        self.heartbeat = heartbeat
        self.waiting = waiting
        self.client = client or httpx.AsyncClient(timeout=httpx.Timeout(20, connect=5), follow_redirects=False)

    async def _wait(self, seconds: float):
        await self.heartbeat()
        await self.waiting(seconds)
        await asyncio.sleep(seconds)

    async def _request(self, path: str, params=None) -> dict:
        await self.heartbeat()
        try:
            response = await self.client.get(BASE + path, params=params,
                headers={"Authorization": "Bearer " + self.key, "Accept": "application/json"})
        except httpx.TimeoutException:
            raise ProviderError("timeout", "Сервис не ответил вовремя. Предыдущий снимок сохранён.") from None
        except httpx.RequestError:
            raise ProviderError("connection", "Не удалось подключиться к r-arrow.ru. Предыдущий снимок сохранён.") from None
        if response.status_code == 429:
            return {"limited": True}
        if response.status_code == 401:
            raise ProviderError("authentication", "Сервис отклонил API-ключ. Проверьте FORUM_LIST_API_KEY на сервере.")
        if response.status_code == 403:
            raise ProviderError("permission", "У API-ключа недостаточно прав для запрошенных списков.")
        if not response.is_success:
            raise ProviderError("upstream", f"Сервис вернул HTTP {response.status_code}. Предыдущий снимок сохранён.")
        try:
            body = response.json()
        except ValueError:
            raise ProviderError("response", "Сервис вернул некорректный ответ. Предыдущий снимок сохранён.") from None
        if not isinstance(body, dict) or body.get("success") is not True or "data" not in body:
            raise ProviderError("response", "API не подтвердил получение данных. Предыдущий снимок сохранён.")
        return body

    async def get(self, path: str, params=None) -> dict:
        while True:
            budget = await self._request("/rate-limit")
            if budget.get("limited"):
                await self._wait(60)
                continue
            data = budget["data"]
            if not isinstance(data, dict) or type(data.get("remaining")) is not int:
                raise ProviderError("response", "Не удалось проверить лимит внешнего API.")
            if data["remaining"] <= 0:
                await self._wait(60)
                continue
            now = clock()
            while _requests and now - _requests[0] >= 60:
                _requests.popleft()
            if len(_requests) >= 8:
                await self._wait(max(0.1, 60 - (now - _requests[0])))
                continue
            _requests.append(clock())
            result = await self._request(path, params)
            if result.get("limited"):
                await self._wait(60)
                continue
            return result

    async def all_pages(self, path: str, server_id: int) -> list[dict]:
        rows, page, pages = [], 1, 1
        while page <= pages:
            body = await self.get(path, {"server_id": server_id, "page": page, "per_page": 50})
            items, meta = body["data"], body.get("meta")
            if not isinstance(items, list) or any(not isinstance(r, dict) for r in items) or not isinstance(meta, dict):
                raise ProviderError("response", "API вернул некорректную страницу списка.")
            if meta.get("server_id") != server_id or type(meta.get("pages")) is not int or not 0 <= meta["pages"] <= 200:
                raise ProviderError("response", "Не удалось подтвердить сервер или пагинацию списка.")
            rows.extend(items)
            pages = meta["pages"]
            if page == max(pages, 1) and type(meta.get("total")) is int and len(rows) != meta["total"]:
                raise ProviderError("response", "Список изменился при загрузке. Повторите обновление.")
            page += 1
        return rows

    async def load(self):
        me = (await self.get("/me"))["data"]
        if not isinstance(me, dict) or type(me.get("server_id")) is not int or me["server_id"] <= 0 or me.get("disabled"):
            raise ProviderError("permission", "Не удалось подтвердить активного владельца API-ключа и его сервер.")
        sid = me["server_id"]
        body = await self.get("/fractions", {"server_id": sid})
        if not isinstance(body["data"], list) or not all(isinstance(r, dict) for r in body["data"]) or (body.get("meta") or {}).get("server_id") != sid:
            raise ProviderError("response", "API вернул некорректный каталог организаций.")
        sources = {"fractions": body["data"]}
        for name in ("leaders", "judges", "ministers", "administration"):
            sources[name] = await self.all_pages("/"+name, sid)
        return sid, sources
