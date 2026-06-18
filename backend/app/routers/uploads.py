"""File uploads (screenshots + galleries)."""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from app.services.gallery_viewer import render_gallery_html

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.config import UPLOAD_DIR
from app.services.auth import require_ca_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_BYTES = 8 * 1024 * 1024
MAX_GALLERY_IMAGES = 20
GALLERY_ID_RE = re.compile(r"^[a-f0-9]{32}$")


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
        raise HTTPException(status_code=400, detail="Файл не выбран")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Допустимы PNG, JPG, GIF, WebP")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Максимум 8 МБ на файл")
    return data, ext


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
        raise HTTPException(status_code=400, detail="Выберите хотя бы один скрин")

    gid = gallery_id if gallery_id and GALLERY_ID_RE.match(gallery_id) else uuid.uuid4().hex
    gdir = _gallery_dir(gid)
    stored = _read_manifest(gdir) if gdir.exists() else []

    for file in files:
        if len(stored) >= MAX_GALLERY_IMAGES:
            raise HTTPException(status_code=400, detail=f"Максимум {MAX_GALLERY_IMAGES} фото в альбоме")
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
