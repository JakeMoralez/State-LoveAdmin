"""Developer-only, write-only key configuration. The secret stays in server env/.env."""
import asyncio
import os
import re
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from app.config import BASE_DIR, DEFAULT_SERVER_ID
from app.services import forum_list as svc
from app.services.forum_list_provider import Provider, ProviderError

ENV_PATH = BASE_DIR / ".env"
_lock = asyncio.Lock()


def write_env_key(key: str):
    path = Path(ENV_PATH)
    text = path.read_text(encoding="utf-8-sig") if path.exists() else ""
    assignment = "FORUM_LIST_API_KEY='" + key + "'"
    pattern = r"^(?:export\s+)?FORUM_LIST_API_KEY\s*=.*$"
    text = re.sub(pattern, lambda _: assignment, text, flags=re.M) if re.search(pattern, text, flags=re.M) else text.rstrip("\n") + "\n" + assignment + "\n"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=path.parent, prefix=".forum-key-", delete=False) as file:
            temporary = Path(file.name)
            file.write(text)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


async def status():
    _, snapshot = await svc.rows()
    return {"configured": bool(svc.FORUM_LIST_API_KEY), "external_server_id": snapshot.external_server_id
            if snapshot.key_fingerprint == svc.fingerprint() and svc.FORUM_LIST_API_KEY else None}


async def configure(key: str, *, remove=False):
    if not remove and (not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9._~+/=-]{16,512}", key)):
        raise HTTPException(400, "Введите API-ключ без пробелов и переносов строк.")
    async with _lock:
        server_id = None
        if not remove:
            async def noop(*args):
                return None
            provider = Provider(key, noop, noop)
            try:
                async with asyncio.timeout(35):
                    me = (await provider.get("/me"))["data"]
                    if not isinstance(me, dict) or type(me.get("server_id")) is not int or me["server_id"] <= 0 or me.get("disabled"):
                        raise HTTPException(400, "API не подтвердил активный аккаунт и сервер. Прежний ключ сохранён.")
                    server_id = me["server_id"]
            except ProviderError as error:
                raise HTTPException(400, str(error) + " Прежний ключ сохранён.") from None
            except TimeoutError:
                raise HTTPException(504, "Проверка ключа не завершилась за 35 секунд. Прежний ключ сохранён; повторите позже.") from None
            finally:
                await provider.client.aclose()
        try:
            await asyncio.to_thread(write_env_key, "" if remove else key)
        except (OSError, UnicodeError):
            raise HTTPException(500, "Не удалось сохранить серверную конфигурацию. Прежний ключ сохранён.") from None
        svc.FORUM_LIST_API_KEY = "" if remove else key
        os.environ["FORUM_LIST_API_KEY"] = svc.FORUM_LIST_API_KEY
        await svc.shutdown()
        # Invalidate leases in other workers too; an old in-flight result cannot commit.
        from app.models.panel import ForumListSnapshot
        try:
            await ForumListSnapshot.filter(server_id=DEFAULT_SERVER_ID).update(lease_token=str(uuid4()), lease_until=None,
                data={}, fetched_at=None, external_server_id=server_id, key_fingerprint=svc.fingerprint(),
                refresh_status="idle", error="", error_kind="", retry_at=None)
        except Exception:
            # The env write has committed. Do not claim it failed if cache cleanup needs retry.
            return {"configured": bool(key) and not remove, "external_server_id": server_id,
                    "notice": "Ключ сохранён. Не удалось очистить снимок; повторите обновление раздела."}
        if not remove:
            await svc.start_refresh(force=True)
        return {"configured": not remove, "external_server_id": server_id}
