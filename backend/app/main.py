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
from starlette.exceptions import HTTPException as StarletteHTTPException
from tortoise.contrib.fastapi import register_tortoise

from app.config import (
    BOT_DATABASE_URL,
    DEFAULT_SERVER_ID,
    PANEL_BASE_URL,
    PANEL_DATABASE_URL,
    TORTOISE_ORM,
    UPLOAD_DIR,
    is_postgres_url,
    is_sqlite_url,
    sqlite_file_path,
)
from app.routers.uploads import regenerate_all_gallery_pages, uploads_http_exception_handler
from app.routers import (
    academy,
    activity,
    assign,
    auth,
    cases,
    checklist,
    dashboard,
    dev,
    forum_judge_list,
    internal,
    issuance,
    profile,
    projects,
    question_banks,
    spheres,
    staff,
    tasks,
    uploads,
)
from app.services.bootstrap import ensure_defaults
from app.services.task_helpers import migrate_legacy_task_statuses
from app.services.error_log import record_server_exception
from app.services import messages
from app.services.panel_settings import get_task_reminder_interval_sec, get_task_reminders_enabled
from app.services.request_id import (
    REQUEST_ID_HEADER,
    get_or_create_request_id,
    set_request_id,
)
from app.services.staff import count_staff
from app.services.task_notifications import run_task_reminders

logger = logging.getLogger(__name__)


async def _ensure_panel_schemas() -> None:
    """Схему создаём только для panel DB (connection default), bot.db не трогаем."""
    from tortoise import Tortoise
    from tortoise.utils import generate_schema_for_client

    conn = Tortoise.get_connection("default")
    await generate_schema_for_client(conn, safe=True)


async def _task_reminder_loop() -> None:
    await asyncio.sleep(30)
    while True:
        try:
            from app.services.task_recurrence import spawn_due_recurrences

            await spawn_due_recurrences()
        except Exception as exc:
            logger.warning("task recurrence spawn: %s", exc)
        try:
            if await get_task_reminders_enabled():
                await run_task_reminders()
        except Exception as exc:
            logger.warning("task reminder loop: %s", exc)
        try:
            interval = await get_task_reminder_interval_sec()
        except Exception:
            interval = 3600
        await asyncio.sleep(max(300, interval))


@asynccontextmanager
async def lifespan(app: FastAPI):
    if is_sqlite_url(PANEL_DATABASE_URL):
        db_path = sqlite_file_path(PANEL_DATABASE_URL)
        if db_path and not db_path.startswith(":"):
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    await _ensure_panel_schemas()
    await ensure_defaults()
    from app.services.academy import ensure_academy_templates

    await ensure_academy_templates()
    await migrate_legacy_task_statuses()
    galleries = regenerate_all_gallery_pages()
    try:
        staff_n = await count_staff(DEFAULT_SERVER_ID)
    except Exception as exc:
        staff_n = -1
        logger.warning("Startup staff count failed: %s", exc)
    if is_sqlite_url(BOT_DATABASE_URL):
        bot_db = sqlite_file_path(BOT_DATABASE_URL)
        logger.info(
            "Startup: bot_db=%s server_id=%s staff=%d galleries=%d",
            bot_db,
            DEFAULT_SERVER_ID,
            staff_n,
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
            staff_n,
            galleries,
        )
    reminder_task = asyncio.create_task(_task_reminder_loop())
    try:
        yield
    finally:
        reminder_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await reminder_task
        from app.services.http_client import close_http_client

        await close_http_client()


app = FastAPI(title="State Love Admin", version="0.1.0", lifespan=lifespan)


@app.exception_handler(StarletteHTTPException)
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException | StarletteHTTPException):
    if request.url.path.startswith("/uploads/"):
        return await uploads_http_exception_handler(
            request,
            HTTPException(status_code=exc.status_code, detail=exc.detail),
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, RequestValidationError):
        # Форма ответа прежняя ({"detail": ...}), но текст — человечный русский
        # вместо сырого списка технических ошибок pydantic.
        return JSONResponse(
            status_code=422,
            content={"detail": messages.humanize_validation(exc.errors())},
        )
    await record_server_exception(request, exc)
    from app.services.request_id import get_request_id

    rid = get_request_id()
    body: dict = {"detail": messages.INTERNAL_ERROR}
    if rid:
        body["request_id"] = rid
    return JSONResponse(status_code=500, content=body)


register_tortoise(
    app,
    config=TORTOISE_ORM,
    generate_schemas=False,
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


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    incoming = request.headers.get(REQUEST_ID_HEADER)
    set_request_id(incoming)
    rid = get_or_create_request_id()
    response = await call_next(request)
    response.headers[REQUEST_ID_HEADER] = rid
    return response


app.include_router(auth.router)
app.include_router(internal.router)
app.include_router(staff.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(dashboard.router)
app.include_router(profile.router)

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.include_router(uploads.serve_router)
app.include_router(uploads.router)
app.include_router(spheres.router)
app.include_router(checklist.router)
app.include_router(question_banks.router)
app.include_router(forum_judge_list.router)
app.include_router(assign.router)
app.include_router(academy.router)
app.include_router(issuance.router)
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
        staff_count = await count_staff(DEFAULT_SERVER_ID)
    except Exception:
        staff_count = -1
    return {
        "ok": True,
        "server_id": DEFAULT_SERVER_ID,
        "bot_db": bot_db_label,
        "bot_db_exists": bot_db_exists,
        "staff_count": staff_count,
    }
