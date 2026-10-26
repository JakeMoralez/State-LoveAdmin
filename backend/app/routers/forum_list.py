"""Forum BBCode generation; never publishes or modifies upstream people."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from app.services.auth import require_ca_user
from app.services import forum_list as svc
from app.services import forum_list_data as engine

router = APIRouter(prefix="/api/forum/list", tags=["forum-list"])


class SettingsBody(BaseModel):
    version: int = Field(ge=0)
    template: str | None = Field(default=None, max_length=engine.MAX_TEMPLATE)
    mappings: dict[str, int] | None = None
    reset: bool = False


class PreviewBody(BaseModel):
    template: str | None = Field(default=None, max_length=engine.MAX_TEMPLATE)


class ImportBody(BaseModel):
    template: str = Field(max_length=engine.MAX_TEMPLATE)
    mappings: dict[str, int] = Field(default_factory=dict)


@router.get("")
async def get_list(user=Depends(require_ca_user)):
    if svc.FORUM_LIST_API_KEY:
        await svc.start_refresh()
    return await svc.state()


@router.get("/settings")
async def get_settings(user=Depends(require_ca_user)):
    return (await svc.state())["settings"]


@router.put("/settings")
async def put_settings(body: SettingsBody, user=Depends(require_ca_user)):
    return await svc.save(user, body.version, body.template, body.mappings, body.reset)


@router.post("/render")
async def render_list(body: PreviewBody, user=Depends(require_ca_user)):
    return await svc.preview(user, body.template)


@router.post("/refresh", status_code=202)
async def refresh_list(user=Depends(require_ca_user)):
    await svc.start_refresh(force=True)
    return await svc.state()


@router.post("/import")
async def import_template(body: ImportBody, user=Depends(require_ca_user)):
    svc.require_editor(user)
    _, snapshot = await svc.rows()
    data = svc.current_data(snapshot)
    if not data:
        from fastapi import HTTPException
        raise HTTPException(409, "Сначала загрузите полный снимок из API.")
    return engine.import_legacy(body.template, data, body.mappings)
