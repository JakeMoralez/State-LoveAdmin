"""Shared panel-owned forum templates and a fenced, complete external snapshot."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from tortoise.expressions import Q, F
from tortoise.transactions import in_transaction

from app.config import DEFAULT_SERVER_ID, FORUM_LIST_API_KEY
from app.models.panel import ForumListSettings, ForumListSnapshot, PanelAuditLog
from app.services import forum_list_data as engine
from app.services.forum_list_provider import Provider, ProviderError

logger = logging.getLogger(__name__)
_tasks: dict[int, asyncio.Task] = {}


def now():
    return datetime.now(timezone.utc)


def fingerprint():
    return hashlib.sha256(FORUM_LIST_API_KEY.encode()).hexdigest() if FORUM_LIST_API_KEY else ""


def require_editor(user):
    if int(user.get("access_level") or 0) < 7:
        raise HTTPException(403, "Редактирование форумного списка доступно с уровня 7.")


async def rows():
    settings, _ = await ForumListSettings.get_or_create(server_id=DEFAULT_SERVER_ID)
    snapshot, _ = await ForumListSnapshot.get_or_create(server_id=DEFAULT_SERVER_ID)
    return settings, snapshot


def current_data(snapshot):
    return snapshot.data if snapshot.fetched_at and snapshot.key_fingerprint == fingerprint() else None


async def state():
    settings, snapshot = await rows()
    data = current_data(snapshot)
    busy = bool(snapshot.lease_until and snapshot.lease_until > now())
    return {
        "configured": bool(FORUM_LIST_API_KEY), "server_id": DEFAULT_SERVER_ID,
        "external_server_id": snapshot.external_server_id if data else None,
        "fetched_at": snapshot.fetched_at.isoformat() if data else None,
        "stale": bool(data and snapshot.fetched_at < now()-timedelta(minutes=5)),
        "refresh_status": snapshot.refresh_status if busy else "idle",
        "error": snapshot.error, "error_kind": snapshot.error_kind,
        "retry_at": snapshot.retry_at.isoformat() if snapshot.retry_at and snapshot.retry_at > now() else None,
        "settings": {"template": settings.template, "mappings": settings.mappings, "version": settings.version,
                     "updated_at": settings.updated_at.isoformat(), "updated_by": settings.updated_by},
        "catalog": engine.catalog(data or {}),
        "result": engine.render(settings.template, data) if data and settings.template else None,
        "default_template": engine.default_template(data) if data else "",
    }


async def _refresh(token: str, key_hash: str):
    async def heartbeat():
        updated = await ForumListSnapshot.filter(server_id=DEFAULT_SERVER_ID, lease_token=token).update(
            lease_until=now()+timedelta(seconds=120), refresh_status="running", retry_at=None)
        if not updated:
            raise asyncio.CancelledError()
    async def waiting(seconds):
        await ForumListSnapshot.filter(server_id=DEFAULT_SERVER_ID, lease_token=token).update(
            refresh_status="waiting", retry_at=now()+timedelta(seconds=seconds))
    provider = Provider(FORUM_LIST_API_KEY, heartbeat, waiting)
    try:
        async with asyncio.timeout(900):
            external_id, sources = await provider.load()
            data = engine.normalize(sources, external_id)
            from app.services.forum_list_contacts import supplement_contacts
            data = await supplement_contacts(data, DEFAULT_SERVER_ID)
            # Previously known empty admin groups remain valid vacant slots, not unknown tokens.
            prior = await ForumListSnapshot.get(server_id=DEFAULT_SERVER_ID)
            if prior.key_fingerprint == key_hash:
                known = {g["key"] for g in data["admin"]}
                data["admin"].extend({"key": g["key"], "name": g["name"], "rows": []}
                    for g in prior.data.get("admin", []) if g["key"] not in known)
            async with in_transaction("default") as tx:
                changed = await ForumListSnapshot.filter(server_id=DEFAULT_SERVER_ID, lease_token=token).using_db(tx).update(
                    key_fingerprint=key_hash, data=data, fetched_at=now(), external_server_id=external_id,
                    error="", error_kind="", refresh_status="idle", lease_until=None, retry_at=None)
                if changed:
                    await ForumListSettings.filter(server_id=DEFAULT_SERVER_ID, version=0, template="").using_db(tx).update(
                        template=engine.default_template(data), version=1, updated_at=now())
    except asyncio.CancelledError:
        await ForumListSnapshot.filter(server_id=DEFAULT_SERVER_ID, lease_token=token).update(
            error="Обновление прервано. Предыдущий снимок сохранён.", error_kind="interrupted", retry_at=now()+timedelta(seconds=60))
        raise
    except ProviderError as error:
        await ForumListSnapshot.filter(server_id=DEFAULT_SERVER_ID, lease_token=token).update(
            error=str(error), error_kind=error.kind, retry_at=now()+timedelta(seconds=60))
    except Exception as error:
        logger.warning("forum_list refresh failed: %s", type(error).__name__)
        await ForumListSnapshot.filter(server_id=DEFAULT_SERVER_ID, lease_token=token).update(
            error="Не удалось завершить обновление. Предыдущий снимок сохранён.", error_kind="response", retry_at=now()+timedelta(seconds=60))
    finally:
        await provider.client.aclose()
        await ForumListSnapshot.filter(server_id=DEFAULT_SERVER_ID, lease_token=token).update(
            refresh_status="idle", lease_until=None)


async def start_refresh(force=False):
    if not FORUM_LIST_API_KEY:
        raise HTTPException(503, "API не настроен. Укажите FORUM_LIST_API_KEY в окружении backend.")
    _, snapshot = await rows()
    if snapshot.retry_at and snapshot.retry_at > now() and not (snapshot.lease_until and snapshot.lease_until > now()):
        return
    if not force and current_data(snapshot) and snapshot.fetched_at >= now()-timedelta(minutes=5):
        return
    # Force still shares the cooldown so many visitors cannot consume the key budget.
    if snapshot.fetched_at and snapshot.key_fingerprint == fingerprint() and snapshot.fetched_at > now()-timedelta(seconds=60):
        return
    token = str(uuid4())
    changed = await ForumListSnapshot.filter(server_id=DEFAULT_SERVER_ID).filter(Q(lease_until__isnull=True) | Q(lease_until__lt=now())).update(
        lease_token=token, lease_until=now()+timedelta(seconds=120), refresh_status="running", retry_at=None, error="", error_kind="")
    if changed:
        task = asyncio.create_task(_refresh(token, fingerprint()))
        _tasks[DEFAULT_SERVER_ID] = task
        def finished(completed):
            if _tasks.get(DEFAULT_SERVER_ID) is completed:
                _tasks.pop(DEFAULT_SERVER_ID, None)
        task.add_done_callback(finished)


async def shutdown():
    tasks = list(_tasks.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


async def preview(user, template=None):
    if template is not None:
        require_editor(user)
    settings, snapshot = await rows()
    data = current_data(snapshot)
    if not data:
        raise HTTPException(409, "Сначала загрузите полный снимок из API.")
    return engine.render(settings.template if template is None else template, data)


async def save(user, version: int, template: str | None, mappings: dict | None, reset=False):
    require_editor(user)
    settings, snapshot = await rows()
    data = current_data(snapshot)
    if not data:
        raise HTTPException(409, "Сначала загрузите полный снимок из API.")
    content = engine.default_template(data) if reset else template
    if not content or len(content) > engine.MAX_TEMPLATE:
        raise HTTPException(400, "Шаблон должен содержать от 1 до 150000 символов.")
    checked = engine.render(content, data)
    if checked["errors"]:
        raise HTTPException(400, "Исправьте плейсхолдеры: " + ", ".join(checked["errors"][:10]))
    mapping = {} if reset else (settings.mappings if mappings is None else mappings)
    ids = {f["id"] for f in data["fractions"]}
    if len(mapping) > 256 or any(not isinstance(k, str) or not re.fullmatch(r"[A-Z0-9_]{1,64}", k) or type(v) is not int or v not in ids for k, v in mapping.items()):
        raise HTTPException(400, "Соответствия должны связывать код организации с ID из каталога API.")
    if settings.template == content and settings.mappings == mapping and settings.version == version:
        return await state()
    async with in_transaction("default") as tx:
        changed = await ForumListSettings.filter(server_id=DEFAULT_SERVER_ID, version=version).using_db(tx).update(
            template=content, mappings=mapping, version=F("version")+1, updated_by=user["vk_id"], updated_at=now())
        if not changed:
            raise HTTPException(409, "Шаблон уже изменён другим сотрудником. Сохраните черновик и загрузите актуальную версию.")
        await PanelAuditLog.create(using_db=tx, actor_vk_id=user["vk_id"], action="forum_list_reset" if reset else "forum_list_save",
            entity_type="forum_list", entity_id=str(DEFAULT_SERVER_ID), detail={"server_id": DEFAULT_SERVER_ID,
            "version": version+1, "characters": len(content), "source": "panel",
            "actor_name_snapshot": user.get("nickname") or user.get("display_name") or f"id{user['vk_id']}",
            "actor_role_snapshot": user.get("access_level_name") or ""})
    return await state()
