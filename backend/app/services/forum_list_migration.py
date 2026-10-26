"""Back up the panel before creating forum-list tables, once."""
import asyncio
from tortoise import Tortoise
from app.services.case_duration_migration import backup_panel

KEY = "forum_list_v1"


async def prepare():
    from app.config import BASE_DIR, PANEL_DATABASE_URL, is_sqlite_url
    conn = Tortoise.get_connection("default")
    await conn.execute_query("CREATE TABLE IF NOT EXISTS panel_migrations (key VARCHAR(128) PRIMARY KEY NOT NULL)")
    placeholder = "?" if is_sqlite_url(PANEL_DATABASE_URL) else "$1"
    if await conn.execute_query_dict(f"SELECT key FROM panel_migrations WHERE key={placeholder}", [KEY]):
        return
    await asyncio.to_thread(backup_panel, PANEL_DATABASE_URL, BASE_DIR / "data" / "backups" / "forum-list", prefix="before-forum-list")


async def finish():
    from app.config import PANEL_DATABASE_URL, is_sqlite_url
    sql = "INSERT OR IGNORE INTO panel_migrations (key) VALUES (?)" if is_sqlite_url(PANEL_DATABASE_URL) else "INSERT INTO panel_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING"
    await Tortoise.get_connection("default").execute_query(sql, [KEY])
