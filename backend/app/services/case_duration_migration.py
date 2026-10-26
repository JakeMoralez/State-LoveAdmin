"""One-time panel migration. A complete backup must succeed before changing cases."""

from __future__ import annotations

import asyncio
import os
import shutil
import sqlite3
import subprocess
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit
from uuid import uuid4

from tortoise import Tortoise
from tortoise.transactions import in_transaction

KEY = "case_duration_14_seconds_v1"


def backup_panel(url: str, directory: Path) -> Path:
    from app.config import is_sqlite_url, sqlite_file_path

    directory.mkdir(parents=True, exist_ok=True)
    stem = directory / ("before-case-duration-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8])
    if is_sqlite_url(url):
        source = Path(sqlite_file_path(url)).resolve()
        destination = stem.with_suffix(".sqlite3")
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as src, closing(sqlite3.connect(destination)) as dst:
            src.backup(dst)
        return destination
    executable = shutil.which("pg_dump")
    if not executable:
        raise RuntimeError("pg_dump is required before migrating case durations; no durations changed")
    parsed = urlsplit(url.replace("postgres://", "postgresql://", 1))
    env = dict(os.environ, PGHOST=parsed.hostname or "localhost", PGPORT=str(parsed.port or 5432),
               PGUSER=unquote(parsed.username or ""), PGPASSWORD=unquote(parsed.password or ""), PGDATABASE=unquote(parsed.path.lstrip("/")))
    destination = stem.with_suffix(".dump")
    result = subprocess.run([executable, "--format=custom", "--file", str(destination)], env=env, capture_output=True)
    if result.returncode:
        raise RuntimeError("Panel backup failed; no case durations changed")
    return destination


async def migrate_case_duration(url: str, directory: Path) -> Path | None:
    from app.config import is_sqlite_url

    conn = Tortoise.get_connection("default")
    sqlite = is_sqlite_url(url)
    placeholder = "?" if sqlite else "$1"
    await conn.execute_query("CREATE TABLE IF NOT EXISTS panel_migrations (key VARCHAR(128) PRIMARY KEY NOT NULL)")
    if await conn.execute_query_dict(f"SELECT key FROM panel_migrations WHERE key={placeholder}", [KEY]):
        return None
    backup = await asyncio.to_thread(backup_panel, url, directory)
    async with in_transaction("default") as tx:
        # Serialize competing startup workers before checking the ledger again.
        if not sqlite:
            await tx.execute_query("LOCK TABLE panel_migrations IN EXCLUSIVE MODE")
        else:
            await tx.execute_query("UPDATE panel_migrations SET key=key WHERE key=?", [KEY])
        if await tx.execute_query_dict(f"SELECT key FROM panel_migrations WHERE key={placeholder}", [KEY]):
            return backup
        await tx.execute_query("UPDATE loot_cases SET spin_duration_ms=14000 WHERE spin_duration_ms=28000")
        await tx.execute_query(f"INSERT INTO panel_migrations (key) VALUES ({placeholder})", [KEY])
    return backup
