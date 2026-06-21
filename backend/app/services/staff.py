"""Staff list — mirrors bot list_staff / staff_display."""

from __future__ import annotations

import logging

from tortoise.expressions import Q

from app.models.bot import AccessLevel, RoleChat, User, UserServerAccess
from app.models.panel import StaffNote
from app.services.access import get_access_level
from app.services.display_names import invalidate_display_names, resolve_bot_nickname

logger = logging.getLogger(__name__)

LEADER_ROLE = "leader"


def _leader_nick_fields(bot_nickname: str | None, vk_id: int) -> dict[str, str | None]:
    """Ник только из /setnick (user_server_access), без legacy users.username."""
    nick = (bot_nickname or "").strip() or None
    return {
        "bot_nickname": nick,
        "nickname": nick or "",
        "display_name": nick or f"id{vk_id}",
    }


def format_badges(access: UserServerAccess | None, user: User) -> list[str]:
    badges: list[str] = []
    if access and access.has_ca_access:
        badges.append("ЦА")
    if access and access.is_judge:
        badges.append("⚖")
    if access and access.is_congress_speaker:
        badges.append("🎙")
    if access and access.is_congress_vice:
        badges.append("🎖")
    if access and access.is_attorney:
        badges.append("📘")
    if access and access.is_leader:
        badges.append("🛡")
    if user.is_admin:
        badges.append("👑")
    return badges


FULL_ROLE_TITLES: dict[int, str] = {
    1: "Помощник Главного Следящего",
    2: "Следящий",
    3: "Зам. Главного Следящего",
    4: "Главный Следящий",
    5: "Зам. Главного Следящего ГОС",
    6: "Главный Следящий ГОС",
    7: "Куратор",
    8: "Зам. Главного Администратора",
    9: "Главный Администратор",
    10: "Разработчик",
}


def role_title(level: int) -> str:
    return FULL_ROLE_TITLES.get(level, AccessLevel.title(level))


def derive_sphere(
    level: int,
    access: UserServerAccess | None,
    user: User,
    staff_note: str,
) -> str:
    custom = (staff_note or "").strip() or (user.note or "").strip()
    if custom:
        return custom

    parts: list[str] = []
    if access:
        if access.is_congress_vice:
            parts.append("Центральное Управление")
        if access.is_congress_speaker:
            parts.append("Средства Массовой Информации")
        if access.is_judge:
            parts.append("Министерство Юстиции")
        if access.is_attorney:
            parts.append("Прокуратура")
        if access.is_leader and not parts:
            parts.append("Лидер фракции")

    if parts:
        return ", ".join(parts)

    if level >= AccessLevel.CURATOR:
        return "Сервер"
    if level >= AccessLevel.ZGS_GOS:
        return "Государственные организации"
    if level >= AccessLevel.ZGS:
        return "Нелегальные организации"
    if access and access.has_ca_access:
        return "ЦА"
    return "—"


def ca_source(access: UserServerAccess | None) -> str | None:
    if not access or not access.has_ca_access:
        return None
    if access.ca_auto_peer_id:
        return "sled_ca"
    return "manual"


async def reconcile_supervisor_leader_flags(server_id: int) -> int:
    """Снять is_leader у следящих (ПГС+): лидерский флаг только для реестра руководства без уровня."""
    rows = await UserServerAccess.filter(server_id=server_id, is_leader=True)
    cleared = 0
    for access in rows:
        if access.access_level >= AccessLevel.PGS:
            access.is_leader = False
            await access.save(update_fields=["is_leader"])
            cleared += 1
            logger.info(
                "reconcile: cleared is_leader for vk_id=%s (access_level=%s)",
                access.user_id,
                access.access_level,
            )
    return cleared


