"""Panel audit log."""

from __future__ import annotations

from app.models.panel import PanelAuditLog


async def log_audit(
    actor_vk_id: int,
    action: str,
    entity_type: str,
    entity_id: str | int,
    detail: dict | None = None,
) -> None:
    await PanelAuditLog.create(
        actor_vk_id=actor_vk_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        detail=detail,
    )
