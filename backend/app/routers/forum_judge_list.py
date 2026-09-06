"""API настройки BBCode-шаблона списка судей на форуме."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.models.bot import Server
from app.services.audit import log_audit
from app.services.auth import require_ca_user
from app.services import messages
from app.services.forum_judge_list import (
    DEFAULT_BODY_TEMPLATE,
    DEFAULT_EMPTY_TEXT,
    DEFAULT_LINE_TEMPLATE,
    JUDGE_LIST_FORUM_ID,
    JUDGE_LIST_FORUM_URL,
    ZGS_MIN_LEVEL,
    _normalize_templates,
    get_or_create_settings,
    parse_thread_id,
    render_judge_list_body,
    resolve_save_thread_id,
    serialize_settings,
)
from app.services.sled_client import validate_judge_list_thread

router = APIRouter(prefix="/api/forum", tags=["forum"])


def require_zgs_user(user: dict = Depends(require_ca_user)) -> dict:
    level = int(user.get("access_level") or 0)
    if level < ZGS_MIN_LEVEL:
        raise HTTPException(status_code=403, detail=messages.FORUM_NEED_ZGS_GOS)
    return user


class JudgeListBody(BaseModel):
    server_id: int = Field(ge=1)
    thread_id: int | None = None
    thread_url: str | None = None
    enabled: bool = True
    body_template: str = Field(default=DEFAULT_BODY_TEMPLATE)
    line_template: str = Field(default=DEFAULT_LINE_TEMPLATE)
    empty_text: str = Field(default=DEFAULT_EMPTY_TEXT)


class JudgeListPreviewBody(BaseModel):
    server_id: int = Field(ge=1)
    body_template: str | None = None
    line_template: str | None = None
    empty_text: str | None = None


class JudgeListValidateThreadBody(BaseModel):
    server_id: int = Field(ge=1)
    thread_id: int | None = None
    thread_url: str | None = None


@router.get("/judge-list/servers")
async def list_servers(user: dict = Depends(require_zgs_user)):
    rows = await Server.filter(is_active=True).order_by("id")
    return {
        "servers": [
            {
                "id": s.id,
                "name": s.name,
                "slug": s.slug,
                "tag": s.tag,
                "judge_forum_id": JUDGE_LIST_FORUM_ID,
                "judge_forum_url": JUDGE_LIST_FORUM_URL,
            }
            for s in rows
        ]
    }


@router.get("/judge-list")
async def get_judge_list_settings(
    server_id: int = Query(..., ge=1),
    user: dict = Depends(require_zgs_user),
):
    settings = await get_or_create_settings(server_id)
    return serialize_settings(settings)


def _bot_unreachable(err: str) -> bool:
    lowered = err.lower()
    markers = (
        "sled_internal",
        "sled_bot_secret",
        "не удалось связаться",
        "не настроен",
        "forum unavailable",
        "недоступен",
    )
    return any(m in lowered for m in markers)


@router.post("/judge-list/validate-thread")
async def validate_judge_list_thread_endpoint(
    body: JudgeListValidateThreadBody,
    user: dict = Depends(require_zgs_user),
):
    thread_id = body.thread_id
    if body.thread_url:
        parsed = parse_thread_id(body.thread_url)
        if not parsed:
            raise HTTPException(status_code=400, detail=messages.FORUM_BAD_THREAD_URL)
        thread_id = parsed
    if not thread_id or thread_id <= 0:
        raise HTTPException(status_code=400, detail=messages.FORUM_NEED_THREAD)

    check, err = await validate_judge_list_thread(body.server_id, thread_id)
    if err:
        if _bot_unreachable(err):
            return {
                "valid": None,
                "skipped": True,
                "error": err,
                "required_forum_url": JUDGE_LIST_FORUM_URL,
            }
        raise HTTPException(status_code=502, detail=err)
    return {
        "valid": bool(check and check.get("valid")),
        "skipped": False,
        "error": (check or {}).get("error"),
        "title": (check or {}).get("title"),
        "forum_name": (check or {}).get("forum_name"),
        "category_id": (check or {}).get("category_id"),
        "required_forum_url": JUDGE_LIST_FORUM_URL,
    }


@router.put("/judge-list")
async def save_judge_list_settings(
    body: JudgeListBody,
    user: dict = Depends(require_zgs_user),
):
    server = await Server.get_or_none(id=body.server_id)
    if not server:
        raise HTTPException(status_code=404, detail=messages.SERVER_NOT_FOUND)

    settings = await get_or_create_settings(body.server_id)
    fields_set = body.model_fields_set

    try:
        thread_id = resolve_save_thread_id(
            thread_url=body.thread_url,
            thread_id=body.thread_id,
            thread_url_set="thread_url" in fields_set,
            thread_id_set="thread_id" in fields_set,
            current_thread_id=settings.thread_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    next_enabled = body.enabled if "enabled" in fields_set else settings.enabled
    if "enabled" in fields_set and body.enabled and not thread_id:
        raise HTTPException(
            status_code=400,
            detail=messages.FORUM_THREAD_HINT,
        )

    validation_warning: str | None = None
    if thread_id and next_enabled:
        check, err = await validate_judge_list_thread(body.server_id, thread_id)
        if err:
            if _bot_unreachable(err):
                validation_warning = (
                    f"{err} Тема сохранена без проверки раздела — "
                    "убедитесь, что она в forums/3758/, когда бот будет онлайн."
                )
            else:
                raise HTTPException(status_code=502, detail=err)
        elif not check or not check.get("valid"):
            raise HTTPException(
                status_code=400,
                detail=(check or {}).get("error") or "Тема не из раздела судей.",
            )

    settings.thread_id = thread_id
    if "enabled" in fields_set:
        settings.enabled = body.enabled
    body_tpl, line_tpl, empty_tpl = _normalize_templates(
        body.body_template.strip() or DEFAULT_BODY_TEMPLATE,
        body.line_template.strip() or DEFAULT_LINE_TEMPLATE,
        body.empty_text.strip() or DEFAULT_EMPTY_TEXT,
    )
    settings.body_template = body_tpl
    settings.line_template = line_tpl
    settings.empty_text = empty_tpl
    settings.updated_by_vk_id = int(user["vk_id"])
    await settings.save()

    await log_audit(
        user["vk_id"],
        "judge_forum_template_save",
        "judge_forum_list",
        body.server_id,
        {"thread_id": thread_id, "enabled": next_enabled},
    )
    result = serialize_settings(settings)
    if validation_warning:
        result["warning"] = validation_warning
    return result


@router.post("/judge-list/preview")
async def preview_judge_list(
    body: JudgeListPreviewBody,
    user: dict = Depends(require_zgs_user),
):
    rendered = await render_judge_list_body(
        body.server_id,
        body_template=body.body_template,
        line_template=body.line_template,
        empty_text=body.empty_text,
    )
    return {"rendered": rendered}