async def list_staff(server_id: int) -> list[dict]:
    await reconcile_supervisor_leader_flags(server_id)
    by_id: dict[int, tuple[User, int, UserServerAccess | None]] = {}

    rows = await UserServerAccess.filter(server_id=server_id).prefetch_related("user")
    for row in rows:
        if row.access_level >= AccessLevel.PGS or row.has_ca_access:
            by_id[row.user_id] = (row.user, row.access_level, row)

    role_q = Q(is_congress_vice=True) | Q(is_attorney=True)
    for row in await UserServerAccess.filter(server_id=server_id).filter(role_q).prefetch_related(
        "user"
    ):
        if row.user_id not in by_id:
            by_id[row.user_id] = (row.user, row.access_level, row)

    for user in await User.filter(is_admin=True):
        if user.vk_id in by_id:
            continue
        acc = await UserServerAccess.get_or_none(user_id=user.vk_id, server_id=server_id)
        level = acc.access_level if acc else 0
        by_id[user.vk_id] = (user, level, acc)

    notes = {
        (n.vk_id, n.server_id): n.note
        for n in await StaffNote.filter(server_id=server_id)
    }

    result: list[dict] = []
    for user, level, access in by_id.values():
        if access and (access.is_judge or access.is_congress_speaker or access.is_leader):
            logger.debug(
                "list_staff: skip vk_id=%s (role flag judge=%s speaker=%s leader=%s)",
                user.vk_id,
                access.is_judge,
                access.is_congress_speaker,
                access.is_leader,
            )
            continue
        if access is None:
            logger.warning("list_staff: vk_id=%s has no user_server_access row for server_id=%s", user.vk_id, server_id)
        eff_level = max(level, await get_access_level(user.vk_id, server_id))
        bot_nickname = await resolve_bot_nickname(
            user.vk_id, server_id, access=access, user=user
        )
        nick_fields = _leader_nick_fields(bot_nickname, user.vk_id)
        panel_note = notes.get((user.vk_id, server_id), "")
        result.append(
            {
                "vk_id": user.vk_id,
                "bot_nickname": nick_fields["bot_nickname"],
                "nickname": nick_fields["nickname"],
                "display_name": nick_fields["display_name"],
                "username": user.username,
                "access_level": eff_level,
                "access_level_name": AccessLevel.title(eff_level),
                "access_role_title": role_title(eff_level),
                "sphere": derive_sphere(eff_level, access, user, panel_note),
                "badges": format_badges(access, user),
                "has_ca_access": bool(access and access.has_ca_access),
                "ca_source": ca_source(access),
                "granted_by": access.granted_by if access else None,
                "granted_at": access.granted_at.isoformat() if access and access.granted_at else None,
                "note": panel_note,
            }
        )

    result.sort(key=lambda r: (-r["access_level"], r["nickname"].lower()))
    return result


def is_supervisor(level: int, access: UserServerAccess | None) -> bool:
    if level >= AccessLevel.PGS:
        return True
    return bool(access and access.has_ca_access)


def leader_registry_fields(
    staff_note: StaffNote | None,
    user_note: str,
) -> tuple[str | None, str | None]:
    """Должность и заметка в реестре руководства (с обратной совместимостью)."""
    position: str | None = None
    note: str | None = None
    legacy_note = (user_note or "").strip()

    if staff_note:
        position = (staff_note.leader_position or "").strip() or None
        note = (staff_note.leader_note or "").strip() or None
        if not position:
            legacy_panel = (staff_note.note or "").strip()
            if legacy_panel:
                position = legacy_panel

    if not position and legacy_note:
        position = legacy_note

    return position, note


async def get_leadership_peer_id(server_id: int) -> int | None:
    from app.config import CA_LEADERSHIP_PEER_ID

    if CA_LEADERSHIP_PEER_ID:
        return CA_LEADERSHIP_PEER_ID
    chat = await RoleChat.get_or_none(server_id=server_id, role=LEADER_ROLE)
    return chat.peer_id if chat else None


async def list_ca_leaders(server_id: int) -> tuple[list[dict], str | None]:
    notes = {
        (n.vk_id, n.server_id): n
        for n in await StaffNote.filter(server_id=server_id)
    }

    rows = await UserServerAccess.filter(
        server_id=server_id,
        is_leader=True,
    ).prefetch_related("user")

    result: list[dict] = []
    for access in rows:
        user = access.user
        vk_id = user.vk_id
        level = await get_access_level(vk_id, server_id)
        if is_supervisor(level, access):
            continue

        bot_nickname = await resolve_bot_nickname(vk_id, server_id, access=access, user=user)
        nick_fields = _leader_nick_fields(bot_nickname, vk_id)
        panel = notes.get((vk_id, server_id))
        user_note = (user.note or "").strip()
        position, note = leader_registry_fields(panel, user_note)

        result.append(
            {
                "vk_id": vk_id,
                "bot_nickname": nick_fields["bot_nickname"],
                "nickname": nick_fields["nickname"],
                "display_name": nick_fields["display_name"],
                "username": user.username,
                "position": position,
                "note": note,
                "faction": position,
                "is_leader_flag": True,
            }
        )

    result.sort(key=lambda r: (r["display_name"] or str(r["vk_id"])).lower())
    return result, None


