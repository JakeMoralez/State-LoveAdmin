"""BBCode-шаблон списка судей на форуме — рендер для панели."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from app.models.bot import JudgeForumListSettings, Server, User, UserServerAccess

MSK = timezone(timedelta(hours=3))

THREAD_URL_RE = re.compile(
    r"(?:https?://)?(?:[\w.-]+\.)?arizona-rp\.com/threads/(?:[^/\s?#]+\.)?(\d+)",
    re.IGNORECASE,
)

DEFAULT_BODY_TEMPLATE = """[center][size=5][b]Список судей[/b][/size][/center]
[i]Обновлено: {{updated_at}}[/i]

{{judges_block}}"""

DEFAULT_LINE_TEMPLATE = "[*]{{nickname}} — судья с {{since}}{{note_suffix}}"

DEFAULT_EMPTY_TEXT = "[i]Судей нет.[/i]"

JUDGE_LIST_FORUM_ID = 3758
JUDGE_LIST_FORUM_URL = f"https://forum.arizona-rp.com/forums/{JUDGE_LIST_FORUM_ID}/"

ZGS_MIN_LEVEL = 3


def parse_thread_id(raw: str | int | None) -> int | None:
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw if raw > 0 else None
    text = str(raw).strip()
    if not text:
        return None
    if text.isdigit():
        return int(text)
    match = THREAD_URL_RE.search(text)
    if match:
        return int(match.group(1))
    return None


def escape_bbcode_text(value: str) -> str:
    return value.replace("[", "［").replace("]", "］")


def _judge_since(user: User) -> str:
    dt = user.last_used or user.added_at
    if not dt:
        return "—"
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(MSK).strftime("%d.%m.%Y")
    return str(dt)


def _format_updated_at(when: datetime | None = None) -> str:
    dt = when or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(MSK).strftime("%d.%m.%Y %H:%M")


def _apply_line_template(
    template: str,
    *,
    nickname: str,
    since: str,
    note: str,
    index: int,
) -> str:
    note_suffix = f" — {escape_bbcode_text(note)}" if note.strip() else ""
    result = template
    replacements = {
        "{{nickname}}": nickname,
        "{{since}}": since,
        "{{note}}": escape_bbcode_text(note) if note.strip() else "",
        "{{note_suffix}}": note_suffix,
        "{{index}}": str(index),
    }
    for key, value in replacements.items():
        result = result.replace(key, value)
    return result


async def _resolve_nickname(user: User, server_id: int) -> str:
    access = await UserServerAccess.get_or_none(user_id=user.vk_id, server_id=server_id)
    if access and (access.nickname or "").strip():
        return escape_bbcode_text(access.nickname.strip())
    if user.username and user.username.strip():
        return escape_bbcode_text(user.username.strip())
    return f"id{user.vk_id}"


async def build_judges_block(
    server_id: int,
    *,
    line_template: str,
    empty_text: str,
) -> tuple[str, int]:
    rows = (
        await UserServerAccess.filter(server_id=server_id, is_judge=True)
        .prefetch_related("user")
        .order_by("-granted_at")
    )
    if not rows:
        return empty_text, 0

    lines: list[str] = []
    for index, access in enumerate(rows, start=1):
        user = access.user
        nickname = await _resolve_nickname(user, server_id)
        since = _judge_since(user)
        note = (user.note or "").strip()
        lines.append(
            _apply_line_template(
                line_template,
                nickname=nickname,
                since=since,
                note=note,
                index=index,
            )
        )
    return "[LIST]\n" + "\n".join(lines) + "\n[/LIST]", len(lines)


async def render_judge_list_body(
    server_id: int,
    *,
    body_template: str | None = None,
    line_template: str | None = None,
    empty_text: str | None = None,
) -> str:
    body = body_template or DEFAULT_BODY_TEMPLATE
    line = line_template or DEFAULT_LINE_TEMPLATE
    empty = empty_text or DEFAULT_EMPTY_TEXT

    judges_block, judges_count = await build_judges_block(
        server_id,
        line_template=line,
        empty_text=empty,
    )
    server = await Server.get_or_none(id=server_id)
    server_name = server.name if server else f"Сервер {server_id}"

    replacements = {
        "{{judges_block}}": judges_block,
        "{{judges_count}}": str(judges_count),
        "{{updated_at}}": _format_updated_at(),
        "{{server_name}}": escape_bbcode_text(server_name),
    }
    result = body
    for key, value in replacements.items():
        result = result.replace(key, value)
    return result


async def get_or_create_settings(server_id: int) -> JudgeForumListSettings:
    settings, _ = await JudgeForumListSettings.get_or_create(
        server_id=server_id,
        defaults={
            "body_template": DEFAULT_BODY_TEMPLATE,
            "line_template": DEFAULT_LINE_TEMPLATE,
            "empty_text": DEFAULT_EMPTY_TEXT,
        },
    )
    return settings


def serialize_settings(settings: JudgeForumListSettings) -> dict:
    return {
        "server_id": settings.server_id,
        "thread_id": settings.thread_id,
        "thread_url": (
            f"https://arizona-rp.com/threads/{settings.thread_id}/"
            if settings.thread_id
            else None
        ),
        "required_forum_id": JUDGE_LIST_FORUM_ID,
        "required_forum_url": JUDGE_LIST_FORUM_URL,
        "enabled": settings.enabled,
        "body_template": settings.body_template or DEFAULT_BODY_TEMPLATE,
        "line_template": settings.line_template or DEFAULT_LINE_TEMPLATE,
        "empty_text": settings.empty_text or DEFAULT_EMPTY_TEXT,
        "updated_by_vk_id": settings.updated_by_vk_id,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }
