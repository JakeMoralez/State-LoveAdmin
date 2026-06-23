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


def _is_developer(vk_id: int, level: int, *, dev_persona: bool = False) -> bool:
    if level >= AccessLevel.DEVELOPER:
        return True
    if dev_persona:
        return False
    return bool(MAIN_ADMIN_ID and vk_id == MAIN_ADMIN_ID)


def max_grantable_level(
    actor_vk_id: int,
    actor_level: int,
    *,
    dev_persona: bool = False,
    for_other: bool = True,
) -> int:
    """Макс. уровень для выдачи другому: строго ниже своего (ЗГС → до 2, ГС → до 3)."""
    if _is_developer(actor_vk_id, actor_level, dev_persona=dev_persona):
        return AccessLevel.DEVELOPER
    cap = min(actor_level, AccessLevel.GA)
    if for_other and cap > 0:
        return cap - 1
    return cap


def can_revoke_staff_target(
    *,
    actor_vk_id: int,
    actor_level: int,
    target_vk_id: int,
    target_level: int,
    dev_persona: bool = False,
) -> bool:
    """Снятие — только уровень строго ниже своего и не ЗГС ГОС+."""
    if int(actor_vk_id) == int(target_vk_id):
        return False
    if int(target_level) >= int(actor_level):
        return False
    if int(target_level) >= AccessLevel.ZGS_GOS:
        return False
    return int(target_level) <= max_grantable_level(
        actor_vk_id,
        actor_level,
        dev_persona=dev_persona,
        for_other=True,
    )


def staff_edit_permissions(
    *,
    actor_vk_id: int,
    actor_level: int,
    actor_panel_role: str,
    target_vk_id: int,
    target_level: int = 0,
    actor_spheres: list[str] | None = None,
    target_spheres: list[str] | None = None,
    dev_persona: bool = False,
) -> dict:
    """Права редактирования карточки следящего в панели."""
    is_self = actor_vk_id == target_vk_id
    is_developer = _is_developer(actor_vk_id, actor_level, dev_persona=dev_persona)
    allow_self_edit = is_developer and is_self
    effective = AccessLevel.DEVELOPER if is_developer else actor_level
    target_above_actor = int(target_level) > effective
    unrestricted_spheres = is_developer or actor_panel_role in ("owner", "lead")
    actor_set = set(actor_spheres or [])
    target_set = set(target_spheres or [])
    locked_spheres = [] if unrestricted_spheres else sorted(target_set - actor_set)
    grantable_spheres = [] if unrestricted_spheres else sorted(actor_set)

    edit_nickname = (
        actor_level >= AccessLevel.PGS
        and (not is_self or allow_self_edit)
        and not target_above_actor
    )
    edit_level = (
        actor_level >= AccessLevel.ZGS
        and (not is_self or allow_self_edit)
        and not target_above_actor
    )
    edit_ca = (
        actor_level >= AccessLevel.ZGS
        and (not is_self or allow_self_edit)
        and not target_above_actor
    )
    edit_spheres = (
        actor_level >= AccessLevel.ZGS
        and (not is_self or allow_self_edit)
        and not target_above_actor
    )
    edit_sphere_legacy = actor_level >= AccessLevel.CURATOR or actor_panel_role in ("owner", "lead")
    edit_discord = (
        is_self
        or actor_level >= AccessLevel.ZGS
        or actor_panel_role in ("owner", "lead")
    )
    revoke_staff = (
        edit_level
        and not is_self
        and can_revoke_staff_target(
            actor_vk_id=actor_vk_id,
            actor_level=actor_level,
            target_vk_id=target_vk_id,
            target_level=target_level,
            dev_persona=dev_persona,
        )
    )
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
        "max_access_level": max_grantable_level(
            actor_vk_id, actor_level, dev_persona=dev_persona
        ),
        "grantable_spheres": grantable_spheres,
        "locked_spheres": locked_spheres,
        "unrestricted_sphere_edit": unrestricted_spheres,
    }


