"""Disabled checklist entry points. Archived implementation is intentionally retained."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from app.services.auth import require_ca_user

router = APIRouter(prefix="/api/checklist", tags=["archive"])

@router.api_route("", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def archived_checklist(path: str = "", user: dict = Depends(require_ca_user)):
    return JSONResponse(status_code=410, content={"detail": "Раздел архивирован", "archived": True})
