"""State Love Admin API."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from tortoise.contrib.fastapi import register_tortoise

from app.config import PANEL_BASE_URL, PANEL_DATABASE_URL, TORTOISE_ORM, UPLOAD_DIR
from app.routers.uploads import regenerate_all_gallery_pages
from app.routers import auth, checklist, dashboard, dev, internal, profile, projects, staff, tasks, uploads
from app.services.bootstrap import ensure_defaults
from app.services.error_log import record_server_exception


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_path = PANEL_DATABASE_URL.replace("sqlite://", "")
    if db_path and not db_path.startswith(":"):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    await ensure_defaults()
    regenerate_all_gallery_pages()
    yield


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
app.include_router(checklist.router)
app.include_router(dev.router)


@app.get("/api/health")
async def health():
    return {"ok": True}
