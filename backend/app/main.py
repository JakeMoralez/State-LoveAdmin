"""State Love Admin API."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from tortoise.contrib.fastapi import register_tortoise

from app.config import (
    BOT_DATABASE_URL,
    DEFAULT_SERVER_ID,
    PANEL_BASE_URL,
    PANEL_DATABASE_URL,
    TASK_REMINDER_INTERVAL_SEC,
    TORTOISE_ORM,
    UPLOAD_DIR,
    is_postgres_url,
    is_sqlite_url,
    sqlite_file_path,
)
from app.routers.uploads import regenerate_all_gallery_pages
from app.routers import (
    activity,
    assign,
    auth,
    cases,
    checklist,
    dashboard,
    dev,
    forum_judge_list,
    internal,
    profile,
    projects,
    question_banks,
    spheres,
    staff,
    tasks,
    uploads,
)
from app.services.bootstrap import ensure_defaults
from app.services.error_log import record_server_exception
from app.services.staff import list_staff
from app.services.task_notifications import run_task_reminders

logger = logging.getLogger(__name__)


async def _task_reminder_loop() -> None:
    await asyncio.sleep(30)
    while True:
        try:
            await run_task_reminders()
        except Exception as exc:
            logger.warning("task reminder loop: %s", exc)
        await asyncio.sleep(max(300, TASK_REMINDER_INTERVAL_SEC))


@asynccontextmanager
async def lifespan(app: FastAPI):
    if is_sqlite_url(PANEL_DATABASE_URL):
        db_path = sqlite_file_path(PANEL_DATABASE_URL)
        if db_path and not db_path.startswith(":"):
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    await ensure_defaults()
    galleries = regenerate_all_gallery_pages()
    staff_rows = await list_staff(DEFAULT_SERVER_ID)
    if is_sqlite_url(BOT_DATABASE_URL):
        bot_db = sqlite_file_path(BOT_DATABASE_URL)
        logger.info(
            "Startup: bot_db=%s server_id=%s staff=%d galleries=%d",
            bot_db,
            DEFAULT_SERVER_ID,
            len(staff_rows),
            galleries,
        )
        if bot_db and not bot_db.startswith(":") and not Path(bot_db).exists():
            logger.warning(
                "BOT_DATABASE_URL points to missing file: %s — staff list will be empty; "
                "set the same path as bot DATABASE_URL",
                bot_db,
            )
    else:
        logger.info(
            "Startup: bot_db=postgresql server_id=%s staff=%d galleries=%d",
            DEFAULT_SERVER_ID,
            len(staff_rows),
            galleries,
        )
    reminder_task = asyncio.create_task(_task_reminder_loop())
    try:
        yield
    finally:
        reminder_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await reminder_task


app = FastAPI(title="State Love Admin", version="0.1.0", lifespan=lifespan)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    if isinstance(exc, RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": exc.errors()})
    await record_server_exception(request, exc)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


register_tortoise(
    app,
    config=TORTOISE_ORM,
    generate_schemas=True,
    add_exception_handlers=True,
)

origins = [
    PANEL_BASE_URL.rstrip("/"),
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5180",
    "http://127.0.0.1:5180",
    "https://love.vlesnix.site",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(internal.router)
app.include_router(staff.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(dashboard.router)
app.include_router(profile.router)

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.include_router(uploads.router)
app.include_router(spheres.router)
app.include_router(checklist.router)
app.include_router(question_banks.router)
app.include_router(forum_judge_list.router)
app.include_router(assign.router)
app.include_router(activity.router)
app.include_router(dev.router)
app.include_router(cases.router)


@app.get("/api/health")
async def health():
    bot_db_exists: bool | None = None
    bot_db_label = BOT_DATABASE_URL
    if is_sqlite_url(BOT_DATABASE_URL):
        bot_db = sqlite_file_path(BOT_DATABASE_URL)
        bot_db_label = bot_db or BOT_DATABASE_URL
        bot_db_exists = bool(bot_db and not bot_db.startswith(":") and Path(bot_db).exists())
    elif is_postgres_url(BOT_DATABASE_URL):
        bot_db_label = "postgresql"
        bot_db_exists = True
    try:
        staff_count = len(await list_staff(DEFAULT_SERVER_ID))
    except Exception:
        staff_count = -1
    return {
        "ok": True,
        "server_id": DEFAULT_SERVER_ID,
        "bot_db": bot_db_label,
        "bot_db_exists": bot_db_exists,
        "staff_count": staff_count,
    }
