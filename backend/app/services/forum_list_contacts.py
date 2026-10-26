"""Read-only, unambiguous VK fallback from active local leadership appointments."""
import re

from app.models.bot import UserServerAccess
from app.models.panel import StaffNote
from app.services.appointments import office_is_active
from app.services.leader_nickname import infer_leadership_from_nickname
from app.services.leader_spheres import canon_org_tag
from app.services.staff_nickname import strip_nickname_tags


def name_key(value):
    return re.sub(r"[\s_]+", "_", strip_nickname_tags(value or "").strip()).casefold()


def apply_contacts(data, contacts):
    """Do not guess by name alone or overwrite a contact supplied by the API."""
    index = {}
    for nick, org, role, vk_id in contacts:
        key = (name_key(nick), canon_org_tag(org).casefold(), role)
        if key[0] and key[1] and role and vk_id > 0:
            index.setdefault(key, set()).add(vk_id)

    def fill(row, org, role):
        if row.get("vk_url") or row.get("vk_id"):
            return
        matches = index.get((name_key(row.get("nickname")), canon_org_tag(org).casefold(), role), set())
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
    for access in await UserServerAccess.filter(server_id=server_id, is_leader=True):
        note = notes.get(access.user_id)
        if not office_is_active(access, note):
            continue
        inferred = infer_leadership_from_nickname(access.nickname)
        role, org = inferred["role_type"], inferred["org_tag"]
        position = (note.leader_position if note else "") or ""
        if access.is_judge:
            role, org = "judge", "Judge"
        elif role == "minister":
            org = position
        elif not role:
            role = {"лидер": "leader", "заместитель": "deputy", "зам": "deputy", "зам.": "deputy"}.get(position.strip().casefold())
        contacts.append((access.nickname, org or "", role, int(access.user_id)))
    return apply_contacts(data, contacts)
