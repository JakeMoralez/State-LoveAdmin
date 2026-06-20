"""First-run defaults and lightweight schema patches."""

from __future__ import annotations

from tortoise import Tortoise


async def _column_exists(table: str, column: str) -> bool:
    conn = Tortoise.get_connection("default")
    rows = await conn.execute_query_dict(f"PRAGMA table_info({table})")
    return any(r.get("name") == column for r in rows)


async def _table_exists(table: str) -> bool:
    conn = Tortoise.get_connection("default")
    rows = await conn.execute_query_dict(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'"
    )
    return bool(rows)


async def ensure_defaults() -> None:
    if not await _column_exists("tasks", "due_time"):
        conn = Tortoise.get_connection("default")
        await conn.execute_query("ALTER TABLE tasks ADD COLUMN due_time VARCHAR(5) NULL")
    if not await _column_exists("checklist_tasks", "days_of_week"):
        conn = Tortoise.get_connection("default")
        await conn.execute_query(
            "ALTER TABLE checklist_tasks ADD COLUMN days_of_week VARCHAR(32) DEFAULT '0,1,2,3,4,5,6'"
        )
    if not await _column_exists("tasks", "assignee_vk_ids"):
        conn = Tortoise.get_connection("default")
        await conn.execute_query("ALTER TABLE tasks ADD COLUMN assignee_vk_ids JSON DEFAULT '[]'")
    if not await _column_exists("checklist_cells", "proof_urls"):
        conn = Tortoise.get_connection("default")
        await conn.execute_query("ALTER TABLE checklist_cells ADD COLUMN proof_urls JSON DEFAULT '[]'")
    if not await _column_exists("checklist_cells", "proof_video_url"):
        conn = Tortoise.get_connection("default")
        await conn.execute_query("ALTER TABLE checklist_cells ADD COLUMN proof_video_url VARCHAR(1024) NULL")
    if not await _column_exists("staff_notes", "leader_position"):
        conn = Tortoise.get_connection("default")
        await conn.execute_query(
            "ALTER TABLE staff_notes ADD COLUMN leader_position TEXT NOT NULL DEFAULT ''"
        )
    if not await _column_exists("staff_notes", "leader_note"):
        conn = Tortoise.get_connection("default")
        await conn.execute_query(
            "ALTER TABLE staff_notes ADD COLUMN leader_note TEXT NOT NULL DEFAULT ''"
        )

    if await _table_exists("question_banks"):
        conn = Tortoise.get_connection("default")
        for col, ddl in (
            ("min_submit_level", "ALTER TABLE question_banks ADD COLUMN min_submit_level INTEGER NOT NULL DEFAULT 1"),
            ("min_approve_level", "ALTER TABLE question_banks ADD COLUMN min_approve_level INTEGER NOT NULL DEFAULT 3"),
        ):
            if not await _column_exists("question_banks", col):
                await conn.execute_query(ddl)
    if await _table_exists("question_bank_items"):
        conn = Tortoise.get_connection("default")
        for col, ddl in (
            ("answer_comment", "ALTER TABLE question_bank_items ADD COLUMN answer_comment TEXT NOT NULL DEFAULT ''"),
            ("difficulty", "ALTER TABLE question_bank_items ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 3"),
            ("status", "ALTER TABLE question_bank_items ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'draft'"),
            ("reviewed_by_vk_id", "ALTER TABLE question_bank_items ADD COLUMN reviewed_by_vk_id BIGINT NULL"),
            ("reviewed_at", "ALTER TABLE question_bank_items ADD COLUMN reviewed_at TIMESTAMP NULL"),
            ("review_note", "ALTER TABLE question_bank_items ADD COLUMN review_note TEXT NOT NULL DEFAULT ''"),
        ):
            if not await _column_exists("question_bank_items", col):
                await conn.execute_query(ddl)
        if await _column_exists("question_bank_items", "verification_status") and await _column_exists(
            "question_bank_items", "status"
        ):
            await conn.execute_query(
                "UPDATE question_bank_items SET status = CASE verification_status "
                "WHEN 'approved' THEN 'confirmed' WHEN 'rejected' THEN 'rejected' ELSE 'pending' END "
                "WHERE status = 'draft' AND verification_status IS NOT NULL AND verification_status != ''"
            )
            await conn.execute_query(
                "UPDATE question_bank_items SET verification_status = 'pending' "
                "WHERE verification_status IS NULL OR verification_status = ''"
            )
        if not await _column_exists("question_bank_items", "verification_status"):
            await conn.execute_query(
                "ALTER TABLE question_bank_items ADD COLUMN verification_status VARCHAR(16) NOT NULL DEFAULT 'pending'"
            )
        if not await _column_exists("question_bank_items", "verified_by_vk_id"):
            await conn.execute_query(
                "ALTER TABLE question_bank_items ADD COLUMN verified_by_vk_id BIGINT NULL"
            )
        if not await _column_exists("question_bank_items", "verified_at"):
            await conn.execute_query(
                "ALTER TABLE question_bank_items ADD COLUMN verified_at TIMESTAMP NULL"
            )
        if await _column_exists("question_bank_items", "question_type"):
            await conn.execute_query(
                "UPDATE question_bank_items SET question_type = '' WHERE question_type IS NULL"
            )
        if not await _column_exists("question_bank_items", "question_type"):
            await conn.execute_query(
                "ALTER TABLE question_bank_items ADD COLUMN question_type VARCHAR(64) NOT NULL DEFAULT ''"
            )
        if not await _column_exists("question_bank_items", "sort_order"):
            await conn.execute_query(
                "ALTER TABLE question_bank_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"
            )
        if not await _column_exists("question_bank_items", "is_active"):
            await conn.execute_query(
                "ALTER TABLE question_bank_items ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"
            )