async def get_ca_leader(server_id: int, vk_id: int) -> dict | None:
    access = await UserServerAccess.get_or_none(
        user_id=vk_id,
        server_id=server_id,
    ).prefetch_related("user")
    if not access or not access.is_leader:
        return None

    user = access.user
    level = await get_access_level(vk_id, server_id)
    if is_supervisor(level, access):
        return None

    panel = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    user_note = (user.note or "").strip()
    position, note = leader_registry_fields(panel, user_note)
    bot_nickname = await resolve_bot_nickname(vk_id, server_id, access=access, user=user)
    nick_fields = _leader_nick_fields(bot_nickname, vk_id)

    return {
        "vk_id": vk_id,
        "bot_nickname": nick_fields["bot_nickname"],
        "nickname": nick_fields["nickname"],
        "display_name": nick_fields["display_name"],
        "username": user.username,
        "position": position,
        "note": note,
        "faction": position,
        "is_leader_flag": True,
        "badges": format_badges(access, user),
    }


def parse_vk_id(raw: str) -> int | None:
    text = (raw or "").strip()
    if not text:
        return None
    if text.isdigit():
        return int(text)
    import re

    m = re.search(r"(?:vk\.com/|id)(\d+)", text, re.I)
    if m:
        return int(m.group(1))
    return None


async def set_ca_leader(
    server_id: int,
    vk_id: int,
    *,
    faction: str = "",
    position: str | None = None,
    updated_by: int | None = None,
) -> dict:
    user, _ = await User.get_or_create(vk_id=vk_id)
    position_clean = (position if position is not None else faction).strip()

    access, _ = await UserServerAccess.get_or_create(
        user_id=vk_id,
        server_id=server_id,
        defaults={"access_level": 0},
    )

    level = await get_access_level(vk_id, server_id)
    if is_supervisor(level, access):
        raise ValueError("Пользователь уже в реестре следящих — лидером не назначается")

    access.is_leader = True
    await access.save()

    if position_clean:
        note_row, _ = await StaffNote.get_or_create(
            vk_id=vk_id,
            server_id=server_id,
            defaults={"leader_position": position_clean},
        )
        note_row.leader_position = position_clean
        note_row.updated_by = updated_by
        await note_row.save()

    bot_nickname = await resolve_bot_nickname(vk_id, server_id, access=access, user=user)
    nick_fields = _leader_nick_fields(bot_nickname, vk_id)
    panel = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    user_note = (user.note or "").strip()
    leader_position, leader_note = leader_registry_fields(panel, user_note)

    return {
        "vk_id": vk_id,
        "nickname": nick_fields["nickname"],
        "display_name": nick_fields["display_name"],
        "position": leader_position,
        "note": leader_note,
        "faction": leader_position,
        "is_leader_flag": True,
    }


async def remove_ca_leader(server_id: int, vk_id: int) -> bool:
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if not access or not access.is_leader:
        return False
    access.is_leader = False
    await access.save()
    return True


async def _persist_member_nickname(
    vk_id: int,
    server_id: int,
    nickname: str | None,
) -> None:
    """Записать ник на server_id — как /setnick в боте (только одна строка user_server_access)."""
    user = await User.get_or_none(vk_id=vk_id)
    if not user:
        raise ValueError("Пользователь не найден")

    nick = nickname.strip() if nickname else ""
    value = nick or None

    if nick:
        if len(nick) > 64:
            raise ValueError("Ник слишком длинный (макс. 64)")
        taken = await UserServerAccess.filter(
            server_id=server_id,
            nickname__iexact=nick,
        ).exclude(user_id=vk_id).exists()
        if taken:
            raise ValueError("Этот ник уже занят")

    access, _ = await UserServerAccess.get_or_create(
        user_id=vk_id,
        server_id=server_id,
        defaults={"access_level": 0},
    )
    access.nickname = value
    await access.save()

    # Сбрасываем legacy-поле, чтобы старые данные не подмешивались в UI.
    if user.nickname is not None:
        user.nickname = None
        await user.save()

    invalidate_display_names(vk_id)


async def clear_member_nickname(server_id: int, vk_id: int) -> None:
    await _persist_member_nickname(vk_id, server_id, "")


async def clear_ca_leader_nickname(server_id: int, vk_id: int) -> None:
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if not access or not access.is_leader:
        raise ValueError("Пользователь не в реестре руководства")
    await clear_member_nickname(server_id, vk_id)


async def revoke_ca_leader_full(
    server_id: int,
    vk_id: int,
    *,
    updated_by: int | None = None,
) -> None:
    if not await remove_ca_leader(server_id, vk_id):
        raise ValueError("Пользователь не в реестре руководства")

    note_row = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    if note_row:
        note_row.leader_position = ""
        note_row.leader_note = ""
        note_row.updated_by = updated_by
        await note_row.save()


