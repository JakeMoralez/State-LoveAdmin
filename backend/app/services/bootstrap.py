"""First-run defaults and lightweight schema patches."""

from __future__ import annotations

from tortoise import Tortoise


async def _column_exists(table: str, column: str) -> bool:
    conn = Tortoise.get_connection("default")
    rows = await conn.execute_query_dict(f"PRAGMA table_info({table})")
    return any(r.get("name") == column for r in rows)


async def ensure_defaults() -> None:
    conn = Tortoise.get_connection("default")
    if not await _column_exists("tasks", "due_time"):
        await conn.execute_query("ALTER TABLE tasks ADD COLUMN due_time VARCHAR(5) NULL")
    if not await _column_exists("checklist_tasks", "days_of_week"):
        await conn.execute_query(
            "ALTER TABLE checklist_tasks ADD COLUMN days_of_week VARCHAR(32) DEFAULT '0,1,2,3,4,5,6'"
        )
    if not await _column_exists("tasks", "assignee_vk_ids"):
        await conn.execute_query("ALTER TABLE tasks ADD COLUMN assignee_vk_ids JSON DEFAULT '[]'")
    if not await _column_exists("checklist_cells", "proof_urls"):
        await conn.execute_query("ALTER TABLE checklist_cells ADD COLUMN proof_urls JSON DEFAULT '[]'")
    if not await _column_exists("checklist_cells", "proof_video_url"):
        await conn.execute_query("ALTER TABLE checklist_cells ADD COLUMN proof_video_url VARCHAR(1024) NULL")
