"""Единое назначение: следящие, судьи, конгресс."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Literal

from app.models.bot import User, UserServerAccess
from app.models.panel import StaffNote
from app.services.display_names import invalidate_display_names
from app.services.discord_links import set_discord_link
from app.services.staff import _persist_member_nickname, assign_staff_member

RoleType = Literal["staff", "judge", "congress"]
CongressRole = Literal["speaker", "vice"]

JUDGE_POSITIONS: tuple[str, ...] = (
    "Председатель верховного суда",
    "Судья Верховного суда",
)

CONGRESS_ROLES: dict[CongressRole, str] = {
    "speaker": "Спикер конгресса",
    "vice": "Вице-спикер конгресса",
}


def validate_judge_position(position: str) -> str:
    cleaned = (position or "").strip()
    if cleaned not in JUDGE_POSITIONS:
        allowed = ", ".join(f"«{p}»" for p in JUDGE_POSITIONS)
        raise ValueError(f"Должность должна быть одной из: {allowed}")
    return cleaned


def validate_congress_role(role: str) -> CongressRole:
    cleaned = (role or "").strip().lower()
    if cleaned not in CONGRESS_ROLES:
        raise ValueError("Укажите должность: спикер или вице-спикер конгресса")
    return cleaned  # type: ignore[return-value]


FORUM_MEMBER_URL_HINT = "https://forum.arizona-rp.com/members/655354/"

FORUM_MEMBER_URL_RE = re.compile(
    r"^https?://forum\.arizona-rp\.com/members/(\d+)/?(?:[?#].*)?$",
    re.IGNORECASE,
)


def normalize_forum_account(raw: str) -> str:
    cleaned = (raw or "").strip()
    if not cleaned:
        raise ValueError("Укажите ссылку на профиль форума")
    match = FORUM_MEMBER_URL_RE.match(cleaned)
    if not match:
        raise ValueError(f"Нужна ссылка вида {FORUM_MEMBER_URL_HINT}")
    return match.group(1)


async def _apply_forum_account(vk_id: int, forum_account: str) -> str:
    forum = normalize_forum_account(forum_account)
    if not forum:
        raise ValueError("Укажите аккаунт на форуме")
    await User.get_or_create(vk_id=vk_id, defaults={"username": str(vk_id)})
    await User.filter(vk_id=vk_id).update(username=forum)
    return forum


async def _set_user_judge_note(vk_id: int, note: str) -> None:
    await User.filter(vk_id=vk_id).update(
        note=note.strip(),
        last_used=datetime.now(UTC),
    )


async def _link_discord(vk_id: int, discord_id: str | None, actor_vk_id: int | None) -> None:
    if not discord_id:
        return
    from fastapi import HTTPException

    try:
        await set_discord_link(
            vk_id=vk_id,
            discord_id=discord_id,
            actor_vk_id=actor_vk_id or vk_id,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        raise ValueError(detail) from exc


async def assign_judge(
    server_id: int,
    vk_id: int,
    *,
    forum_account: str,
    nickname: str,
    position: str,
    discord_id: str | None = None,
    granted_by: int | None = None,
) -> dict:
    position_clean = validate_judge_position(position)
    nick = (nickname or "").strip()
    if not nick:
        raise ValueError("Укажите никнейм")
    if len(nick) > 64:
        raise ValueError("Ник слишком длинный (макс. 64)")

    forum = await _apply_forum_account(vk_id, forum_account)
    await _set_user_judge_note(vk_id, position_clean)

    await UserServerAccess.get_or_create(
        user_id=vk_id,
        server_id=server_id,
        defaults={"access_level": 0},
    )
    await UserServerAccess.filter(user_id=vk_id, server_id=server_id).update(
        is_judge=True,
        is_leader=True,
        granted_by=granted_by,
    )

    await StaffNote.get_or_create(vk_id=vk_id, server_id=server_id, defaults={})
    await StaffNote.filter(vk_id=vk_id, server_id=server_id).update(
        leader_position=position_clean,
        updated_by=granted_by,
        updated_at=datetime.now(UTC),
    )

    await _persist_member_nickname(vk_id, server_id, nick)
    invalidate_display_names(vk_id)
    await _link_discord(vk_id, discord_id, granted_by)

    return {
        "role_type": "judge",
        "vk_id": vk_id,
        "nickname": nick,
        "forum_account": forum,
        "position": position_clean,
    }


async def assign_congress(
    server_id: int,
    vk_id: int,
    *,
    forum_account: str,
    nickname: str,
    congress_role: str,
    discord_id: str | None = None,
    granted_by: int | None = None,
) -> dict:
    role = validate_congress_role(congress_role)
    nick = (nickname or "").strip()
    if not nick:
        raise ValueError("Укажите никнейм")
    if len(nick) > 64:
        raise ValueError("Ник слишком длинный (макс. 64)")

    forum = await _apply_forum_account(vk_id, forum_account)

    if role == "speaker":
        await UserServerAccess.filter(server_id=server_id, is_congress_speaker=True).update(
            is_congress_speaker=False,
        )
        field = "is_congress_speaker"
    else:
        await UserServerAccess.filter(server_id=server_id, is_congress_vice=True).update(
            is_congress_vice=False,
        )
        field = "is_congress_vice"

    await UserServerAccess.get_or_create(
        user_id=vk_id,
        server_id=server_id,
        defaults={"access_level": 0},
    )
    await UserServerAccess.filter(user_id=vk_id, server_id=server_id).update(
        **{field: True, "granted_by": granted_by},
    )

    await _persist_member_nickname(vk_id, server_id, nick)
    invalidate_display_names(vk_id)
    await _link_discord(vk_id, discord_id, granted_by)

    return {
        "role_type": "congress",
        "vk_id": vk_id,
        "nickname": nick,
        "forum_account": forum,
        "congress_role": role,
        "position": CONGRESS_ROLES[role],
    }


async def assign_staff_with_profile(
    server_id: int,
    vk_id: int,
    *,
    forum_account: str,
    nickname: str,
    access_level: int,
    spheres: list[str],
    nickname_tag: str | None = None,
    discord_id: str | None = None,
    granted_by: int | None = None,
) -> dict:
    await _apply_forum_account(vk_id, forum_account)
    row = await assign_staff_member(
        server_id,
        vk_id,
        nickname=nickname.strip(),
        access_level=access_level,
        spheres=spheres,
        granted_by=granted_by,
        nickname_tag=nickname_tag,
    )
    await _link_discord(vk_id, discord_id, granted_by)
    return {
        "role_type": "staff",
        "vk_id": vk_id,
        "nickname": row.get("bot_nickname") or row.get("nickname") or nickname.strip(),
        "forum_account": normalize_forum_account(forum_account),
        "access_level": access_level,
    }