async def update_ca_leader_faction(
    server_id: int,
    vk_id: int,
    faction: str,
    *,
    updated_by: int | None = None,
) -> None:
    await update_ca_leader_meta(
        server_id,
        vk_id,
        position=faction,
        updated_by=updated_by,
    )


async def update_ca_leader_meta(
    server_id: int,
    vk_id: int,
    *,
    position: str | None = None,
    note: str | None = None,
    updated_by: int | None = None,
) -> None:
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if not access or not access.is_leader:
        raise ValueError("Пользователь не является лидером")

    note_row, _ = await StaffNote.get_or_create(
        vk_id=vk_id,
        server_id=server_id,
        defaults={},
    )
    if position is not None:
        note_row.leader_position = position.strip()
    if note is not None:
        note_row.leader_note = note.strip()
    note_row.updated_by = updated_by
    await note_row.save()


async def list_leadership_candidates(server_id: int) -> list[dict]:
    """Все пользователи БД с ником, кроме следящих и is_admin."""
    access_rows = await UserServerAccess.filter(server_id=server_id).prefetch_related("user")
    access_by_vk = {row.user_id: row for row in access_rows}

    notes = {
        (n.vk_id, n.server_id): n
        for n in await StaffNote.filter(server_id=server_id)
    }

    result: list[dict] = []
    for user in await User.all():
        if user.is_admin:
            continue
        access = access_by_vk.get(user.vk_id)
        level = await get_access_level(user.vk_id, server_id)
        if is_supervisor(level, access):
            continue

        bot_nickname = await resolve_bot_nickname(user.vk_id, server_id, access=access, user=user)
        nick_fields = _leader_nick_fields(bot_nickname, user.vk_id)
        panel = notes.get((user.vk_id, server_id))
        user_note = (user.note or "").strip()
        position, note = leader_registry_fields(panel, user_note)

        result.append(
            {
                "vk_id": user.vk_id,
                "bot_nickname": nick_fields["bot_nickname"],
                "nickname": nick_fields["nickname"],
                "display_name": nick_fields["display_name"],
                "is_leader": bool(access and access.is_leader),
                "position": position,
                "note": note,
                "faction": position,
            }
        )

    result.sort(key=lambda r: (r["display_name"] or str(r["vk_id"])).lower())
    return result


async def get_staff_member(server_id: int, vk_id: int) -> dict | None:
    for row in await list_staff(server_id):
        if row["vk_id"] == vk_id:
            return row
    return None


async def revoke_staff_access(
    server_id: int,
    vk_id: int,
    *,
    updated_by: int | None = None,
) -> None:
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if not access:
        raise ValueError("Пользователь не в реестре следящих")

    if access.is_leader:
        raise ValueError("Сначала уберите из реестра «Руководство»")

    level = await get_access_level(vk_id, server_id)
    if level >= AccessLevel.ZGS_GOS:
        raise ValueError("Нельзя снять доступ ЗГС ГОС+ через реестр следящих")

    access.access_level = 0
    access.has_ca_access = False
    access.ca_auto_peer_id = None
    access.granted_by = None
    await access.save()
    invalidate_display_names(vk_id)


async def update_staff_member(
    server_id: int,
    vk_id: int,
    *,
    nickname: str | None = None,
    access_level: int | None = None,
    has_ca_access: bool | None = None,
    note: str | None = None,
    granted_by: int | None = None,
) -> dict:
    from app.models.bot import User, UserServerAccess
    from app.models.panel import StaffNote

    user = await User.get_or_none(vk_id=vk_id)
    if not user:
        raise ValueError("Пользователь не найден")

    access, _ = await UserServerAccess.get_or_create(
        user_id=vk_id,
        server_id=server_id,
        defaults={"access_level": 0},
    )

    if nickname is not None:
        await _persist_member_nickname(vk_id, server_id, nickname)

    if access_level is not None:
        access.access_level = access_level
        access.granted_by = granted_by
        await access.save()

    if has_ca_access is not None:
        access.has_ca_access = has_ca_access
        await access.save()

    if note is not None:
        panel_note, _ = await StaffNote.get_or_create(
            vk_id=vk_id,
            server_id=server_id,
            defaults={"note": note.strip()},
        )
        panel_note.note = note.strip()
        panel_note.updated_by = granted_by
        await panel_note.save()

    row = await get_staff_member(server_id, vk_id)
    if not row:
        row = await get_ca_leader(server_id, vk_id)
    if not row:
        raise ValueError("Пользователь не найден")
    return row
