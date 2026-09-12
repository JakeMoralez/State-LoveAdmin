"""Назначение следящего из VK-бота (/reg) — те же правила, что POST /api/assign."""

from __future__ import annotations

from app.models.bot import UserServerAccess
from app.services import messages
from app.services.activity_log import staff_assign_detail
from app.services.audit import log_audit
from app.services.role_assign import assign_staff_with_profile
from app.services.staff_permissions import (
    ASSIGN_STAFF_MIN_LEVEL,
    assert_can_set_level,
    assert_can_set_nickname,
    assert_can_set_spheres,
    staff_edit_permissions,
)


async def assign_staff_from_bot(
    server_id: int,
    vk_id: int,
    *,
    actor_vk_id: int,
    actor_level: int,
    actor_spheres: list[str],
    forum_account: str,
    nickname: str,
    access_level: int,
    spheres: list[str],
    discord_id: str | None,
    nickname_tag: str | None = None,
) -> dict:
    if actor_level < ASSIGN_STAFF_MIN_LEVEL:
        raise PermissionError(messages.ASSIGN_STAFF_NEED_ZGS)

    if actor_vk_id == vk_id:
        raise PermissionError("Нельзя назначить себя")

    target_access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    target_level = target_access.access_level if target_access else 0
    if target_level > 0:
        from app.services.staff import get_staff_member

        # Уже в реестре следящих — отказ. Если уровень есть, но карточки нет
        # (часто из‑за is_judge/is_leader после инвайта в беседу) — доназначаем.
        if await get_staff_member(server_id, vk_id):
            raise ValueError(
                "У пользователя уже есть доступ следящего. "
                "Измените уровень через /setlevel или профиль на сайте."
            )

    perms = staff_edit_permissions(
        actor_vk_id=actor_vk_id,
        actor_level=actor_level,
        actor_panel_role="member",
        target_vk_id=vk_id,
        target_level=0,
        actor_spheres=list(actor_spheres or []),
        target_spheres=[],
        dev_persona=False,
    )
    if not perms["assign_staff"]:
        raise PermissionError("Недостаточно прав для назначения следящего")

    assert_can_set_level(
        actor_vk_id=actor_vk_id,
        actor_level=actor_level,
        new_level=access_level,
        target_vk_id=vk_id,
        target_level=0,
        dev_persona=False,
    )
    assert_can_set_nickname(actor_level)
    normalized_spheres = assert_can_set_spheres(
        actor_vk_id=actor_vk_id,
        actor_level=actor_level,
        actor_panel_role="member",
        actor_spheres=list(actor_spheres or []),
        target_current=[],
        requested=spheres,
        target_level=access_level,
        dev_persona=False,
    )

    result = await assign_staff_with_profile(
        server_id,
        vk_id,
        forum_account=forum_account,
        nickname=nickname,
        access_level=access_level,
        spheres=normalized_spheres,
        nickname_tag=nickname_tag,
        discord_id=discord_id,
        granted_by=actor_vk_id,
    )

    await log_audit(
        actor_vk_id,
        "staff_assign",
        "staff",
        vk_id,
        staff_assign_detail(
            target_vk_id=vk_id,
            nickname=nickname,
            access_level=access_level,
            spheres=list(normalized_spheres),
        ),
    )

    return result
