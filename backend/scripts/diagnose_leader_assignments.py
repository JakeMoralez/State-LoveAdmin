"""Read-only diagnostics of named leadership accounts; no tokens or configuration output."""
import argparse
import asyncio
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tortoise import Tortoise
from app.config import TORTOISE_ORM, DEFAULT_SERVER_ID
from app.models.bot import UserServerAccess
from app.models.panel import StaffNote, StaffAppointmentArchive
from app.services.appointments import office_is_active
from app.services.forum_list_contacts import name_key
from app.services.leader_nickname import infer_leadership_from_nickname


async def report(names, server_id):
    await Tortoise.init(config=TORTOISE_ORM)
    try:
        wanted = {name_key(n) for n in names}
        result = []
        for access in await UserServerAccess.filter(server_id=server_id):
            if name_key(access.nickname) not in wanted:
                continue
            note = await StaffNote.get_or_none(server_id=server_id, vk_id=access.user_id)
            parsed = infer_leadership_from_nickname(access.nickname)
            closed = await StaffAppointmentArchive.filter(server_id=server_id, vk_id=access.user_id, kind='leader').order_by('-closed_at').first()
            result.append({'vk_id': access.user_id, 'nickname': access.nickname,
                'access_level': access.access_level, 'is_leader': access.is_leader,
                'stored_position': note.leader_position if note else None,
                'parsed_position': parsed['position'], 'organization': parsed['org_tag'],
                'in_registry': office_is_active(access, note),
                'granted_at': access.granted_at.isoformat(),
                'last_closed_at': closed.closed_at.isoformat() if closed else None})
        return {'read_only': True, 'server_id': server_id, 'accounts': result,
                'not_found': sorted(wanted - {name_key(r['nickname']) for r in result})}
    finally:
        await Tortoise.close_connections()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('nicknames', nargs='+')
    parser.add_argument('--server-id', type=int, default=DEFAULT_SERVER_ID)
    args = parser.parse_args()
    print(json.dumps(asyncio.run(report(args.nicknames, args.server_id)), ensure_ascii=False, indent=2))
