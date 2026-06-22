#!/usr/bin/env python3
"""One-time migration: staff_notes.spheres from legacy note / has_ca_access."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tortoise import Tortoise

from app.config import DEFAULT_SERVER_ID, TORTOISE_ORM
from app.services.staff import migrate_staff_spheres_to_panel


async def main() -> None:
    await Tortoise.init(config=TORTOISE_ORM)
    migrated = await migrate_staff_spheres_to_panel(DEFAULT_SERVER_ID)
    print(f"Done. Migrated {migrated} records.")
    await Tortoise.close_connections()


if __name__ == "__main__":
    asyncio.run(main())
