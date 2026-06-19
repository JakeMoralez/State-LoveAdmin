"""Staff edit permissions — parity with State-LoveBot commands."""

from __future__ import annotations

from app.config import MAIN_ADMIN_ID
from app.models.bot import AccessLevel


def _is_developer(vk_id: int, level: int) -> bool:
    if level >= AccessLevel.DEVELOPER:
        return True
    return bool(MAIN_ADMIN_ID and vk_id == MAIN_ADMIN_ID)


def max_grantable_level(actor_vk_id: int, actor_level: int) -> int:
    """Как /setlevel: разработчик до 10, остальные не выше своего (макс. 9 для dev-аккаунта)."""
    if _is_developer(actor_vk_id, actor_level):
        return AccessLevel.DEVELOPER
    return min(actor_level, AccessLevel.GA)


def staff_edit_permissions(
    *,
    actor_vk_id: int,
    actor_level: int,
    actor_panel_role: str,
    target_vk_id: int,
) -> dict:
    """Права редактирования карточки следящего в панели."""
    is_self = actor_vk_id == target_vk_id
    edit_nickname = actor_level >= AccessLevel.PGS and not is_self
    edit_level = actor_level >= AccessLevel.ZGS and not is_self
    edit_ca = actor_level >= AccessLevel.ZGS and not is_self
    edit_sphere = actor_level >= AccessLevel.CURATOR or actor_panel_role in ("owner", "lead")
    edit_discord = is_self or actor_level >= AccessLevel.CURATOR or actor_panel_role in (
        "owner",
        "lead",
    )

    return {
        "edit_nickname": edit_nickname,
        "edit_access_level": edit_level,
        "edit_ca_access": edit_ca,
        "edit_sphere": edit_sphere,
        "edit_discord": edit_discord,
        "max_access_level": max_grantable_level(actor_vk_id, actor_level),
    }


def assert_can_set_level(*, actor_vk_id: int, actor_level: int, new_level: int) -> None:
    from fastapi import HTTPException

    if actor_level < AccessLevel.ZGS:
        raise HTTPException(status_code=403, detail="Нужен уровень ЗГС+ для смены доступа")
    max_lvl = max_grantable_level(actor_vk_id, actor_level)
    if new_level < 0 or new_level > max_lvl:
        raise HTTPException(status_code=400, detail=f"Доступны уровни 0–{max_lvl}")
    effective = AccessLevel.DEVELOPER if _is_developer(actor_vk_id, actor_level) else actor_level
    if new_level > effective:
        raise HTTPException(status_code=403, detail="Нельзя выдать уровень выше своего")


def assert_can_set_nickname(actor_level: int) -> None:
    from fastapi import HTTPException

    if actor_level < AccessLevel.PGS:
        raise HTTPException(status_code=403, detail="Нужен уровень ПГС+ для смены ника")


def assert_can_set_ca(actor_level: int) -> None:
    from fastapi import HTTPException

    if actor_level < AccessLevel.ZGS:
        raise HTTPException(status_code=403, detail="Нужен уровень ЗГС+ для доступа ЦА")
