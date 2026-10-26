"""Back up the panel before ORM creates the inventory tables, then mark completion."""
import asyncio
from tortoise import Tortoise
from app.services.case_duration_migration import backup_panel

KEY = "case_inventory_v1"


async def prepare_inventory_schema():
    from app.config import BASE_DIR, PANEL_DATABASE_URL, is_sqlite_url
    conn = Tortoise.get_connection("default")
    await conn.execute_query("CREATE TABLE IF NOT EXISTS panel_migrations (key VARCHAR(128) PRIMARY KEY NOT NULL)")
    parameter = "?" if is_sqlite_url(PANEL_DATABASE_URL) else "$1"
    if await conn.execute_query_dict(f"SELECT key FROM panel_migrations WHERE key={parameter}", [KEY]):
        return
    await asyncio.to_thread(backup_panel, PANEL_DATABASE_URL, BASE_DIR / "data" / "backups" / "case-inventory")


async def finish_inventory_schema():
    from app.config import PANEL_DATABASE_URL, is_sqlite_url
    conn = Tortoise.get_connection("default")
    sql = "INSERT OR IGNORE INTO panel_migrations (key) VALUES (?)" if is_sqlite_url(PANEL_DATABASE_URL) else "INSERT INTO panel_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING"
    await conn.execute_query(sql, [KEY])
