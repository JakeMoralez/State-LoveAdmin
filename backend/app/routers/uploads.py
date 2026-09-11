"""File uploads (screenshots + galleries) + authenticated file serve."""

from __future__ import annotations

import json
import mimetypes
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from app.config import UPLOAD_DIR
from app.services import messages
from app.services.auth import require_ca_user
from app.services.gallery_viewer import render_gallery_html

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
# Отдача /uploads/* — только с сессией портала (не публичный StaticFiles).
serve_router = APIRouter(tags=["uploads-serve"])

ALLOWED = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_BYTES = 8 * 1024 * 1024
MAX_GALLERY_IMAGES = 20
GALLERY_ID_RE = re.compile(r"^[a-f0-9]{32}$")
SAFE_UPLOAD_NAME = re.compile(r"^[a-zA-Z0-9._\-/]+$")


def _galleries_root() -> Path:
    return UPLOAD_DIR / "galleries"


def _gallery_dir(gallery_id: str) -> Path:
    return _galleries_root() / gallery_id


def gallery_public_url(gallery_id: str) -> str:
    return f"/uploads/galleries/{gallery_id}/index.html"


def is_gallery_url(url: str | None) -> bool:
    return bool(url and "/uploads/galleries/" in url)


def gallery_id_from_url(url: str | None) -> str | None:
    if not url:
        return None
    match = re.search(r"/uploads/galleries/([a-f0-9]{32})", url)
    if not match:
        return None
    gid = match.group(1)
    return gid if GALLERY_ID_RE.match(gid) else None


def _read_manifest(gdir: Path) -> list[str]:
    manifest_path = gdir / "manifest.json"
    if not manifest_path.exists():
        return []
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    images = data.get("images", [])
    return [str(name) for name in images if str(name).strip()]


def _image_public_urls(gallery_id: str, filenames: list[str]) -> list[str]:
    return [f"/uploads/galleries/{gallery_id}/{name}" for name in filenames]


def gallery_image_urls(proof_url: str | None) -> list[str]:
    gallery_id = gallery_id_from_url(proof_url)
    if not gallery_id:
        return []
    filenames = _read_manifest(_gallery_dir(gallery_id))
    return _image_public_urls(gallery_id, filenames)


def _resolve_upload_path(file_path: str) -> Path:
    """Resolve path under UPLOAD_DIR; reject traversal / odd names."""
    raw = (file_path or "").strip().lstrip("/")
    if not raw or ".." in raw.split("/") or not SAFE_UPLOAD_NAME.match(raw):
        raise HTTPException(status_code=404, detail="Not found")
    base = UPLOAD_DIR.resolve()
    target = (UPLOAD_DIR / raw).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return target


def _write_gallery_files(gdir: Path, filenames: list[str]) -> None:
    gdir.mkdir(parents=True, exist_ok=True)
    gallery_id = gdir.name
    (gdir / "manifest.json").write_text(
        json.dumps({"images": filenames}, ensure_ascii=False),
        encoding="utf-8",
    )
    (gdir / "index.html").write_text(
        render_gallery_html(gallery_id, filenames),
        encoding="utf-8",
    )


def regenerate_all_gallery_pages() -> int:
    """Rebuild viewer HTML for every existing gallery (after viewer updates)."""
    root = _galleries_root()
    if not root.exists():
        return 0
    updated = 0
    for gdir in root.iterdir():
        if not gdir.is_dir() or not GALLERY_ID_RE.match(gdir.name):
            continue
        filenames = _read_manifest(gdir)
        if not filenames:
            continue
        _write_gallery_files(gdir, filenames)
        updated += 1
    return updated


async def _save_upload(file: UploadFile) -> tuple[bytes, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail=messages.UPLOAD_NO_FILE)
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail=messages.UPLOAD_BAD_TYPE)
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=messages.UPLOAD_TOO_LARGE)
    return data, ext


@serve_router.get("/uploads/{file_path:path}")
async def serve_uploaded_file(
    file_path: str,
    user: dict = Depends(require_ca_user),
):
    """Скрины/галереи — только с сессией портала (уровень ПС+)."""
    del user
    path = _resolve_upload_path(file_path)
    media_type, _ = mimetypes.guess_type(str(path))
    headers: dict[str, str] = {"Cache-Control": "private, max-age=3600"}
    if path.suffix.lower() in {".html", ".htm"}:
        headers["Cache-Control"] = "private, no-store"
    return FileResponse(
        path,
        media_type=media_type or "application/octet-stream",
        headers=headers,
    )


async def uploads_http_exception_handler(request: Request, exc: HTTPException):
    """Для вкладки /uploads без cookie — простая HTML-страница вместо JSON."""
    if request.url.path.startswith("/uploads/") and "text/html" in (
        request.headers.get("accept") or ""
    ):
        return HTMLResponse(
            status_code=exc.status_code,
            content=(
                "<!doctype html><meta charset=utf-8>"
                "<title>Нужен вход</title>"
                "<body style=\"font-family:system-ui;padding:2rem\">"
                "<h1>Нужен вход</h1>"
                "<p>Чтобы открыть файл, войдите на портал State Love.</p>"
                "<p><a href=\"/\">На главную</a></p>"
                f"<p style=\"color:#666\">{exc.detail}</p>"
                "</body>"
            ),
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    user: dict = Depends(require_ca_user),
):
    data, ext = await _save_upload(file)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    path = UPLOAD_DIR / name
    path.write_bytes(data)

    return {
        "url": f"/uploads/{name}",
        "filename": file.filename,
        "size": len(data),
    }


@router.post("/gallery")
async def upload_gallery(
    files: list[UploadFile] = File(...),
    gallery_id: str | None = Query(None),
    user: dict = Depends(require_ca_user),
):
    if not files:
        raise HTTPException(status_code=400, detail=messages.UPLOAD_NEED_IMAGE)

    gid = gallery_id if gallery_id and GALLERY_ID_RE.match(gallery_id) else uuid.uuid4().hex
    gdir = _gallery_dir(gid)
    stored = _read_manifest(gdir) if gdir.exists() else []

    for file in files:
        if len(stored) >= MAX_GALLERY_IMAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Максимум {MAX_GALLERY_IMAGES} фото в альбоме",
            )
        data, ext = await _save_upload(file)
        fname = f"{uuid.uuid4().hex}{ext}"
        gdir.mkdir(parents=True, exist_ok=True)
        (gdir / fname).write_bytes(data)
        stored.append(fname)

    _write_gallery_files(gdir, stored)
    image_urls = _image_public_urls(gid, stored)

    return {
        "gallery_id": gid,
        "url": gallery_public_url(gid),
        "count": len(stored),
        "images": image_urls,
    }
