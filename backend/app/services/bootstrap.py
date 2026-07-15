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
    from app.config import PANEL_DATABASE_URL

    if not is_sqlite_url(PANEL_DATABASE_URL):
        return

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
    if not await _column_exists("staff_notes", "spheres"):
        conn = Tortoise.get_connection("default")
        await conn.execute_query(
            "ALTER TABLE staff_notes ADD COLUMN spheres JSON DEFAULT '[]'"
        )

    if await _table_exists("question_banks"):
        conn = Tortoise.get_connection("default")
        for col, ddl in (
            ("min_submit_level", "ALTER TABLE question_banks ADD COLUMN min_submit_level INTEGER NOT NULL DEFAULT 1"),
            ("min_approve_level", "ALTER TABLE question_banks ADD COLUMN min_approve_level INTEGER NOT NULL DEFAULT 3"),
            ("emoji", "ALTER TABLE question_banks ADD COLUMN emoji VARCHAR(16) NOT NULL DEFAULT ''"),
            (
                "contributor_visibility",
                "ALTER TABLE question_banks ADD COLUMN contributor_visibility VARCHAR(32) NOT NULL DEFAULT 'own_workflow'",
            ),
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

    _sphere_tables = (
        "tasks",
        "projects",
        "checklist_cells",
        "checklist_tasks",
        "checklist_week_tasks",
        "checklist_week_members",
        "checklist_members",
        "question_banks",
    )
    conn = Tortoise.get_connection("default")
    for table in _sphere_tables:
        if await _table_exists(table) and not await _column_exists(table, "sphere"):
            await conn.execute_query(
                f"ALTER TABLE {table} ADD COLUMN sphere VARCHAR(64) NOT NULL DEFAULT 'central_apparatus'"
            )
            await conn.execute_query(
                f"UPDATE {table} SET sphere = 'central_apparatus' WHERE sphere IS NULL OR sphere = ''"
            )

    await _migrate_checklist_sphere_uniques(conn)
    await _migrate_staff_spheres_v1(conn)
    await _migrate_work_item_spheres_v1(conn)
    await _migrate_staff_spheres_v2(conn)
    await _migrate_work_item_spheres_v2(conn)


async def _migrate_work_item_spheres_v1(conn) -> None:
    """Нормализовать sphere у задач, проектов и банков (legacy → central_apparatus и т.д.)."""
    from app.services.sphere_work import normalize_stored_work_sphere

    key = "work_item_spheres_v1"
    if await _migration_done(conn, key):
        return

    for table in ("tasks", "projects", "question_banks"):
        if not await _table_exists(table):
            continue
        if not await _column_exists(table, "sphere"):
            continue
        rows = await conn.execute_query_dict(f"SELECT id, sphere FROM {table}")
        for row in rows:
            current = row.get("sphere")
            normalized = normalize_stored_work_sphere(current)
            if normalized != (current or ""):
                await conn.execute_query(
                    f"UPDATE {table} SET sphere = ? WHERE id = ?",
                    [normalized, row["id"]],
                )

    await _mark_migration(conn, key)


async def _migrate_staff_spheres_v2(conn) -> None:
    """Исправить ошибочный дефолт v1: единственная сфера «МО» у следящих ЦА."""
    from app.models.panel import StaffNote
    from app.services.staff_spheres import CENTRAL_APPARATUS, DEFENSE

    key = "staff_spheres_v2"
    if await _migration_done(conn, key):
        return

    if not await _table_exists("staff_notes"):
        await _mark_migration(conn, key)
        return

    for panel in await StaffNote.all():
        spheres = list(panel.spheres or [])
        if spheres != [DEFENSE]:
            continue
        note = (panel.note or "").lower()
        if any(x in note for x in ("оборон", "defense", "министерство обороны")):
            continue
        panel.spheres = [CENTRAL_APPARATUS]
        await panel.save(update_fields=["spheres"])

    await _mark_migration(conn, key)


async def _migrate_work_item_spheres_v2(conn) -> None:
    """Повторная нормализация sphere: legacy-алиасы и пустые значения → канон."""
    from app.services.sphere_work import WORK_SPHERE_KEYS, normalize_stored_work_sphere

    key = "work_item_spheres_v2"
    if await _migration_done(conn, key):
        return

    allowed = set(WORK_SPHERE_KEYS)
    for table in ("tasks", "projects", "question_banks"):
        if not await _table_exists(table):
            continue
        if not await _column_exists(table, "sphere"):
            continue
        rows = await conn.execute_query_dict(f"SELECT id, sphere FROM {table}")
        for row in rows:
            current = row.get("sphere")
            cleaned = (current or "").strip()
            normalized = normalize_stored_work_sphere(current)
            if cleaned in allowed and normalized == cleaned:
                continue
            await conn.execute_query(
                f"UPDATE {table} SET sphere = ? WHERE id = ?",
                [normalized, row["id"]],
            )

    await _mark_migration(conn, key)


async def _migrate_staff_spheres_v1(conn) -> None:
    """Заполнить staff_notes.spheres из has_ca_access и legacy-заметок."""
    key = "staff_spheres_v1"
    if await _migration_done(conn, key):
        return

    from app.config import DEFAULT_SERVER_ID
    from app.services.staff import migrate_staff_spheres_to_panel

    await migrate_staff_spheres_to_panel(DEFAULT_SERVER_ID)
    await _mark_migration(conn, key)


async def _migration_done(conn, key: str) -> bool:
    if not await _table_exists("panel_migrations"):
        await conn.execute_query(
            "CREATE TABLE panel_migrations (key VARCHAR(128) PRIMARY KEY NOT NULL)"
        )
        return False
    rows = await conn.execute_query_dict(
        "SELECT 1 AS ok FROM panel_migrations WHERE key = ?", [key]
    )
    return bool(rows)


async def _mark_migration(conn, key: str) -> None:
    await conn.execute_query(
        "INSERT OR IGNORE INTO panel_migrations (key) VALUES (?)", [key]
    )


async def _unique_cols(conn, table: str) -> list[str] | None:
    indexes = await conn.execute_query_dict(f"PRAGMA index_list({table})")
    for idx in indexes:
        if not idx.get("unique"):
            continue
        info = await conn.execute_query_dict(f"PRAGMA index_info({idx['name']})")
        return [row["name"] for row in sorted(info, key=lambda r: r["seqno"])]
    return None


async def _rebuild_checklist_table(
    conn,
    *,
    table: str,
    create_sql: str,
    insert_cols: str,
    select_cols: str,
) -> None:
    tmp = f"{table}_sphere_uniq"
    await conn.execute_query(f"ALTER TABLE {table} RENAME TO {tmp}")
    await conn.execute_query(create_sql)
    await conn.execute_query(f"INSERT INTO {table} {insert_cols} SELECT {select_cols} FROM {tmp}")
    await conn.execute_query(f"DROP TABLE {tmp}")


async def _migrate_checklist_sphere_uniques(conn) -> None:
    key = "checklist_sphere_uniques_v1"
    if await _migration_done(conn, key):
        return

    migrations: list[tuple[str, list[str], str, str]] = [
        (
            "checklist_tasks",
            ["server_id", "sphere", "slug"],
            """CREATE TABLE checklist_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                server_id INT NOT NULL,
                sphere VARCHAR(64) NOT NULL DEFAULT 'central_apparatus',
                slug VARCHAR(64) NOT NULL,
                title VARCHAR(256) NOT NULL,
                is_header INT NOT NULL DEFAULT 0,
                sort_order INT NOT NULL DEFAULT 0,
                days_of_week VARCHAR(32) NOT NULL DEFAULT '0,1,2,3,4,5,6',
                UNIQUE (server_id, sphere, slug)
            )""",
            "(server_id, sphere, slug, title, is_header, sort_order, days_of_week)",
        ),
        (
            "checklist_week_tasks",
            ["server_id", "sphere", "week_start", "slug"],
            """CREATE TABLE checklist_week_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                server_id INT NOT NULL,
                sphere VARCHAR(64) NOT NULL DEFAULT 'central_apparatus',
                week_start DATE NOT NULL,
                slug VARCHAR(64) NOT NULL,
                title VARCHAR(256) NOT NULL,
                is_header INT NOT NULL DEFAULT 0,
                sort_order INT NOT NULL DEFAULT 0,
                days_of_week VARCHAR(32) NOT NULL DEFAULT '0,1,2,3,4,5,6',
                UNIQUE (server_id, sphere, week_start, slug)
            )""",
            "(server_id, sphere, week_start, slug, title, is_header, sort_order, days_of_week)",
        ),
        (
            "checklist_members",
            ["server_id", "sphere", "vk_id"],
            """CREATE TABLE checklist_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                server_id INT NOT NULL,
                sphere VARCHAR(64) NOT NULL DEFAULT 'central_apparatus',
                vk_id BIGINT NOT NULL,
                sort_order INT NOT NULL DEFAULT 0,
                UNIQUE (server_id, sphere, vk_id)
            )""",
            "(server_id, sphere, vk_id, sort_order)",
        ),
        (
            "checklist_week_members",
            ["server_id", "sphere", "week_start", "vk_id"],
            """CREATE TABLE checklist_week_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                server_id INT NOT NULL,
                sphere VARCHAR(64) NOT NULL DEFAULT 'central_apparatus',
                week_start DATE NOT NULL,
                vk_id BIGINT NOT NULL,
                sort_order INT NOT NULL DEFAULT 0,
                UNIQUE (server_id, sphere, week_start, vk_id)
            )""",
            "(server_id, sphere, week_start, vk_id, sort_order)",
        ),
        (
            "checklist_cells",
            ["server_id", "sphere", "week_start", "day_offset", "task_slug", "member_vk_id"],
            """CREATE TABLE checklist_cells (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                server_id INT NOT NULL,
                sphere VARCHAR(64) NOT NULL DEFAULT 'central_apparatus',
                week_start DATE NOT NULL,
                day_offset INT NOT NULL,
                task_slug VARCHAR(64) NOT NULL,
                member_vk_id BIGINT NOT NULL,
                proof_url VARCHAR(1024),
                proof_urls JSON DEFAULT '[]',
                proof_note TEXT NOT NULL DEFAULT '',
                proof_video_url VARCHAR(1024),
                updated_by BIGINT,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (server_id, sphere, week_start, day_offset, task_slug, member_vk_id)
            )""",
            "(server_id, sphere, week_start, day_offset, task_slug, member_vk_id, proof_url, proof_urls, proof_note, proof_video_url, updated_by, updated_at)",
        ),
    ]

    for table, expected, create_sql, col_list in migrations:
        if not await _table_exists(table):
            continue
        current = await _unique_cols(conn, table)
        if current == expected:
            continue
        cols = col_list.strip("()")
        await _rebuild_checklist_table(
            conn,
            table=table,
            create_sql=create_sql,
            insert_cols=col_list,
            select_cols=cols,
        )

    await _mark_migration(conn, key)
