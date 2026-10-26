"""Retire projects without deleting tasks. Dry run unless --apply is supplied."""
from __future__ import annotations

import argparse
from contextlib import closing
import asyncio
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import unquote, urlsplit
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import PANEL_DATABASE_URL, is_sqlite_url, sqlite_file_path
from tortoise import Tortoise
from tortoise.transactions import in_transaction


def quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


async def retire(apply: bool, backup_dir: Path) -> dict:
    await Tortoise.init(db_url=PANEL_DATABASE_URL, modules={"models": ["app.models.panel"]})
    try:
        conn = Tortoise.get_connection("default")
        sqlite = is_sqlite_url(PANEL_DATABASE_URL)
        table_rows = await conn.execute_query_dict(
            "SELECT name FROM sqlite_master WHERE type='table'" if sqlite else
            "SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public'"
        )
        tables = {r["name"] for r in table_rows}
        columns = {}
        for table in ("tasks", "task_recurrences"):
            if table not in tables:
                continue
            rows = await conn.execute_query_dict(
                f"PRAGMA table_info({quote(table)})" if sqlite else
                f"SELECT column_name AS name FROM information_schema.columns WHERE table_schema='public' AND table_name='{table}'"
            )
            columns[table] = {r["name"] for r in rows}
        payload = {t: await conn.execute_query_dict(f"SELECT * FROM {quote(t)}")
                   for t in ("projects", "project_members") if t in tables}
        links = {t: await conn.execute_query_dict(f"SELECT id, project_id FROM {quote(t)} WHERE project_id IS NOT NULL")
                 for t, cols in columns.items() if "project_id" in cols}
        conflicts = {}
        if "projects" in tables:
            for table in links:
                conflicts[table] = await conn.execute_query_dict(
                    f"SELECT t.id, t.sphere AS task_sphere, p.sphere AS project_sphere FROM {quote(table)} t JOIN projects p ON p.id=t.project_id WHERE t.sphere<>p.sphere"
                )
        report = {"apply": apply, "project_rows": {t: len(v) for t, v in payload.items()},
                  "linked_rows": {t: len(v) for t, v in links.items()},
                  "sphere_mismatches": {t: len(v) for t, v in conflicts.items()},
                  "scope_policy": "preserve_task_server_sphere_and_audience"}
        if not apply or (not payload and not links):
            return report
        backup_dir.mkdir(parents=True, exist_ok=True)
        stem = backup_dir / ("before-project-retirement-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8])
        if sqlite:
            source = Path(sqlite_file_path(PANEL_DATABASE_URL)).resolve()
            with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as src, closing(sqlite3.connect(str(stem) + ".sqlite3")) as dst:
                src.backup(dst)
            full_backup = str(stem) + ".sqlite3"
        else:
            executable = shutil.which("pg_dump")
            if not executable:
                raise RuntimeError("pg_dump is required for a complete PostgreSQL backup; no database changes were made")
            parsed = urlsplit(PANEL_DATABASE_URL.replace("postgres://", "postgresql://", 1))
            env = dict(os.environ, PGHOST=parsed.hostname or "localhost", PGPORT=str(parsed.port or 5432),
                       PGUSER=unquote(parsed.username or ""), PGPASSWORD=unquote(parsed.password or ""), PGDATABASE=unquote(parsed.path.lstrip("/")))
            full_backup = str(stem) + ".dump"
            result = subprocess.run([executable, "--format=custom", "--file", full_backup], env=env, capture_output=True)
            if result.returncode:
                raise RuntimeError("PostgreSQL backup failed; no database changes were made")
        with Path(str(stem) + ".json").open("x", encoding="utf-8") as file:
            json.dump({"report": report, "projects": payload, "task_links": links, "sphere_mismatches": conflicts}, file, ensure_ascii=False, indent=2, default=str)
        async with in_transaction() as tx:
            preserved_tables = [t for t in ("tasks", "task_recurrences", "task_comments", "task_attachments", "task_notification_log") if t in tables]
            before = {t: (await tx.execute_query_dict(f"SELECT COUNT(*) AS n FROM {quote(t)}"))[0]["n"] for t in preserved_tables}
            for table in links:
                await tx.execute_query(f"UPDATE {quote(table)} SET project_id=NULL WHERE project_id IS NOT NULL")
                if sqlite:
                    indexes = await tx.execute_query_dict(f"PRAGMA index_list({quote(table)})")
                    for index in indexes:
                        info = await tx.execute_query_dict(f"PRAGMA index_info({quote(index['name'])})")
                        if any(i["name"] == "project_id" for i in info):
                            await tx.execute_query(f"DROP INDEX {quote(index['name'])}")
                await tx.execute_query(f"ALTER TABLE {quote(table)} DROP COLUMN project_id")
            for table in ("project_members", "projects"):
                if table in tables:
                    await tx.execute_query(f"DROP TABLE {quote(table)}")
            after = {t: (await tx.execute_query_dict(f"SELECT COUNT(*) AS n FROM {quote(t)}"))[0]["n"] for t in preserved_tables}
            if before != after:
                raise RuntimeError("Task data counts changed; transaction rolled back")
        return {**report, "backup": full_backup, "preserved_counts": after, "completed": True}
    finally:
        await Tortoise.close_connections()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-dir", type=Path, default=ROOT / "data" / "backups")
    args = parser.parse_args()
    print(json.dumps(asyncio.run(retire(args.apply, args.backup_dir)), ensure_ascii=False, indent=2))
