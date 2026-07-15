"""Database lifecycle."""

from __future__ import annotations

from pathlib import Path

from tortoise import Tortoise

from app.config import PANEL_DATABASE_URL, TORTOISE_ORM, is_sqlite_url, sqlite_file_path


async def init_db() -> None:
    if is_sqlite_url(PANEL_DATABASE_URL):
        db_path = sqlite_file_path(PANEL_DATABASE_URL)
        if db_path and not db_path.startswith(":"):
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    await Tortoise.init(config=TORTOISE_ORM)
    await Tortoise.generate_schemas(safe=True)


async def close_db() -> None:
    await Tortoise.close_connections()
