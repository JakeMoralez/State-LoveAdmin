"""База знаний — регламенты и инструкции (Markdown)."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import DEFAULT_SERVER_ID, MAIN_ADMIN_ID
from app.models.bot import AccessLevel
from app.models.panel import KnowledgeArticle
from app.services import messages
from app.services.audit import log_audit
from app.services.auth import require_ca_user
from app.services.sphere_work import (
    SPHERE_LABELS,
    WORK_SPHERE_KEYS,
    normalize_stored_work_sphere,
    normalize_work_sphere,
    user_sphere_set,
    visible_work_spheres,
    work_item_sphere_filter,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

CATEGORIES = {
    "rules": "Правила",
    "reglament": "Регламент",
    "guide": "Инструкции",
    "other": "Прочее",
}


def _level(user: dict) -> int:
    return int(user.get("access_level") or 0)


def _editable_spheres(user: dict) -> list[str]:
    """ЗГС (3–4) — свои назначенные сферы; следящий структуры (5+) / lead / owner — все."""
    level = _level(user)
    role = user.get("panel_role")
    vk_id = int(user.get("vk_id") or 0)

    if level >= AccessLevel.STRUCTURE_SUPERVISOR or role in ("owner", "lead"):
        return [k for k in WORK_SPHERE_KEYS if k != "server"]
    if level >= AccessLevel.DEVELOPER or (MAIN_ADMIN_ID and vk_id == MAIN_ADMIN_ID):
        return [k for k in WORK_SPHERE_KEYS if k != "server"]
    if level >= AccessLevel.ZGS:
        mine = user_sphere_set(user)
        return [k for k in WORK_SPHERE_KEYS if k in mine and k != "server"]
    return []


def _can_edit_any(user: dict) -> bool:
    return bool(_editable_spheres(user))


def _can_edit_sphere(user: dict, sphere: str) -> bool:
    key = normalize_stored_work_sphere(sphere)
    return key in _editable_spheres(user)


def _resolve_edit_sphere(user: dict, raw: str | None) -> str:
    allowed = _editable_spheres(user)
    if not allowed:
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    key = (raw or "").strip()
    if not key:
        return allowed[0]
    key = normalize_work_sphere(key)
    if key not in allowed:
        label = SPHERE_LABELS.get(key, key)
        raise HTTPException(status_code=403, detail=f"Нет права править базу знаний в сфере «{label}»")
    return key


def _normalize_category(raw: str | None) -> str:
    key = (raw or "other").strip().lower()
    return key if key in CATEGORIES else "other"


def _serialize(row: KnowledgeArticle, *, can_edit: bool | None = None) -> dict:
    sphere = normalize_stored_work_sphere(getattr(row, "sphere", None))
    return {
        "id": row.id,
        "server_id": row.server_id,
        "sphere": sphere,
        "sphere_label": SPHERE_LABELS.get(sphere, sphere),
        "title": row.title,
        "category": row.category,
        "category_label": CATEGORIES.get(row.category, row.category),
        "body_md": row.body_md or "",
        "sort_order": row.sort_order,
        "published": bool(row.published),
        "created_by_vk_id": row.created_by_vk_id,
        "updated_by_vk_id": row.updated_by_vk_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "permissions": {"can_edit": bool(can_edit) if can_edit is not None else False},
    }


def _permissions_payload(user: dict) -> dict:
    editable = _editable_spheres(user)
    return {
        "can_edit": bool(editable),
        "editable_spheres": editable,
        "can_edit_all_spheres": _level(user) >= AccessLevel.STRUCTURE_SUPERVISOR
        or user.get("panel_role") in ("owner", "lead")
        or _level(user) >= AccessLevel.DEVELOPER,
    }


class ArticleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    category: str = "other"
    body_md: str = ""
    sort_order: int = 0
    published: bool = True
    sphere: str | None = None


class ArticleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    category: str | None = None
    body_md: str | None = None
    sort_order: int | None = None
    published: bool | None = None
    sphere: str | None = None


@router.get("/meta")
async def knowledge_meta(user: dict = Depends(require_ca_user)):
    return {
        "categories": [{"id": k, "label": v} for k, v in CATEGORIES.items()],
        "permissions": _permissions_payload(user),
    }


def _plain_excerpt(body: str, max_len: int = 180) -> str:
    text = (body or "").replace("\r\n", "\n").strip()
    if not text:
        return ""

    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.M)
    text = re.sub(r"^\s{0,3}([-*+]|\d+\.)\s+", "", text, flags=re.M)
    text = re.sub(r"^\s{0,3}>\s?", "", text, flags=re.M)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"(\*\*|__)(.*?)\1", r"\2", text)
    text = re.sub(r"(\*|_)(.*?)\1", r"\2", text)
    text = re.sub(r"~~(.*?)~~", r"\1", text)
    text = re.sub(r"[|]", " ", text)
    text = re.sub(r"^[-*_]{3,}\s*$", " ", text, flags=re.M)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


@router.get("")
async def list_articles(
    server_id: int = DEFAULT_SERVER_ID,
    category: str | None = None,
    q: str | None = None,
    sphere: list[str] | None = Query(default=None),
    include_drafts: bool = Query(default=False),
    user: dict = Depends(require_ca_user),
):
    # Чтение: все опубликованные; фильтр сферы — по видимым рабочим сферам пользователя
    visible = visible_work_spheres(user)
    if not visible:
        # Без сфер всё равно показываем все опубликованные (справочник)
        qs = KnowledgeArticle.filter(server_id=server_id)
        filter_spheres: list[str] | None = None
    else:
        if sphere:
            wanted = []
            for item in sphere:
                key = normalize_work_sphere(item)
                if key in visible and key not in wanted:
                    wanted.append(key)
            filter_spheres = wanted or visible
        else:
            filter_spheres = None  # все статьи портала
        qs = KnowledgeArticle.filter(server_id=server_id)
        if filter_spheres is not None:
            qs = qs.filter(work_item_sphere_filter(filter_spheres))

    editable = set(_editable_spheres(user))
    can_edit_any = bool(editable)

    if include_drafts and can_edit_any:
        # Черновики — только своих сфер; чужие сферы — только published
        pass
    else:
        qs = qs.filter(published=True)

    if category:
        qs = qs.filter(category=_normalize_category(category))

    rows = await qs.order_by("sort_order", "title").all()

    if include_drafts and can_edit_any:
        rows = [
            r
            for r in rows
            if r.published or normalize_stored_work_sphere(getattr(r, "sphere", None)) in editable
        ]

    needle = (q or "").strip().lower()
    if needle:
        rows = [
            r
            for r in rows
            if needle in (r.title or "").lower() or needle in (r.body_md or "").lower()
        ]

    items = []
    for r in rows:
        sphere_key = normalize_stored_work_sphere(getattr(r, "sphere", None))
        data = _serialize(r, can_edit=sphere_key in editable)
        data.pop("body_md", None)
        data["excerpt"] = _plain_excerpt(r.body_md or "")
        items.append(data)

    return {
        "articles": items,
        "categories": [{"id": k, "label": v} for k, v in CATEGORIES.items()],
        "permissions": _permissions_payload(user),
    }


@router.get("/{article_id}")
async def get_article(
    article_id: int,
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    row = await KnowledgeArticle.get_or_none(id=article_id, server_id=server_id)
    if not row:
        raise HTTPException(status_code=404, detail="Статья не найдена")
    sphere_key = normalize_stored_work_sphere(getattr(row, "sphere", None))
    can_edit = _can_edit_sphere(user, sphere_key)
    if not row.published and not can_edit:
        raise HTTPException(status_code=404, detail="Статья не найдена")
    return {
        **_serialize(row, can_edit=can_edit),
        "permissions": {
            "can_edit": can_edit,
            "editable_spheres": _editable_spheres(user),
        },
    }


@router.post("")
async def create_article(
    body: ArticleCreate,
    server_id: int = DEFAULT_SERVER_ID,
    sphere: str | None = None,
    user: dict = Depends(require_ca_user),
):
    target = _resolve_edit_sphere(user, body.sphere or sphere)
    row = await KnowledgeArticle.create(
        server_id=server_id,
        sphere=target,
        title=body.title.strip(),
        category=_normalize_category(body.category),
        body_md=body.body_md or "",
        sort_order=int(body.sort_order or 0),
        published=bool(body.published),
        created_by_vk_id=user["vk_id"],
        updated_by_vk_id=user["vk_id"],
    )
    await log_audit(
        user["vk_id"],
        "knowledge_create",
        "knowledge",
        row.id,
        {"title": row.title, "sphere": target},
    )
    return _serialize(row, can_edit=True)


@router.patch("/{article_id}")
async def update_article(
    article_id: int,
    body: ArticleUpdate,
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    row = await KnowledgeArticle.get_or_none(id=article_id, server_id=server_id)
    if not row:
        raise HTTPException(status_code=404, detail="Статья не найдена")
    current_sphere = normalize_stored_work_sphere(getattr(row, "sphere", None))
    if not _can_edit_sphere(user, current_sphere):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)

    data = body.model_dump(exclude_unset=True)
    if "sphere" in data and data["sphere"] is not None:
        row.sphere = _resolve_edit_sphere(user, data["sphere"])
    if "title" in data and data["title"] is not None:
        row.title = str(data["title"]).strip()
    if "category" in data and data["category"] is not None:
        row.category = _normalize_category(data["category"])
    if "body_md" in data and data["body_md"] is not None:
        row.body_md = data["body_md"]
    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = int(data["sort_order"])
    if "published" in data and data["published"] is not None:
        row.published = bool(data["published"])
    row.updated_by_vk_id = user["vk_id"]
    await row.save()
    await log_audit(user["vk_id"], "knowledge_update", "knowledge", row.id, {"title": row.title})
    return _serialize(row, can_edit=True)


@router.delete("/{article_id}")
async def delete_article(
    article_id: int,
    server_id: int = DEFAULT_SERVER_ID,
    user: dict = Depends(require_ca_user),
):
    row = await KnowledgeArticle.get_or_none(id=article_id, server_id=server_id)
    if not row:
        raise HTTPException(status_code=404, detail="Статья не найдена")
    current_sphere = normalize_stored_work_sphere(getattr(row, "sphere", None))
    if not _can_edit_sphere(user, current_sphere):
        raise HTTPException(status_code=403, detail=messages.FORBIDDEN)
    title = row.title
    await row.delete()
    await log_audit(user["vk_id"], "knowledge_delete", "knowledge", article_id, {"title": title})
    return {"ok": True}
