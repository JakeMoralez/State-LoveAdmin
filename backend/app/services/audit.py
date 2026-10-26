"""Panel audit log."""

from __future__ import annotations

from app.models.panel import PanelAuditLog


def is_logged_action(action: str) -> bool:
    """Credential maintenance and case editing are not user activity."""
    return "cookie" not in action.casefold() and (not action.startswith("loot_case_") or action == "loot_case_spin")


async def log_audit(
    actor_vk_id: int,
    action: str,
    entity_type: str,
    entity_id: str | int,
    detail: dict | None = None,
) -> None:
    if not is_logged_action(action):
        return

    from app.config import DEFAULT_SERVER_ID
    from app.models.bot import UserServerAccess
    from app.domain.access_levels import role_title
    from app.services.display_names import resolve_display_names

    detail = dict(detail or {})
    server_id = int(detail.get("server_id") or DEFAULT_SERVER_ID)
    names = await resolve_display_names({actor_vk_id}, server_id) if actor_vk_id and not detail.get("actor_name_snapshot") else {}
    actor = await UserServerAccess.get_or_none(user_id=actor_vk_id, server_id=server_id)
    detail.setdefault("actor_name_snapshot", names.get(actor_vk_id, f"id{actor_vk_id}"))
    detail.setdefault("actor_role_snapshot", role_title(actor.access_level) if actor and actor.access_level > 0 else "")
    detail.setdefault("source", "panel")
    await PanelAuditLog.create(
        actor_vk_id=actor_vk_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        detail=detail,
    )
