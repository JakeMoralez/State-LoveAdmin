"""Staff list — mirrors bot list_staff / staff_display."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta, timezone

from tortoise.expressions import Q

from app.models.bot import AccessLevel, ChatPeerSettings, RoleChat, User, UserServerAccess
from app.models.panel import StaffNote
from app.config import MAIN_ADMIN_ID
from app.domain.access_levels import ROLE_TITLES as FULL_ROLE_TITLES
from app.domain.access_levels import role_title as _domain_role_title
from app.services.access import get_access_level
from app.services.bot_users import (
    access_senior_state,
    ensure_bot_user,
    ensure_server_access,
    has_usa_promoted_at,
    has_usa_senior_columns,
    update_server_access,
)
from app.services.display_names import invalidate_display_names, resolve_bot_nickname
from app.services.leader_nickname import (
    canonicalize_leadership_nickname,
    infer_leadership_from_nickname,
)
from app.services.leader_spheres import is_central_apparatus_office_tag, resolve_leadership_sphere
from app.services.staff_nickname import (
    extract_leading_nickname_tag,
    format_staff_nickname,
    normalize_custom_tag,
    rewrite_legacy_nickname_tags,
    strip_nickname_tags,
)
from app.services.staff_spheres import (
    CENTRAL_APPARATUS,
    DEFENSE,
    format_spheres_display,
    merge_spheres_for_display,
    migrate_legacy_sphere,
    sync_ca_access_from_spheres,
    validate_spheres,
)

logger = logging.getLogger(__name__)

MSK = timezone(timedelta(hours=3))


def parse_appointment_date(raw: str | None) -> datetime:
    cleaned = (raw or "").strip()
    if not cleaned:
        raise ValueError("Укажите дату назначения")
    try:
        parsed = date.fromisoformat(cleaned[:10])
    except ValueError as exc:
        raise ValueError("Некорректная дата назначения (YYYY-MM-DD)") from exc
    return datetime.combine(parsed, time.min, tzinfo=MSK)

LEADER_ROLE = "leader"
JUDGE_ROLE = "judge"
LEADER_CHAT_KIND = "leader"
JUDGE_CHAT_KIND = "judge"


def _leader_nick_fields(bot_nickname: str | None, vk_id: int) -> dict[str, str | None]:
    """Ник только из /setnick (user_server_access), без legacy users.username."""
    nick = (bot_nickname or "").strip() or None
    return {
        "bot_nickname": nick,
        "nickname": nick or "",
        "display_name": nick or f"id{vk_id}",
    }


def format_badges(access: UserServerAccess | None, user: User, spheres: list[str] | None = None) -> list[str]:
    badges: list[str] = []
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


def _access_dt_iso(access: UserServerAccess | None, field: str) -> str | None:
    if not access:
        return None
    value = getattr(access, field, None)
    if not value:
        return None
    try:
        return value.isoformat()
    except Exception:
        return None


def role_title(level: int) -> str:
    return _domain_role_title(level)


def derive_sphere_from_spheres(spheres: list[str]) -> str:
    return format_spheres_display(spheres)


async def _resolve_staff_spheres(
    vk_id: int,
    server_id: int,
    level: int,
    access: UserServerAccess | None,
    user: User,
    panel: StaffNote | None,
) -> list[str]:
    if panel and panel.spheres:
        stored = list(panel.spheres)
    elif panel and (panel.note or "").strip():
        stored = migrate_legacy_sphere(level, access, user, panel.note)
    else:
        stored = migrate_legacy_sphere(level, access, user, "")

    result = merge_spheres_for_display(stored, access)
    if result:
        if panel is None:
            panel, _ = await StaffNote.get_or_create(vk_id=vk_id, server_id=server_id, defaults={})
        if not panel.spheres:
            try:
                panel.spheres = validate_spheres(result, access_level=level)
                await panel.save(update_fields=["spheres", "updated_at"])
                if access:
                    await sync_ca_access_from_spheres(access, panel.spheres)
            except ValueError:
                pass
    return result


async def _persist_staff_spheres(
    vk_id: int,
    server_id: int,
    spheres: list[str],
    *,
    granted_by: int | None = None,
) -> list[str]:
    access, _ = await ensure_server_access(vk_id, server_id, granted_by=granted_by)
    normalized = validate_spheres(spheres, access.access_level)
    panel, _ = await StaffNote.get_or_create(vk_id=vk_id, server_id=server_id, defaults={})
    panel.spheres = normalized
    panel.updated_by = granted_by
    await panel.save(update_fields=["spheres", "updated_by", "updated_at"])

    await sync_ca_access_from_spheres(access, normalized)
    return normalized


async def migrate_staff_spheres_to_panel(server_id: int) -> int:
    """Один раз заполнить staff_notes.spheres для следящих без сфер."""
    migrated = 0
    for row in await list_staff(server_id):
        vk_id = row["vk_id"]
        panel, _ = await StaffNote.get_or_create(vk_id=vk_id, server_id=server_id, defaults={})
        if panel.spheres:
            continue
        user = await User.get(vk_id=vk_id)
        access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
        level = await get_access_level(vk_id, server_id)
        old_note = panel.note or row.get("note") or ""
        spheres = migrate_legacy_sphere(level, access, user, old_note)
        panel.spheres = validate_spheres(spheres)
        await panel.save(update_fields=["spheres"])
        if access:
            await sync_ca_access_from_spheres(access, panel.spheres)
        migrated += 1
        logger.info("migrate_staff_spheres: vk_id=%s -> %s", vk_id, panel.spheres)
    return migrated


def ca_source(access: UserServerAccess | None) -> str | None:
    if not access or not access.has_ca_access:
        return None
    if access.ca_auto_peer_id:
        return "sled_ca"
    return "manual"


async def reconcile_supervisor_leader_flags(server_id: int) -> int:
    """Снять is_leader у следящих (ПС+): лидерский флаг только для реестра руководства без уровня."""
    cleared = await UserServerAccess.filter(
        server_id=server_id,
        is_leader=True,
        access_level__gte=AccessLevel.PGS,
    ).update(is_leader=False)
    if cleared:
        logger.info("reconcile: cleared is_leader for %s staff on server %s", cleared, server_id)
    return cleared


async def _developer_vk_ids() -> set[int]:
    """Users with DEVELOPER on any server (matches get_access_level global bump)."""
    ids = set(
        await UserServerAccess.filter(
            access_level__gte=AccessLevel.DEVELOPER
        ).values_list("user_id", flat=True)
    )
    if MAIN_ADMIN_ID:
        ids.add(MAIN_ADMIN_ID)
    return ids


def _effective_access_level(
    vk_id: int,
    server_level: int,
    developer_ids: set[int],
) -> int:
    if vk_id in developer_ids:
        return AccessLevel.DEVELOPER
    return server_level


def _staff_row_dict(
    *,
    user: User,
    access: UserServerAccess | None,
    eff_level: int,
    bot_nickname: str | None,
    spheres: list[str],
    panel_note: str,
    academy_fields: dict,
) -> dict:
    nick_fields = _leader_nick_fields(bot_nickname, user.vk_id)
    return {
        "vk_id": user.vk_id,
        "bot_nickname": nick_fields["bot_nickname"],
        "nickname": nick_fields["nickname"],
        "display_name": nick_fields["display_name"],
        "username": user.username,
        "access_level": eff_level,
        "access_level_name": AccessLevel.title(eff_level),
        "access_role_title": (
            "Старший следящий"
            if access and getattr(access, "is_senior", False) and eff_level == AccessLevel.SUPERVISOR
            else role_title(eff_level)
        ),
        "sphere": derive_sphere_from_spheres(spheres),
        "spheres": spheres,
        "badges": format_badges(access, user, spheres),
        "has_ca_access": bool(access and access.has_ca_access),
        "ca_source": ca_source(access),
        "granted_by": access.granted_by if access else None,
        "granted_at": _access_dt_iso(access, "granted_at"),
        "promoted_at": _access_dt_iso(access, "promoted_at"),
        "note": panel_note,
        "is_senior": bool(access and getattr(access, "is_senior", False)),
        "senior_spheres": list(getattr(access, "senior_spheres", []) or []),
        **academy_fields,
    }


async def list_staff(server_id: int) -> list[dict]:
    await reconcile_supervisor_leader_flags(server_id)
    by_id: dict[int, tuple[User, int, UserServerAccess | None]] = {}

    rows = await UserServerAccess.filter(server_id=server_id).prefetch_related("user")
    for row in rows:
        if row.access_level >= AccessLevel.PGS:
            by_id[row.user_id] = (row.user, row.access_level, row)
        elif row.is_congress_vice or row.is_attorney:
            by_id[row.user_id] = (row.user, row.access_level, row)

    for user in await User.filter(is_admin=True):
        if user.vk_id in by_id:
            continue
        acc = await UserServerAccess.get_or_none(user_id=user.vk_id, server_id=server_id)
        level = acc.access_level if acc else 0
        by_id[user.vk_id] = (user, level, acc)

    notes = {
        (n.vk_id, n.server_id): n
        for n in await StaffNote.filter(server_id=server_id)
    }
    from app.services.academy import cadets_by_vk, staff_academy_fields

    academy_map = await cadets_by_vk(server_id)
    developer_ids = await _developer_vk_ids()

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
            logger.warning(
                "list_staff: vk_id=%s has no user_server_access row for server_id=%s",
                user.vk_id,
                server_id,
            )
        eff_level = _effective_access_level(user.vk_id, level, developer_ids)
        if eff_level < AccessLevel.PGS:
            continue
        bot_nickname = await resolve_bot_nickname(
            user.vk_id, server_id, access=access, user=user
        )
        panel = notes.get((user.vk_id, server_id))
        panel_note = (panel.note if panel else "") or ""
        spheres = await _resolve_staff_spheres(
            user.vk_id, server_id, eff_level, access, user, panel
        )
        result.append(
            _staff_row_dict(
                user=user,
                access=access,
                eff_level=eff_level,
                bot_nickname=bot_nickname,
                spheres=spheres,
                panel_note=panel_note,
                academy_fields=staff_academy_fields(academy_map.get(user.vk_id)),
            )
        )

    result.sort(
        key=lambda r: (
            -r["access_level"],
            -(
                1
                if r["access_level"] == AccessLevel.SUPERVISOR and r.get("is_senior")
                else 0
            ),
            r["nickname"].lower(),
        )
    )
    return result


async def count_staff(server_id: int) -> int:
    """Дешёвый COUNT для health/startup (без сборки DTO)."""
    developer_ids = await _developer_vk_ids()
    rows = await UserServerAccess.filter(server_id=server_id).prefetch_related("user")
    n = 0
    for row in rows:
        if row.is_judge or row.is_congress_speaker or row.is_leader:
            continue
        if row.access_level < AccessLevel.PGS and not (
            row.is_congress_vice or row.is_attorney
        ):
            continue
        eff = _effective_access_level(row.user_id, row.access_level, developer_ids)
        if eff >= AccessLevel.PGS:
            n += 1
    for user in await User.filter(is_admin=True):
        if any(r.user_id == user.vk_id for r in rows):
            continue
        acc = await UserServerAccess.get_or_none(user_id=user.vk_id, server_id=server_id)
        level = acc.access_level if acc else 0
        if acc and (acc.is_judge or acc.is_congress_speaker or acc.is_leader):
            continue
        eff = _effective_access_level(user.vk_id, level, developer_ids)
        if eff >= AccessLevel.PGS:
            n += 1
    return n


async def list_former_staff(server_id: int) -> list[dict]:
    """Бывшие следящие: уровень ниже ПС, ник сохранён. Discord отфильтровывает роутер."""
    rows = await UserServerAccess.filter(
        server_id=server_id,
        access_level__lt=AccessLevel.PGS,
    ).prefetch_related("user")
    result: list[dict] = []
    for access in rows:
        if (
            access.is_judge
            or access.is_congress_speaker
            or access.is_congress_vice
            or access.is_attorney
            or access.is_leader
        ):
            continue
        user = access.user
        if user.is_admin:
            continue
        effective = await get_access_level(user.vk_id, server_id)
        if effective >= AccessLevel.PGS:
            continue
        bot_nickname = await resolve_bot_nickname(
            user.vk_id, server_id, access=access, user=user
        )
        nick_fields = _leader_nick_fields(bot_nickname, user.vk_id)
        if not (nick_fields["nickname"] or "").strip():
            continue
        result.append(
            {
                "vk_id": user.vk_id,
                "bot_nickname": nick_fields["bot_nickname"],
                "nickname": nick_fields["nickname"],
                "display_name": nick_fields["display_name"],
                "username": user.username,
                "access_level": 0,
                "access_level_name": "Нет доступа",
                "access_role_title": "Без доступа",
                "sphere": "",
                "spheres": [],
                "badges": [],
                "has_ca_access": False,
                "ca_source": None,
                "granted_by": None,
                "granted_at": _access_dt_iso(access, "granted_at"),
                "promoted_at": _access_dt_iso(access, "promoted_at"),
                "note": "",
                "is_senior": False,
                "senior_spheres": [],
            }
        )
    result.sort(key=lambda r: (r["nickname"] or "").lower())
    return result


def is_supervisor(level: int, access: UserServerAccess | None) -> bool:
    if level >= AccessLevel.PGS:
        return True
    return bool(access and access.has_ca_access)


def _in_leadership_registry(access: UserServerAccess | None) -> bool:
    return bool(access and (access.is_leader or access.is_judge))


def normalize_leader_position(position: str | None) -> str | None:
    """Старое «Зам» → «Заместитель»; пустое остаётся пустым."""
    cleaned = (position or "").strip()
    if not cleaned:
        return None
    if cleaned in {"Зам", "Зам."}:
        return "Заместитель"
    return cleaned


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

    return normalize_leader_position(position), note


async def require_office_member(server_id: int, vk_id: int) -> UserServerAccess:
    """В списке руководства (беседа / флаг / должность) — карточку можно править."""
    row = await get_ca_leader(server_id, vk_id)
    if not row:
        raise ValueError("Пользователь не в реестре руководства")
    access, _ = await ensure_server_access(vk_id, server_id)
    return access


async def get_leadership_peer_id(server_id: int) -> int | None:
    peers = await list_role_kind_peers(server_id, LEADER_ROLE, LEADER_CHAT_KIND)
    from app.config import CA_LEADERSHIP_PEER_ID

    if CA_LEADERSHIP_PEER_ID:
        return CA_LEADERSHIP_PEER_ID
    return peers[0] if peers else None


async def list_role_kind_peers(server_id: int, role: str, kind: str) -> list[int]:
    peers: set[int] = set()
    for row in await RoleChat.filter(server_id=server_id, role=role):
        peers.add(int(row.peer_id))
    try:
        for row in await ChatPeerSettings.filter(chat_kind=kind):
            if row.server_id is None or int(row.server_id) == int(server_id):
                peers.add(int(row.peer_id))
    except Exception:
        logger.debug("chat_peer_settings.chat_kind ещё недоступен")
    return sorted(peers)


async def collect_peer_members(peer_ids: list[int]) -> tuple[set[int], str | None]:
    from app.services.sled_client import fetch_chat_members

    members: set[int] = set()
    warnings: list[str] = []
    failed = False
    for peer_id in peer_ids:
        ids, err = await fetch_chat_members(peer_id)
        if err:
            warnings.append(err)
            failed = True
            continue
        members.update(ids)
    if failed and not members:
        return members, warnings[0]
    warning = warnings[0] if warnings else None
    return members, warning


async def collect_office_members(server_id: int) -> tuple[set[int], str | None, bool]:
    """Участники бесед руководства и судей — один реестр «Руководители»."""
    leader_peers = await list_role_kind_peers(server_id, LEADER_ROLE, LEADER_CHAT_KIND)
    judge_peers = await list_role_kind_peers(server_id, JUDGE_ROLE, JUDGE_CHAT_KIND)
    peers = sorted(set(leader_peers) | set(judge_peers))
    member_ids, warning = await collect_peer_members(peers)
    for access in await UserServerAccess.filter(server_id=server_id).filter(
        Q(is_congress_speaker=True) | Q(is_congress_vice=True)
    ):
        member_ids.add(int(access.user_id))
    return member_ids, warning, bool(peers) and warning is None


async def sync_leaders_to_chats(
    server_id: int,
    *,
    member_ids: set[int],
    fetch_ok: bool,
) -> None:
    """Реестр = беседы. Лишний is_leader / должность вне чатов снимается."""
    if not fetch_ok:
        return

    extras = [
        int(row.user_id)
        for row in await UserServerAccess.filter(server_id=server_id, is_leader=True)
        if int(row.user_id) not in member_ids
    ]
    if extras:
        await UserServerAccess.filter(
            server_id=server_id, user_id__in=extras
        ).update(is_leader=False)

    for note in await StaffNote.filter(server_id=server_id):
        if int(note.vk_id) in member_ids:
            continue
        if not (note.leader_position or "").strip() and not (note.leader_note or "").strip():
            continue
        note.leader_position = ""
        note.leader_note = ""
        await note.save(update_fields=["leader_position", "leader_note", "updated_at"])


_STANDARD_LEADER_POSITIONS = frozenset({"Лидер", "Заместитель", "Министр", "Советник", "Зам", "Зам."})


async def sync_leader_cards_from_nicks(server_id: int, member_ids: set[int]) -> None:
    """Должность в карточке = тег/ранг из /snick. Только кто уже в беседах руководства."""
    if not member_ids:
        return
    ids = list(member_ids)
    access_rows = {
        int(row.user_id): row
        for row in await UserServerAccess.filter(server_id=server_id, user_id__in=ids)
    }
    notes = {
        int(note.vk_id): note
        for note in await StaffNote.filter(server_id=server_id, vk_id__in=ids)
    }
    for vk_id in member_ids:
        access = access_rows.get(vk_id)
        nick = (access.nickname or "").strip() if access else ""
        canon = canonicalize_leadership_nickname(nick)
        if canon and access:
            try:
                await _persist_member_nickname(vk_id, server_id, canon)
                access.nickname = canon
                nick = canon
            except ValueError:
                logger.debug("не удалось нормализовать ник vk_id=%s", vk_id)
        inferred = infer_leadership_from_nickname(nick)
        position = inferred.get("position")
        if not position:
            continue
        note = notes.get(vk_id)
        current = (note.leader_position or "").strip() if note else ""
        if access and access.is_judge and current and current not in _STANDARD_LEADER_POSITIONS:
            continue
        if normalize_leader_position(current) == position:
            continue
        if note is None:
            note = await StaffNote.create(
                vk_id=vk_id,
                server_id=server_id,
                leader_position=position,
            )
            notes[vk_id] = note
            continue
        note.leader_position = position
        await note.save(update_fields=["leader_position", "updated_at"])


def _position_from_nick(
    stored: str | None,
    nickname: str | None,
    *,
    is_judge: bool = False,
) -> str | None:
    inferred = infer_leadership_from_nickname(nickname).get("position")
    if inferred and not (is_judge and stored and stored not in _STANDARD_LEADER_POSITIONS):
        return inferred
    return stored


async def _build_office_row(
    server_id: int,
    vk_id: int,
    *,
    in_chat: bool,
    notes: dict[tuple[int, int], StaffNote],
    sphere_map: dict[str, str] | None = None,
) -> dict | None:
    user = await User.get_or_none(vk_id=vk_id)
    access = await UserServerAccess.get_or_none(
        user_id=vk_id, server_id=server_id
    ).prefetch_related("user")
    if access:
        user = access.user
    if user is None:
        user, _ = await ensure_bot_user(vk_id)
        access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)

    level = await get_access_level(vk_id, server_id)
    if is_supervisor(level, access) and not (access and access.is_judge and not access.is_leader):
        if not (access and access.is_judge):
            return None

    panel = notes.get((vk_id, server_id))
    if panel is None:
        panel = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    user_note = (user.note or "").strip() if user else ""
    position, note = leader_registry_fields(panel, user_note)
    bot_nickname = await resolve_bot_nickname(vk_id, server_id, access=access, user=user)
    nick_fields = _leader_nick_fields(bot_nickname, vk_id)
    nick = nick_fields["bot_nickname"] or nick_fields["nickname"]
    position = _position_from_nick(
        position,
        nick,
        is_judge=bool(access and access.is_judge),
    )
    inferred = infer_leadership_from_nickname(nick)
    org_tag = inferred.get("org_tag")
    is_judge = bool(access and access.is_judge) or (org_tag or "").casefold() == "judge"
    is_congress = bool(
        access and (access.is_congress_speaker or access.is_congress_vice)
    ) or is_central_apparatus_office_tag(extract_leading_nickname_tag(nick))
    sphere = resolve_leadership_sphere(nick, sphere_map)
    if is_judge or is_congress:
        sphere = "central_apparatus"
    return {
        "vk_id": vk_id,
        "bot_nickname": nick_fields["bot_nickname"],
        "nickname": nick_fields["nickname"],
        "display_name": nick_fields["display_name"],
        "username": user.username if user else None,
        "position": position,
        "note": note,
        "faction": position,
        "org_tag": org_tag,
        "sphere": sphere,
        "is_leader_flag": bool(access and access.is_leader),
        "is_judge": is_judge,
        "in_chat": in_chat,
        "badges": format_badges(access, user) if user else [],
    }


async def list_ca_leaders(server_id: int) -> tuple[list[dict], str | None]:
    from app.services.dev_catalog import get_tag_spheres

    sphere_map = await get_tag_spheres()
    member_ids, warning, fetch_ok = await collect_office_members(server_id)
    await sync_leaders_to_chats(
        server_id,
        member_ids=member_ids,
        fetch_ok=fetch_ok,
    )
    await sync_leader_cards_from_nicks(server_id, member_ids)
    notes = {
        (n.vk_id, n.server_id): n
        for n in await StaffNote.filter(server_id=server_id)
    }
    result: list[dict] = []
    for vk_id in member_ids:
        row = await _build_office_row(
            server_id, vk_id, in_chat=True, notes=notes, sphere_map=sphere_map
        )
        if row:
            result.append(row)
    result.sort(key=lambda r: (r["display_name"] or str(r["vk_id"])).lower())
    return result, warning


async def list_inactive_leaders(server_id: int) -> tuple[list[dict], str | None]:
    from app.services.dev_catalog import get_tag_spheres

    sphere_map = await get_tag_spheres()
    member_ids, warning, fetch_ok = await collect_office_members(server_id)
    await sync_leaders_to_chats(
        server_id,
        member_ids=member_ids,
        fetch_ok=fetch_ok,
    )
    notes = {
        (n.vk_id, n.server_id): n
        for n in await StaffNote.filter(server_id=server_id)
    }

    candidates: set[int] = set()
    for access in await UserServerAccess.filter(server_id=server_id).filter(
        Q(is_leader=True) | Q(is_judge=True)
    ):
        candidates.add(int(access.user_id))
    for note in notes.values():
        if (note.leader_position or "").strip():
            candidates.add(int(note.vk_id))

    result: list[dict] = []
    for vk_id in candidates:
        if vk_id in member_ids:
            continue
        row = await _build_office_row(
            server_id, vk_id, in_chat=False, notes=notes, sphere_map=sphere_map
        )
        if row:
            result.append(row)
    result.sort(key=lambda r: (r["display_name"] or str(r["vk_id"])).lower())
    return result, warning


async def list_judges(server_id: int) -> tuple[list[dict], str | None]:
    notes = {
        (n.vk_id, n.server_id): n
        for n in await StaffNote.filter(server_id=server_id)
    }
    peers = await list_role_kind_peers(server_id, JUDGE_ROLE, JUDGE_CHAT_KIND)
    member_ids, warning = await collect_peer_members(peers)
    result: list[dict] = []
    for vk_id in member_ids:
        row = await _build_office_row(server_id, vk_id, in_chat=True, notes=notes)
        if row:
            result.append(row)
    result.sort(key=lambda r: (r["display_name"] or str(r["vk_id"])).lower())
    return result, warning


async def list_inactive_judges(server_id: int) -> tuple[list[dict], str | None]:
    notes = {
        (n.vk_id, n.server_id): n
        for n in await StaffNote.filter(server_id=server_id)
    }
    peers = await list_role_kind_peers(server_id, JUDGE_ROLE, JUDGE_CHAT_KIND)
    member_ids, warning = await collect_peer_members(peers)
    result: list[dict] = []
    for access in await UserServerAccess.filter(
        server_id=server_id, is_judge=True
    ).prefetch_related("user"):
        if int(access.user_id) in member_ids:
            continue
        row = await _build_office_row(
            server_id, int(access.user_id), in_chat=False, notes=notes
        )
        if row:
            result.append(row)
    result.sort(key=lambda r: (r["display_name"] or str(r["vk_id"])).lower())
    return result, warning


async def get_ca_leader(server_id: int, vk_id: int) -> dict | None:
    members, _, _ = await collect_office_members(server_id)
    access = await UserServerAccess.get_or_none(
        user_id=vk_id, server_id=server_id
    ).prefetch_related("user")
    note = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    in_chat = vk_id in members
    flagged = bool(access and access.is_leader) or bool(
        note and (note.leader_position or "").strip()
    )
    if not in_chat and not flagged and not (access and access.is_judge):
        return None
    if in_chat:
        await sync_leader_cards_from_nicks(server_id, {vk_id})
        note = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    notes = {(note.vk_id, note.server_id): note} if note else {}
    from app.services.dev_catalog import get_tag_spheres

    return await _build_office_row(
        server_id,
        vk_id,
        in_chat=in_chat,
        notes=notes,
        sphere_map=await get_tag_spheres(),
    )


async def get_judge_member(server_id: int, vk_id: int) -> dict | None:
    peers = await list_role_kind_peers(server_id, JUDGE_ROLE, JUDGE_CHAT_KIND)
    members, _ = await collect_peer_members(peers)
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    in_chat = vk_id in members
    if not in_chat and not (access and access.is_judge):
        return None
    return await _build_office_row(server_id, vk_id, in_chat=in_chat, notes={})


def parse_vk_id(raw: str) -> int | None:
    from app.services.vk_resolve import parse_vk_id as _parse

    return _parse(raw)


async def resolve_judge_position_for_forum(vk_id: int, server_id: int, user: User) -> str:
    """Должность для {{position}}: users.note, затем staff_notes."""
    bot_note = (user.note or "").strip()
    if bot_note:
        return bot_note
    row = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    if not row:
        return ""
    for value in (row.leader_position, row.note, row.leader_note):
        text = (value or "").strip()
        if text:
            return text
    return ""


async def _sync_judge_position_to_bot(
    vk_id: int,
    server_id: int,
    position: str,
) -> None:
    """Должность из панели → users.note, чтобы бот видел {{position}} без panel.db."""
    cleaned = (position or "").strip()
    if not cleaned:
        return
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if not access or not access.is_judge:
        return
    user = await User.get(vk_id=vk_id)
    user.note = cleaned
    await user.save()


async def set_ca_leader(
    server_id: int,
    vk_id: int,
    *,
    faction: str = "",
    position: str | None = None,
    updated_by: int | None = None,
) -> dict:
    user, _ = await ensure_bot_user(vk_id)
    position_clean = (position if position is not None else faction).strip()

    access, _ = await ensure_server_access(vk_id, server_id, granted_by=updated_by)
    level = await get_access_level(vk_id, server_id)
    if is_supervisor(level, access):
        raise ValueError("Пользователь уже в реестре следящих — лидером не назначается")

    access.is_leader = True
    await update_server_access(vk_id, server_id, is_leader=True)

    if position_clean:
        note_row, _ = await StaffNote.get_or_create(
            vk_id=vk_id,
            server_id=server_id,
            defaults={"leader_position": position_clean},
        )
        note_row.leader_position = position_clean
        note_row.updated_by = updated_by
        await note_row.save()
        await _sync_judge_position_to_bot(vk_id, server_id, position_clean)

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
    if not _in_leadership_registry(access):
        return False
    await UserServerAccess.filter(user_id=vk_id, server_id=server_id).update(
        is_leader=False,
        is_judge=False,
    )
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
    if nick:
        nick = rewrite_legacy_nickname_tags(nick)
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

    await ensure_server_access(vk_id, server_id)
    await UserServerAccess.filter(user_id=vk_id, server_id=server_id).update(nickname=value)
    invalidate_display_names(vk_id)


async def clear_member_nickname(server_id: int, vk_id: int) -> None:
    await _persist_member_nickname(vk_id, server_id, "")


async def clear_ca_leader_nickname(server_id: int, vk_id: int) -> None:
    await require_office_member(server_id, vk_id)
    await clear_member_nickname(server_id, vk_id)


async def update_leader_nickname(server_id: int, vk_id: int, *, nickname: str) -> None:
    await require_office_member(server_id, vk_id)
    nick = (nickname or "").strip()
    if not nick:
        raise ValueError("Укажите никнейм")
    if len(nick) > 64:
        raise ValueError("Ник слишком длинный (макс. 64)")
    canon = canonicalize_leadership_nickname(nick) or nick
    await _persist_member_nickname(vk_id, server_id, canon)
    invalidate_display_names(vk_id)
    inferred = infer_leadership_from_nickname(canon).get("position")
    if inferred:
        note_row, _ = await StaffNote.get_or_create(
            vk_id=vk_id,
            server_id=server_id,
            defaults={"leader_position": inferred},
        )
        if normalize_leader_position(note_row.leader_position) != inferred:
            note_row.leader_position = inferred
            await note_row.save(update_fields=["leader_position", "updated_at"])


async def revoke_ca_leader_full(
    server_id: int,
    vk_id: int,
    *,
    updated_by: int | None = None,
) -> None:
    await require_office_member(server_id, vk_id)
    await remove_ca_leader(server_id, vk_id)

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
    access = await require_office_member(server_id, vk_id)

    note_row, _ = await StaffNote.get_or_create(
        vk_id=vk_id,
        server_id=server_id,
        defaults={},
    )
    if position is not None:
        note_row.leader_position = normalize_leader_position(position.strip()) or ""
    if note is not None:
        note_row.leader_note = note.strip()
    note_row.updated_by = updated_by
    await note_row.save()

    if position is not None and access.is_judge:
        await _sync_judge_position_to_bot(
            vk_id, server_id, normalize_leader_position(position.strip()) or ""
        )


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
    """Один сотрудник без полного list_staff (тот же формат строки)."""
    from app.services.academy import cadets_by_vk, staff_academy_fields

    user = await User.get_or_none(vk_id=vk_id)
    if not user:
        return None
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    in_roster = bool(
        (access and access.access_level >= AccessLevel.PGS)
        or (access and (access.is_congress_vice or access.is_attorney))
        or user.is_admin
    )
    if not in_roster:
        return None
    if access and (access.is_judge or access.is_congress_speaker or access.is_leader):
        return None

    level = access.access_level if access else 0
    developer_ids = await _developer_vk_ids()
    eff_level = _effective_access_level(vk_id, level, developer_ids)
    if eff_level < AccessLevel.PGS:
        return None

    panel = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    bot_nickname = await resolve_bot_nickname(vk_id, server_id, access=access, user=user)
    spheres = await _resolve_staff_spheres(
        vk_id, server_id, eff_level, access, user, panel
    )
    academy_map = await cadets_by_vk(server_id)
    return _staff_row_dict(
        user=user,
        access=access,
        eff_level=eff_level,
        bot_nickname=bot_nickname,
        spheres=spheres,
        panel_note=(panel.note if panel else "") or "",
        academy_fields=staff_academy_fields(academy_map.get(vk_id)),
    )


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

    access.access_level = 0
    access.has_ca_access = False
    access.ca_auto_peer_id = None
    access.granted_by = None
    await update_server_access(
        vk_id,
        server_id,
        access_level=0,
        has_ca_access=False,
        ca_auto_peer_id=None,
        granted_by=None,
    )

    note_row = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    if note_row:
        note_row.spheres = []
        note_row.updated_by = updated_by
        await note_row.save(update_fields=["spheres", "updated_by", "updated_at"])

    from app.models.panel import AcademyCadet
    from datetime import datetime, timezone

    cadet = await AcademyCadet.get_or_none(vk_id=vk_id, server_id=server_id)
    if cadet and cadet.status in ("active", "frozen"):
        cadet.status = "expelled"
        cadet.left_at = datetime.now(timezone.utc)
        await cadet.save(update_fields=["status", "left_at"])

    invalidate_display_names(vk_id)


async def remove_staff_sphere_on_poolkick(
    server_id: int,
    vk_id: int,
    *,
    sphere: str,
    actor_vk_id: int,
) -> dict:
    """Снять одну сферу после poolkick (старший в сфере или ЗГС+)."""
    from app.services.staff_spheres import effective_grantable_sphere_keys

    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    if not access:
        raise ValueError("Пользователь не в реестре следящих")

    target_level = await get_access_level(vk_id, server_id)
    if target_level < AccessLevel.PGS:
        raise ValueError("У пользователя нет доступа следящего")

    actor_level = await get_access_level(actor_vk_id, server_id)
    if actor_vk_id != vk_id:
        if target_level >= actor_level and actor_level < AccessLevel.DEVELOPER:
            raise PermissionError(
                "Нельзя менять сферы пользователя своего уровня или выше"
            )

    actor_access = await UserServerAccess.get_or_none(
        user_id=actor_vk_id, server_id=server_id
    )
    actor_note = await StaffNote.get_or_none(vk_id=actor_vk_id, server_id=server_id)
    actor_spheres = list(actor_note.spheres or []) if actor_note else []

    allowed = False
    if actor_level >= AccessLevel.ZGS:
        grantable = effective_grantable_sphere_keys(actor_level, actor_spheres)
        allowed = sphere in grantable
    elif actor_access and getattr(actor_access, "is_senior", False):
        senior = list(getattr(actor_access, "senior_spheres", []) or [])
        allowed = sphere in senior

    if not allowed:
        raise PermissionError("Недостаточно прав для снятия этой сферы")

    note = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    current = list(note.spheres or []) if note else []
    if sphere not in current:
        raise ValueError("У пользователя нет этой сферы")

    new_spheres = [s for s in current if s != sphere]
    if not new_spheres:
        await revoke_staff_access(server_id, vk_id, updated_by=actor_vk_id)
        return {"vk_id": vk_id, "full_revoke": True, "sphere": sphere}

    is_senior = bool(getattr(access, "is_senior", False))
    senior_spheres = list(getattr(access, "senior_spheres", []) or [])
    new_senior = [s for s in senior_spheres if s != sphere]

    await update_staff_member(
        server_id,
        vk_id,
        spheres=new_spheres,
        is_senior=bool(new_senior) if is_senior else None,
        senior_spheres=new_senior if is_senior else None,
        granted_by=actor_vk_id,
    )
    return {
        "vk_id": vk_id,
        "full_revoke": False,
        "spheres": new_spheres,
        "sphere": sphere,
    }


async def _sync_formatted_staff_nickname(
    vk_id: int,
    server_id: int,
    access: UserServerAccess,
    user: User,
    *,
    clean_name: str | None = None,
    custom_tag: str | None = None,
    custom_tag_provided: bool = False,
    preserve_dev_tag: bool = True,
) -> None:
    bot_nick = await resolve_bot_nickname(vk_id, server_id, access=access, user=user)
    if clean_name is not None:
        clean = strip_nickname_tags(clean_name)
    else:
        clean = strip_nickname_tags(bot_nick or "")

    panel = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    spheres = await _resolve_staff_spheres(
        vk_id, server_id, access.access_level, access, user, panel
    )

    resolved_tag: str | None = None
    if access.access_level >= AccessLevel.DEVELOPER:
        if custom_tag_provided:
            resolved_tag = normalize_custom_tag(custom_tag)
        elif preserve_dev_tag:
            resolved_tag = normalize_custom_tag(extract_leading_nickname_tag(bot_nick or ""))

    is_senior, senior_spheres = access_senior_state(access)
    formatted = format_staff_nickname(
        clean,
        access.access_level,
        spheres,
        custom_tag=resolved_tag,
        is_senior=is_senior,
        senior_spheres=senior_spheres if is_senior else None,
    )
    await _persist_member_nickname(vk_id, server_id, formatted)


async def assign_staff_member(
    server_id: int,
    vk_id: int,
    *,
    nickname: str,
    access_level: int,
    spheres: list[str],
    granted_by: int | None = None,
    nickname_tag: str | None = None,
    granted_at: datetime | None = None,
    is_senior: bool = False,
    senior_spheres: list[str] | None = None,
) -> dict:
    if access_level < AccessLevel.PGS:
        raise ValueError("Уровень доступа должен быть не ниже ПС (1)")

    user, _ = await ensure_bot_user(vk_id, username=str(vk_id))

    access, _ = await ensure_server_access(vk_id, server_id, granted_by=granted_by)
    appointed = granted_at or datetime.now(UTC)
    # Инвайт в судейскую/лидерскую мог выставить флаги без реестра следящих —
    # иначе get_staff_member вернёт None и /reg «сломается» после успешной записи.
    assign_fields: dict = {
        "access_level": access_level,
        "granted_by": granted_by,
        "granted_at": appointed,
        "is_judge": False,
        "is_leader": False,
        "is_congress_speaker": False,
    }
    if has_usa_senior_columns():
        assign_fields["is_senior"] = bool(is_senior)
        assign_fields["senior_spheres"] = list(senior_spheres or [])
    if has_usa_promoted_at():
        assign_fields["promoted_at"] = appointed
    await update_server_access(vk_id, server_id, **assign_fields)

    normalized_spheres = validate_spheres(spheres, access_level)
    dev_tag = normalize_custom_tag(nickname_tag) if access_level >= AccessLevel.DEVELOPER else None
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    formatted_nick = format_staff_nickname(
        nickname,
        access_level,
        normalized_spheres,
        custom_tag=dev_tag,
        is_senior=bool(is_senior),
        senior_spheres=list(senior_spheres or []) if is_senior else None,
    )
    await _persist_member_nickname(vk_id, server_id, formatted_nick)
    await _persist_staff_spheres(vk_id, server_id, normalized_spheres, granted_by=granted_by)

    row = await get_staff_member(server_id, vk_id)
    if row:
        return row
    if access and access.access_level >= AccessLevel.PGS:
        return {
            "vk_id": vk_id,
            "nickname": formatted_nick,
            "bot_nickname": formatted_nick,
            "access_level": access_level,
            "spheres": list(normalized_spheres),
        }
    raise ValueError("Не удалось назначить следящего")


async def update_staff_member(
    server_id: int,
    vk_id: int,
    *,
    nickname: str | None = None,
    access_level: int | None = None,
    has_ca_access: bool | None = None,
    spheres: list[str] | None = None,
    note: str | None = None,
    granted_by: int | None = None,
    nickname_tag: str | None = None,
    nickname_tag_provided: bool = False,
    granted_at: datetime | None = None,
    granted_at_provided: bool = False,
    promoted_at: datetime | None = None,
    promoted_at_provided: bool = False,
    is_senior: bool | None = None,
    senior_spheres: list[str] | None = None,
    **_extra: object,
) -> dict:
    from app.models.bot import User, UserServerAccess
    from app.models.panel import StaffNote

    user = await User.get_or_none(vk_id=vk_id)
    if not user:
        raise ValueError("Пользователь не найден")

    access, _ = await ensure_server_access(vk_id, server_id, granted_by=granted_by)
    old_level = access.access_level
    old_senior = bool(getattr(access, "is_senior", False))
    old_senior_spheres = list(getattr(access, "senior_spheres", []) or [])
    old_panel = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    old_spheres = list(old_panel.spheres or []) if old_panel else []
    rank_changed = False

    if granted_at_provided:
        access.granted_at = granted_at or datetime.now(UTC)
        access.granted_by = granted_by
        await update_server_access(
            vk_id,
            server_id,
            granted_at=access.granted_at,
            granted_by=granted_by,
        )

    if access_level is not None:
        if access_level != old_level:
            rank_changed = True
        access.access_level = access_level
        access.granted_by = granted_by
        await update_server_access(
            vk_id,
            server_id,
            access_level=access_level,
            granted_by=granted_by,
        )

    if spheres is not None:
        if list(spheres) != old_spheres:
            rank_changed = True
        await _persist_staff_spheres(vk_id, server_id, spheres, granted_by=granted_by)
    elif has_ca_access is not None:
        panel, _ = await StaffNote.get_or_create(vk_id=vk_id, server_id=server_id, defaults={})
        current = list(panel.spheres or [])
        if has_ca_access:
            if CENTRAL_APPARATUS not in current:
                current.append(CENTRAL_APPARATUS)
        else:
            current = [s for s in current if s != CENTRAL_APPARATUS]
        if not current:
            current = migrate_legacy_sphere(
                access.access_level,
                access,
                user,
                panel.note or "",
            )
            if has_ca_access and CENTRAL_APPARATUS not in current:
                current.append(CENTRAL_APPARATUS)
            elif not has_ca_access:
                current = [s for s in current if s != CENTRAL_APPARATUS]
        if current != old_spheres:
            rank_changed = True
        await _persist_staff_spheres(vk_id, server_id, current, granted_by=granted_by)

    if note is not None:
        panel_note, _ = await StaffNote.get_or_create(
            vk_id=vk_id,
            server_id=server_id,
            defaults={"note": note.strip()},
        )
        panel_note.note = note.strip()
        panel_note.updated_by = granted_by
        await panel_note.save()

    # Persist senior flags to access row when provided explicitly.
    if is_senior is not None or senior_spheres is not None:
        senior_fields: dict = {}
        if is_senior is not None:
            if bool(is_senior) != old_senior:
                rank_changed = True
            senior_fields["is_senior"] = bool(is_senior)
        if senior_spheres is not None:
            if list(senior_spheres or []) != old_senior_spheres:
                rank_changed = True
            senior_fields["senior_spheres"] = list(senior_spheres or [])
        if senior_fields:
            await update_server_access(vk_id, server_id, **senior_fields)

    if promoted_at_provided:
        await update_server_access(
            vk_id,
            server_id,
            promoted_at=promoted_at or datetime.now(UTC),
        )
    elif rank_changed:
        await update_server_access(vk_id, server_id, promoted_at=datetime.now(UTC))

    if (
        nickname is not None
        or access_level is not None
        or spheres is not None
        or has_ca_access is not None
        or nickname_tag_provided
        or is_senior is not None
        or senior_spheres is not None
    ):
        access = await UserServerAccess.get(user_id=vk_id, server_id=server_id)
        promoted_to_dev = (
            access_level is not None
            and access_level >= AccessLevel.DEVELOPER
            and old_level < AccessLevel.DEVELOPER
        )
        try:
            await _sync_formatted_staff_nickname(
                vk_id,
                server_id,
                access,
                user,
                clean_name=nickname,
                custom_tag=nickname_tag,
                custom_tag_provided=nickname_tag_provided,
                preserve_dev_tag=not promoted_to_dev,
            )
        except ValueError as exc:
            # Сферы уже сохранены — не откатываем из‑за ника
            logger.warning(
                "staff nick sync skipped vk=%s server=%s: %s",
                vk_id,
                server_id,
                exc,
            )

    row = await get_staff_member(server_id, vk_id)
    if not row:
        row = await get_ca_leader(server_id, vk_id)
    if not row:
        raise ValueError("Пользователь не найден")
    return row


async def sync_spheres_from_bot(
    server_id: int,
    vk_id: int,
    *,
    grant_central_apparatus: bool,
    updated_by: int | None = None,
) -> list[str]:
    """Bot /setca or sled_ca chat → panel spheres + has_ca_access."""
    from app.models.bot import User

    user = await User.get_or_none(vk_id=vk_id)
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    panel, _ = await StaffNote.get_or_create(vk_id=vk_id, server_id=server_id, defaults={})

    level = access.access_level if access else 0
    current = list(panel.spheres or [])
    if not current and user:
        current = migrate_legacy_sphere(level, access, user, panel.note or "")

    if grant_central_apparatus:
        if CENTRAL_APPARATUS not in current:
            current.append(CENTRAL_APPARATUS)
    else:
        current = [s for s in current if s != CENTRAL_APPARATUS]

    if not current:
        if grant_central_apparatus:
            current = [CENTRAL_APPARATUS]
        elif level > AccessLevel.PGS:
            return list(panel.spheres or [])
        else:
            panel.spheres = []
            panel.updated_by = updated_by
            await panel.save(update_fields=["spheres", "updated_by", "updated_at"])
            if access:
                await sync_ca_access_from_spheres(access, [])
            return []

    return await _persist_staff_spheres(vk_id, server_id, current, granted_by=updated_by)


async def sync_sphere_from_bot(
    server_id: int,
    vk_id: int,
    sphere: str,
    *,
    grant: bool,
    updated_by: int | None = None,
) -> list[str]:
    """Системный sync бота: добавить/снять одну сферу без проверки актора."""
    from app.services.staff_spheres import ALL_SPHERE_KEYS

    key = (sphere or "").strip()
    if key not in ALL_SPHERE_KEYS:
        raise ValueError("Неизвестная сфера")

    panel, _ = await StaffNote.get_or_create(vk_id=vk_id, server_id=server_id, defaults={})
    current = list(panel.spheres or [])
    if grant:
        if key not in current:
            current.append(key)
    else:
        current = [s for s in current if s != key]
    return await _persist_staff_spheres(vk_id, server_id, current, granted_by=updated_by)
