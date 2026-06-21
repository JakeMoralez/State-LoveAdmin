"""BBCode-шаблон списка судей на форуме — рендер для панели."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from app.models.bot import JudgeForumListSettings, Server, User, UserServerAccess
from app.services.staff import resolve_judge_position_for_forum

MSK = timezone(timedelta(hours=3))

THREAD_URL_RE = re.compile(
    r"(?:https?://)?(?:[\w.-]+\.)?arizona-rp\.com/threads/(?:[^/\s?#]+\.)?(\d+)",
    re.IGNORECASE,
)

DEFAULT_BODY_TEMPLATE = """[center][size=5][b]Список судей[/b][/size][/center]
[i]Обновлено: {{updated_at}}[/i]

{{judges_block}}"""

DEFAULT_LINE_TEMPLATE = "[b]{{clean_nickname}}[/b] — {{position}} с {{since}}"

DEFAULT_EMPTY_TEXT = "[i]Судей нет.[/i]"

JUDGE_LIST_FORUM_ID = 3758
JUDGE_LIST_FORUM_URL = f"https://forum.arizona-rp.com/forums/{JUDGE_LIST_FORUM_ID}/"

ZGS_MIN_LEVEL = 3

_LIST_BB_RE = re.compile(r"\[(?:/?list|\*)\]", re.IGNORECASE)


def strip_list_bbcode(text: str) -> str:
    """Убрать [list], [/list], [*] — список судей без XenForo-списка."""
    if not text:
        return text
    return _LIST_BB_RE.sub("", text)


def _normalize_templates(
    body_template: str,
    line_template: str,
    empty_text: str,
) -> tuple[str, str, str]:
    return (
        strip_list_bbcode(body_template),
        strip_list_bbcode(line_template),
        strip_list_bbcode(empty_text),
    )


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


def resolve_save_thread_id(
    *,
    thread_url: str | None,
    thread_id: int | None,
    thread_url_set: bool,
    thread_id_set: bool,
    current_thread_id: int | None,
) -> int | None:
    """Не затирать thread_id, если клиент не передал тему (только шаблоны)."""
    if thread_url and thread_url.strip():
        parsed = parse_thread_id(thread_url)
        if not parsed:
            raise ValueError("Некорректная ссылка на тему")
        return parsed
    if thread_id_set:
        return thread_id if thread_id and thread_id > 0 else None
    if thread_url_set:
        return None
    return current_thread_id


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


def split_nickname_tags(raw: str) -> tuple[str, str, str]:
    text = (raw or "").strip()
    if not text:
        return "", "", ""
    tags: list[str] = []
    rest = text
    while True:
        match = re.match(r"^(\[[^\]]+\])\s*", rest)
        if not match:
            break
        tags.append(match.group(1))
        rest = rest[match.end() :].strip()
    clean = rest or text
    return text, clean, " ".join(tags)


def format_vk_forum_link(vk_id: int, label: str) -> str:
    url = f"https://vk.ru/id{vk_id}"
    text = escape_bbcode_text(label.strip()) if label.strip() else f"id{vk_id}"
    return f"[url={url}]{text}[/url]"


async def _build_judge_line_context(user: User, server_id: int) -> dict[str, str]:
    access = await UserServerAccess.get_or_none(user_id=user.vk_id, server_id=server_id)
    raw_nick = ""
    if access and (access.nickname or "").strip():
        raw_nick = access.nickname.strip()
    elif user.username and user.username.strip():
        raw_nick = user.username.strip()
    else:
        raw_nick = f"id{user.vk_id}"

    full_nick, clean_nick, tag_str = split_nickname_tags(raw_nick)
    position = await resolve_judge_position_for_forum(user.vk_id, server_id, user)
    since = _judge_since(user)
    position_esc = escape_bbcode_text(position) if position else ""
    note_suffix = f" — {position_esc}" if position_esc else ""

    return {
        "{{nickname}}": escape_bbcode_text(full_nick),
        "{{clean_nickname}}": escape_bbcode_text(clean_nick),
        "{{tag}}": escape_bbcode_text(tag_str),
        "{{position}}": position_esc,
        "{{note}}": position_esc,
        "{{since}}": since,
        "{{note_suffix}}": note_suffix,
        "{{vk}}": format_vk_forum_link(user.vk_id, clean_nick or full_nick),
        "{{vk_url}}": f"https://vk.ru/id{user.vk_id}",
    }


def _apply_line_template(template: str, values: dict[str, str], *, index: int) -> str:
    result = template.replace("{{index}}", str(index))
    for key, value in values.items():
        result = result.replace(key, value)
    return result


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
    clean_line = strip_list_bbcode(line_template)
    for index, access in enumerate(rows, start=1):
        user = access.user
        ctx = await _build_judge_line_context(user, server_id)
        lines.append(_apply_line_template(clean_line, ctx, index=index))
    return "\n".join(lines), len(lines)


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
    body, line, empty = _normalize_templates(body, line, empty)

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
    return strip_list_bbcode(result)


async def get_or_create_settings(server_id: int) -> JudgeForumListSettings:
    settings, _ = await JudgeForumListSettings.get_or_create(
        server_id=server_id,
        defaults={
            "body_template": DEFAULT_BODY_TEMPLATE,
            "line_template": DEFAULT_LINE_TEMPLATE,
            "empty_text": DEFAULT_EMPTY_TEXT,
        },
    )
    body, line, empty = _normalize_templates(
        settings.body_template or DEFAULT_BODY_TEMPLATE,
        settings.line_template or DEFAULT_LINE_TEMPLATE,
        settings.empty_text or DEFAULT_EMPTY_TEXT,
    )
    if (
        body != (settings.body_template or "")
        or line != (settings.line_template or "")
        or empty != (settings.empty_text or "")
    ):
        settings.body_template = body
        settings.line_template = line
        settings.empty_text = empty
        await settings.save(update_fields=["body_template", "line_template", "empty_text"])
    return settings


def serialize_settings(settings: JudgeForumListSettings) -> dict:
    body, line, empty = _normalize_templates(
        settings.body_template or DEFAULT_BODY_TEMPLATE,
        settings.line_template or DEFAULT_LINE_TEMPLATE,
        settings.empty_text or DEFAULT_EMPTY_TEXT,
    )
    return {
        "server_id": settings.server_id,
        "thread_id": settings.thread_id,
        "thread_url": (
            f"https://forum.arizona-rp.com/threads/{settings.thread_id}/"
            if settings.thread_id
            else None
        ),
        "required_forum_id": JUDGE_LIST_FORUM_ID,
        "required_forum_url": JUDGE_LIST_FORUM_URL,
        "enabled": settings.enabled,
        "body_template": body,
        "line_template": line,
        "empty_text": empty,
        "updated_by_vk_id": settings.updated_by_vk_id,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }
