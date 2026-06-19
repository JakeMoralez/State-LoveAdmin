"""Staff list — mirrors bot list_staff / staff_display."""

from __future__ import annotations

from tortoise.expressions import Q

from app.models.bot import AccessLevel, RoleChat, User, UserServerAccess
from app.models.panel import StaffNote
from app.services.access import get_access_level

LEADER_ROLE = "leader"


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
    3: "Зам. Главного Следящего Нелегалов",
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


async def list_staff(server_id: int) -> list[dict]:
    by_id: dict[int, tuple[User, int, UserServerAccess | None]] = {}

    rows = await UserServerAccess.filter(server_id=server_id).prefetch_related("user")
    for row in rows:
        if row.access_level >= AccessLevel.PGS or row.has_ca_access:
            by_id[row.user_id] = (row.user, row.access_level, row)

    role_q = (
        Q(is_congress_vice=True)
        | Q(is_attorney=True)
        | Q(is_leader=True)
    )
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
        if access and (access.is_judge or access.is_congress_speaker):
            continue
        eff_level = max(level, await get_access_level(user.vk_id, server_id))
        nickname = (access.nickname if access and access.nickname else None) or user.nickname
        display = nickname or user.username or str(user.vk_id)
        panel_note = notes.get((user.vk_id, server_id), "")
        result.append(
            {
                "vk_id": user.vk_id,
                "nickname": nickname or user.username or str(user.vk_id),
                "display_name": display,
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


async def get_leadership_peer_id(server_id: int) -> int | None:
    from app.config import CA_LEADERSHIP_PEER_ID

    if CA_LEADERSHIP_PEER_ID:
        return CA_LEADERSHIP_PEER_ID
    chat = await RoleChat.get_or_none(server_id=server_id, role=LEADER_ROLE)
    return chat.peer_id if chat else None


async def list_ca_leaders(server_id: int) -> tuple[list[dict], str | None]:
    notes = {
        (n.vk_id, n.server_id): n.note
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

        nickname = (access.nickname or user.nickname or user.username or str(vk_id))
        panel_note = notes.get((vk_id, server_id), "")
        user_note = (user.note or "").strip()
        faction = (panel_note or user_note).strip() or None

        result.append(
            {
                "vk_id": vk_id,
                "nickname": nickname,
                "display_name": nickname,
                "faction": faction,
                "note": panel_note,
                "is_leader_flag": True,
            }
        )

    result.sort(key=lambda r: r["nickname"].lower())
    return result, None


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
    updated_by: int | None = None,
) -> dict:
    user, _ = await User.get_or_create(vk_id=vk_id)
    faction_clean = faction.strip()

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

    if faction_clean:
        user.note = faction_clean
        await user.save()
        note, _ = await StaffNote.get_or_create(
            vk_id=vk_id,
            server_id=server_id,
            defaults={"note": faction_clean},
        )
        note.note = faction_clean
        note.updated_by = updated_by
        await note.save()

    nickname = access.nickname or user.nickname or user.username or str(vk_id)
    panel = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    panel_note_text = (panel.note if panel else "") or faction_clean

    return {
        "vk_id": vk_id,
        "nickname": nickname,
        "display_name": nickname,
        "faction": panel_note_text or (user.note or "").strip() or None,
        "note": panel_note_text,
        "is_leader_flag": True,
    }


async def remove_ca_leader(server_id: int, vk_id: int) -> bool:
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if not access or not access.is_leader:
        return False
    access.is_leader = False
    await access.save()
    return True


async def update_ca_leader_faction(
    server_id: int,
    vk_id: int,
    faction: str,
    *,
    updated_by: int | None = None,
) -> None:
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if not access or not access.is_leader:
        raise ValueError("Пользователь не является лидером")

    faction_clean = faction.strip()
    user = await User.get_or_none(vk_id=vk_id)
    if user:
        user.note = faction_clean
        await user.save()

    note, _ = await StaffNote.get_or_create(
        vk_id=vk_id,
        server_id=server_id,
        defaults={"note": faction_clean},
    )
    note.note = faction_clean
    note.updated_by = updated_by
    await note.save()


async def list_leadership_candidates(server_id: int) -> list[dict]:
    """Все пользователи БД с ником, кроме следящих и is_admin."""
    access_rows = await UserServerAccess.filter(server_id=server_id).prefetch_related("user")
    access_by_vk = {row.user_id: row for row in access_rows}

    notes = {
        (n.vk_id, n.server_id): n.note
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

        nickname = (access.nickname if access and access.nickname else None) or (
            user.nickname or user.username or str(user.vk_id)
        )
        panel_note = notes.get((user.vk_id, server_id), "")
        user_note = (user.note or "").strip()
        faction = (panel_note or user_note).strip() or None

        result.append(
            {
                "vk_id": user.vk_id,
                "nickname": nickname,
                "display_name": nickname,
                "is_leader": bool(access and access.is_leader),
                "faction": faction,
            }
        )

    result.sort(key=lambda r: r["nickname"].lower())
    return result


async def get_staff_member(server_id: int, vk_id: int) -> dict | None:
    for row in await list_staff(server_id):
        if row["vk_id"] == vk_id:
            return row
    return None


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
        nick = nickname.strip()
        if not nick:
            access.nickname = None
        else:
            if len(nick) > 64:
                raise ValueError("Ник слишком длинный (макс. 64)")
            taken = await UserServerAccess.filter(
                server_id=server_id,
                nickname__iexact=nick,
            ).exclude(user_id=vk_id).exists()
            if taken:
                raise ValueError("Этот ник уже занят")
            access.nickname = nick
        await access.save()

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
        raise ValueError("Пользователь не в реестре следящих")
    return row
