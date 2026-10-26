"""Appointment snapshots independent of chat membership and display names."""

from app.models.bot import UserServerAccess
from app.models.panel import StaffAppointmentArchive, StaffNote
from app.domain.access_levels import role_title
from app.services.leader_nickname import infer_leadership_from_nickname


def office_is_active(access, note=None) -> bool:
    if not access or access.access_level > 0 or not access.is_leader:
        return False
    if access.is_judge or access.is_congress_speaker or access.is_congress_vice:
        return True
    return bool(access.is_leader and (
        (note and note.leader_position.strip())
        or infer_leadership_from_nickname(access.nickname).get("position")
    ))


async def appointment_snapshot(server_id: int, vk_id: int) -> dict:
    access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
    note = await StaffNote.get_or_none(vk_id=vk_id, server_id=server_id)
    if not access:
        return {}
    level = int(access.access_level or 0)
    inferred = infer_leadership_from_nickname(access.nickname)
    kind = "staff" if level > 0 else "leader" if office_is_active(access, note) else None
    if not kind:
        return {}
    position = role_title(level) if kind == "staff" else (
        (note.leader_position if note else "") or inferred.get("position")
        or ("Судья" if access.is_judge else "Спикер конгресса" if access.is_congress_speaker else "Вице-спикер конгресса")
    )
    return {
        "kind": kind, "nickname": access.nickname or "", "position": position,
        "org_tag": inferred.get("org_tag") if kind == "leader" else None,
        "access_level": level, "spheres": list(note.spheres or []) if note else [],
        "senior_spheres": list(getattr(access, "senior_spheres", []) or []),
        "granted_at": access.granted_at.isoformat() if access.granted_at else None,
    }


async def active_appointment_ids(server_id: int) -> set[int]:
    """Both primary appointment kinds, regardless of which chats they joined."""
    notes = {n.vk_id: n for n in await StaffNote.filter(server_id=server_id)}
    return {int(a.user_id) for a in await UserServerAccess.filter(server_id=server_id)
            if a.access_level > 0 or office_is_active(a, notes.get(a.user_id))}


async def archive_appointment(server_id: int, vk_id: int, actor: int | None) -> dict:
    snapshot = await appointment_snapshot(server_id, vk_id)
    if snapshot:
        await StaffAppointmentArchive.create(
            server_id=server_id, vk_id=vk_id, kind=snapshot["kind"], snapshot=snapshot, closed_by=actor,
        )
    return snapshot


async def appointment_history(server_id: int, vk_id: int) -> list[dict]:
    return [dict(id=r.id, **r.snapshot, closed_at=r.closed_at.isoformat(), closed_by=r.closed_by)
            for r in await StaffAppointmentArchive.filter(server_id=server_id, vk_id=vk_id).order_by("-closed_at")]
