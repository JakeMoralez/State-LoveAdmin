"""Read-only, unambiguous VK fallback from active local leadership appointments."""
import re

from app.models.bot import UserServerAccess
from app.models.panel import StaffNote, StaffAppointmentArchive
from app.services.appointments import office_is_active
from app.services.leader_nickname import infer_leadership_from_nickname
from app.services.leader_spheres import canon_org_tag
from app.services.staff_nickname import strip_nickname_tags


def name_key(value):
    return re.sub(r"[\s_]+", "_", strip_nickname_tags(value or "").strip()).casefold()


def organization_key(value):
    tag = canon_org_tag(value).casefold()
    # Local nickname tags versus the source API's organization abbreviations.
    return {"sffd": "des", "fp": "msp"}.get(tag, tag)


def apply_contacts(data, contacts):
    """Do not guess by name alone or overwrite a contact supplied by the API."""
    index = {}
    for nick, org, role, vk_id in contacts:
        key = (name_key(nick), organization_key(org), role)
        if key[0] and key[1] and role and vk_id > 0:
            index.setdefault(key, set()).add(vk_id)

    def fill(row, org, role):
        if re.fullmatch(r"https://(?:www\.)?vk\.(?:ru|com)/[\w.-]+", str(row.get("vk_url") or ""), re.ASCII):
            return
        vk_id = str(row.get("vk_id") or "")
        if re.fullmatch(r"[1-9]\d*", vk_id):
            row["vk_url"] = f"https://vk.ru/id{vk_id}"
            return
        row["vk_id"], row["vk_url"] = "", ""
        matches = index.get((name_key(row.get("nickname")), organization_key(org), role), set())
        if len(matches) == 1:
            row["vk_id"] = str(next(iter(matches)))
            row["vk_url"] = f"https://vk.ru/id{row['vk_id']}"

    for fraction in data.get("fractions", []):
        for group, role in (("leaders", "leader"), ("deputies", "deputy")):
            for row in fraction.get(group, []):
                fill(row, fraction["fraction_name"], role)
    for row in data.get("judges", []):
        fill(row, "Judge", "judge")
    # Ministerial portfolios have no verified cross-API tag mapping yet.
    # Match their concrete position exactly rather than mixing all ministers.
    for row in data.get("ministers", []):
        fill(row, row.get("rank_name", ""), "minister")
    return data


async def supplement_contacts(data, server_id):
    notes = {n.vk_id: n for n in await StaffNote.filter(server_id=server_id)}
    contacts = []
    closed = {}
    for archive in await StaffAppointmentArchive.filter(server_id=server_id, kind="leader"):
        closed[archive.vk_id] = max(closed.get(archive.vk_id, archive.closed_at), archive.closed_at)
    for access in await UserServerAccess.filter(server_id=server_id, access_level=0):
        note = notes.get(access.user_id)
        inferred = infer_leadership_from_nickname(access.nickname)
        role, org = inferred["role_type"], inferred["org_tag"]
        if not office_is_active(access, note):
            # A registered account with an explicit organization/rank nickname can
            # supply its public contact when the current API confirms the same
            # appointment. This does not restore an appointment or grant access.
            if role not in ("leader", "deputy") or not org:
                continue
            if access.user_id in closed and closed[access.user_id] >= access.granted_at:
                continue
        position = (note.leader_position if note else "") or ""
        if access.is_judge:
            role, org = "judge", "Judge"
        elif role == "minister":
            org = position
        elif not role:
            role = {"лидер": "leader", "заместитель": "deputy", "зам": "deputy", "зам.": "deputy"}.get(position.strip().casefold())
        contacts.append((access.nickname, org or "", role, int(access.user_id)))
    return apply_contacts(data, contacts)