def assert_can_set_level(
    *,
    actor_vk_id: int,
    actor_level: int,
    new_level: int,
    target_vk_id: int | None = None,
    target_level: int = 0,
    dev_persona: bool = False,
) -> None:
    from fastapi import HTTPException

    if actor_level < AccessLevel.ZGS:
        raise HTTPException(status_code=403, detail="Нужен уровень ЗГС+ для смены доступа")
    if new_level == 0:
        raise HTTPException(
            status_code=400,
            detail="Для снятия доступа используйте действие «Снять доступ»",
        )
    max_lvl = max_grantable_level(
        actor_vk_id,
        actor_level,
        dev_persona=dev_persona,
        for_other=target_vk_id is None or int(target_vk_id) != int(actor_vk_id),
    )
    if new_level < 0 or new_level > max_lvl:
        raise HTTPException(status_code=400, detail=f"Доступны уровни 1–{max_lvl}")
    effective = (
        AccessLevel.DEVELOPER
        if _is_developer(actor_vk_id, actor_level, dev_persona=dev_persona)
        else actor_level
    )
    if new_level > effective:
        raise HTTPException(status_code=403, detail="Нельзя выдать уровень выше своего")
    is_other = target_vk_id is None or int(target_vk_id) != int(actor_vk_id)
    if (
        is_other
        and not _is_developer(actor_vk_id, actor_level, dev_persona=dev_persona)
        and new_level >= effective
    ):
        raise HTTPException(
            status_code=403,
            detail="Нельзя выдать уровень равный или выше своего",
        )
    if target_vk_id is not None and int(target_vk_id) == int(actor_vk_id):
        if (
            new_level < actor_level
            and not _is_developer(actor_vk_id, actor_level, dev_persona=dev_persona)
        ):
            raise HTTPException(status_code=403, detail="Нельзя понизить свой уровень")
    if target_vk_id is not None and int(target_level) > effective:
        raise HTTPException(
            status_code=403,
            detail="Нельзя изменить уровень пользователя выше вашего",
        )


def assert_can_set_nickname(actor_level: int) -> None:
    from fastapi import HTTPException

    if actor_level < AccessLevel.PGS:
        raise HTTPException(status_code=403, detail="Нужен уровень ПГС+ для смены ника")


def assert_can_edit_staff_nickname(
    *,
    actor_vk_id: int,
    actor_level: int,
    target_vk_id: int,
    target_level: int,
    dev_persona: bool = False,
) -> None:
    from fastapi import HTTPException

    assert_can_set_nickname(actor_level)
    if (
        int(actor_vk_id) == int(target_vk_id)
        and not _is_developer(actor_vk_id, actor_level, dev_persona=dev_persona)
    ):
        raise HTTPException(status_code=403, detail="Нельзя менять свой ник через реестр")
    effective = (
        AccessLevel.DEVELOPER
        if _is_developer(actor_vk_id, actor_level, dev_persona=dev_persona)
        else actor_level
    )
    if int(target_level) > effective:
        raise HTTPException(status_code=403, detail="Нельзя менять ник пользователя выше вашего")


def assert_can_set_spheres(
    *,
    actor_vk_id: int,
    actor_level: int,
    actor_panel_role: str,
    actor_spheres: list[str],
    target_current: list[str],
    requested: list[str],
    target_level: int,
    dev_persona: bool = False,
) -> list[str]:
    from fastapi import HTTPException

    from app.services.staff_spheres import constrain_spheres_for_actor, validate_spheres

    if actor_level < AccessLevel.ZGS:
        raise HTTPException(status_code=403, detail="Нужен уровень ЗГС+ для смены сфер")
    unrestricted = _is_developer(
        actor_vk_id, actor_level, dev_persona=dev_persona
    ) or actor_panel_role in ("owner", "lead")
    try:
        if unrestricted:
            return validate_spheres(requested, target_level)
        return constrain_spheres_for_actor(actor_spheres, target_current, requested, target_level)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
    dev_persona: bool = False,
) -> None:
    from fastapi import HTTPException

    if actor_level < AccessLevel.ZGS:
        raise HTTPException(status_code=403, detail="Нужен уровень ЗГС+ для снятия доступа")
    if actor_vk_id == target_vk_id:
        raise HTTPException(status_code=403, detail="Нельзя снять доступ с себя")
    if MAIN_ADMIN_ID and target_vk_id == MAIN_ADMIN_ID and not dev_persona:
        raise HTTPException(status_code=403, detail="Нельзя снять доступ главного администратора")
    if int(target_level) >= int(actor_level):
        raise HTTPException(
            status_code=403,
            detail="Нельзя снять доступ у пользователя с вашим уровнем или выше",
        )
    if not can_revoke_staff_target(
        actor_vk_id=actor_vk_id,
        actor_level=actor_level,
        target_vk_id=target_vk_id,
        target_level=target_level,
        dev_persona=dev_persona,
    ):
        if int(target_level) >= AccessLevel.ZGS_GOS:
            raise HTTPException(
                status_code=403,
                detail="Нельзя снять доступ ЗГС ГОС+ через реестр следящих",
            )
        raise HTTPException(
            status_code=403,
            detail="Нельзя снять доступ: вы не сможете снова выдать этот уровень",
        )
