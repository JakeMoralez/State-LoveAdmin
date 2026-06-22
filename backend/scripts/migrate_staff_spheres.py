#!/usr/bin/env python3
"""One-time migration: staff_notes.spheres from legacy note / has_ca_access."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tortoise import Tortoise

from app.config import DEFAULT_SERVER_ID, TORTOISE_ORM
from app.models.bot import User, UserServerAccess
from app.models.panel import StaffNote
from app.services.access import get_access_level
from app.services.staff import list_staff
from app.services.staff_spheres import migrate_legacy_sphere, sync_ca_access_from_spheres, validate_spheres


async def main() -> None:
    await Tortoise.init(config=TORTOISE_ORM)
    server_id = DEFAULT_SERVER_ID
    rows = await list_staff(server_id)
    migrated = 0
    for row in rows:
        vk_id = row["vk_id"]
        panel, _ = await StaffNote.get_or_create(vk_id=vk_id, server_id=server_id, defaults={})
        if panel.spheres:
            continue
        user = await User.get(vk_id=vk_id)
        access = await UserServerAccess.get_or_none(user_id=vk_id, server_id=server_id)
        level = await get_access_level(vk_id, server_id)
        old_note = panel.note or row.get("note") or ""
        spheres = migrate_legacy_sphere(level, access, user, old_note)
        panel.spheres = validate_spheres(spheres)
        await panel.save(update_fields=["spheres"])
        if access:
            await sync_ca_access_from_spheres(access, panel.spheres)
        migrated += 1
        print(f"vk_id={vk_id} -> {panel.spheres}")
    print(f"Done. Migrated {migrated} records.")
    await Tortoise.close_connections()


if __name__ == "__main__":
    asyncio.run(main())
