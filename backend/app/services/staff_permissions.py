"""Staff edit permissions — parity with State-LoveBot commands."""

from __future__ import annotations

from app.config import MAIN_ADMIN_ID
from app.models.bot import AccessLevel

# Судьи / конгресс: назначение и правка реестра «Руководство» — Следящий (2)+
LEADER_REGISTRY_EDIT_MIN_LEVEL = AccessLevel.SUPERVISOR


def can_manage_leadership_registry(
    *,
    actor_level: int,
    actor_vk_id: int,
    target_vk_id: int,
) -> bool:
    """Правка полей реестра: Следящий (2+) — чужие; разработчик — любые, включая свой профиль."""
    if _is_developer(actor_vk_id, actor_level):
        return True
    return actor_level >= LEADER_REGISTRY_EDIT_MIN_LEVEL and int(actor_vk_id) != int(target_vk_id)


def can_remove_from_leadership_registry(
    *,
    actor_level: int,
    actor_vk_id: int,
    target_vk_id: int,
) -> bool:
    """Снятие из реестра — только чужие карточки (Следящий 2+ или разработчик)."""
    if int(actor_vk_id) == int(target_vk_id):
        return False
    if _is_developer(actor_vk_id, actor_level):
        return True
    return actor_level >= LEADER_REGISTRY_EDIT_MIN_LEVEL


def assert_can_manage_leadership_registry(
    *,
    actor_level: int,
    actor_vk_id: int,
    target_vk_id: int,
) -> None:
    from fastapi import HTTPException

    if not can_manage_leadership_registry(
        actor_level=actor_level,
        actor_vk_id=actor_vk_id,
        target_vk_id=target_vk_id,
    ):
        raise HTTPException(
            status_code=403,
            detail="Нужен уровень Следящий (2)+ для управления реестром руководства",
        )


def assert_can_remove_from_leadership_registry(
    *,
    actor_level: int,
    actor_vk_id: int,
    target_vk_id: int,
) -> None:
    from fastapi import HTTPException

    if not can_remove_from_leadership_registry(
        actor_level=actor_level,
        actor_vk_id=actor_vk_id,
        target_vk_id=target_vk_id,
    ):
        raise HTTPException(
            status_code=403,
            detail="Нельзя убрать из реестра себя или без уровня Следящий (2+)",
        )


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
    is_developer = _is_developer(actor_vk_id, actor_level)
    allow_self_edit = is_developer and is_self

    edit_nickname = actor_level >= AccessLevel.PGS and (not is_self or allow_self_edit)
    edit_level = actor_level >= AccessLevel.ZGS and (not is_self or allow_self_edit)
    edit_ca = actor_level >= AccessLevel.ZGS and (not is_self or allow_self_edit)
    edit_spheres = actor_level >= AccessLevel.ZGS and (not is_self or allow_self_edit)
    edit_sphere_legacy = actor_level >= AccessLevel.CURATOR or actor_panel_role in ("owner", "lead")
    edit_discord = (
        is_self
        or actor_level >= AccessLevel.ZGS
        or actor_panel_role in ("owner", "lead")
    )
    revoke_staff = edit_level and not is_self
    assign_staff = edit_level and not is_self

    return {
        "edit_nickname": edit_nickname,
        "edit_access_level": edit_level,
        "edit_ca_access": edit_ca,
        "edit_spheres": edit_spheres,
        "edit_sphere": edit_sphere_legacy or edit_spheres,
        "edit_discord": edit_discord,
        "revoke_staff_access": revoke_staff,
        "assign_staff": assign_staff,
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


def assert_can_revoke_staff(
    *,
    actor_vk_id: int,
    actor_level: int,
    target_vk_id: int,
    target_level: int,
) -> None:
    from fastapi import HTTPException

    if actor_level < AccessLevel.ZGS:
        raise HTTPException(status_code=403, detail="Нужен уровень ЗГС+ для снятия доступа")
    if actor_vk_id == target_vk_id:
        raise HTTPException(status_code=403, detail="Нельзя снять доступ с себя")
    if MAIN_ADMIN_ID and target_vk_id == MAIN_ADMIN_ID:
        raise HTTPException(status_code=403, detail="Нельзя снять доступ главного администратора")
    effective = AccessLevel.DEVELOPER if _is_developer(actor_vk_id, actor_level) else actor_level
    if target_level > effective:
        raise HTTPException(status_code=403, detail="Нельзя снять доступ у пользователя с уровнем выше вашего")
