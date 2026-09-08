"""Academy API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import DEFAULT_SERVER_ID
from app.models.bot import AccessLevel
from app.models.panel import AcademySession
from app.services import academy as svc
from app.services.auth import require_ca_user

router = APIRouter(prefix="/api/academy", tags=["academy"])


def _require_academy(user: dict) -> dict:
    if int(user.get("access_level") or 0) < AccessLevel.PGS:
        raise HTTPException(status_code=403, detail="Академия доступна со уровня ПГС")
    return user


class EnrollBody(BaseModel):
    vk_id: int
    direction: str = "general"
    stage: str = "theory"
    mentor_vk_id: int | None = None
    enrolled_at: str | None = None
    expected_end_at: str | None = None
    note: str = ""


class CadetPatchBody(BaseModel):
    direction: str | None = None
    stage: str | None = None
    status: str | None = None
    mentor_vk_id: int | None = None
    clear_mentor: bool = False
    expected_end_at: str | None = None
    clear_expected_end: bool = False
    note: str | None = None
    points_adjust: int | None = None
    attestation_theory: int | None = None
    attestation_practice: int | None = None
    attestation_period: int | None = None
    attestation_mentor: int | None = None
    recommendation: str | None = None


class CommentBody(BaseModel):
    body: str = Field(min_length=1)


class GraduateBody(BaseModel):
    mentor_score: int | None = Field(default=None, ge=0, le=10)
    comment: str = ""


class TemplateBody(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    category: str = "theory"
    stage: str = "theory"
    max_points: int = Field(default=10, ge=1, le=20)
    due_days: int = Field(default=3, ge=1, le=30)
    required: bool = True
    description: str = ""
    proof_kinds: list[str] = Field(default_factory=lambda: ["text"])
    reviewer_kind: str = "mentor"
    is_active: bool = True
    sort_order: int = 0


class AssignmentBody(BaseModel):
    template_id: int | None = None
    title: str | None = None
    category: str | None = None
    stage: str | None = None
    max_points: int | None = Field(default=None, ge=1, le=20)
    required: bool | None = None
    description: str | None = None
    proof_kinds: list[str] | None = None
    reviewer_kind: str | None = None
    assignee_vk_ids: list[int] | None = None
    all_active: bool = False
    all_mentees: bool = False
    due_at: str | None = None
    due_days: int | None = None


class SubmitBody(BaseModel):
    body: str = ""
    proof_urls: list[str] = Field(default_factory=list)


class ReviewBody(BaseModel):
    action: str
    score: int | None = None
    comment: str = ""


class SessionBody(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    held_at: str | None = None
    notes: str = ""
    status: str = "held"
    attendance: dict[str, str] | None = None


class SessionPatchBody(BaseModel):
    title: str | None = None
    held_at: str | None = None
    notes: str | None = None
    status: str | None = None


class AttendanceBody(BaseModel):
    marks: dict[str, str]


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


@router.get("/meta")
async def academy_meta(user: dict = Depends(require_ca_user)):
    _require_academy(user)
    return svc.labels_payload()


@router.get("/summary")
async def academy_summary(
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    await svc.ensure_academy_templates()
    return await svc.summary(server_id, user)


@router.get("/roster")
async def academy_roster(
    server_id: int = Query(DEFAULT_SERVER_ID),
    include_left: bool = Query(False),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    return {"members": await svc.list_roster(server_id, user, include_left=include_left)}


@router.get("/mine")
async def academy_mine(
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    return {"members": await svc.mine(server_id, user)}


@router.get("/mentors")
async def academy_mentors(
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    return {"mentors": await svc.list_mentors(server_id)}


@router.get("/reserve")
async def academy_reserve(
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    rows = await svc.list_roster(server_id, user, include_left=True)
    return {"members": [r for r in rows if r["status"] == "graduated"]}


@router.post("/cadets")
async def academy_enroll(
    body: EnrollBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        cadet = await svc.enroll(
            server_id,
            body.vk_id,
            user,
            direction=body.direction,
            stage=body.stage,
            mentor_vk_id=body.mentor_vk_id,
            enrolled_at=body.enrolled_at,
            expected_end_at=body.expected_end_at,
            note=body.note,
        )
        return await svc.serialize_cadet(cadet)
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.get("/cadets/{vk_id}")
async def academy_cadet(
    vk_id: int,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    cadet = await svc.get_cadet(server_id, vk_id)
    if not cadet:
        raise HTTPException(status_code=404, detail="Академик не найден")
    if not svc.can_view_cadet(user, cadet):
        raise HTTPException(status_code=403, detail="Нет доступа к этой карточке")
    data = await svc.serialize_cadet(cadet)
    data["events"] = await svc.list_events(cadet)
    from app.models.panel import AcademyWarning

    warns = await AcademyWarning.filter(cadet_id=cadet.id).order_by("-created_at")
    data["warnings"] = [
        {
            "id": w.id,
            "author_vk_id": w.author_vk_id,
            "body": w.body,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in warns
    ]
    data["attestation_suggest"] = svc.suggest_attestation(data["metrics"] or {})
    data["can_manage"] = svc.can_manage_cadet(user, cadet)
    data["is_self"] = int(user["vk_id"]) == int(cadet.vk_id)
    assignments = await svc.list_assignments(server_id, user)
    own = []
    for row in assignments:
        ids = [int(v) for v in (row.get("assignee_vk_ids") or [])]
        if int(vk_id) not in ids:
            continue
        reports = [r for r in (row.get("reports") or []) if r and int(r.get("vk_id") or 0) == int(vk_id)]
        own.append({**row, "reports": reports})
    data["assignments"] = own
    return data


@router.patch("/cadets/{vk_id}")
async def academy_patch_cadet(
    vk_id: int,
    body: CadetPatchBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        cadet = await svc.require_cadet(server_id, vk_id)
        mentor: int | None | object = ...
        if body.clear_mentor:
            mentor = None
        elif "mentor_vk_id" in body.model_fields_set:
            mentor = body.mentor_vk_id
        expected: str | None | object = ...
        if body.clear_expected_end:
            expected = None
        elif "expected_end_at" in body.model_fields_set:
            expected = body.expected_end_at
        cadet = await svc.update_cadet(
            cadet,
            user,
            direction=body.direction,
            stage=body.stage,
            status=body.status,
            mentor_vk_id=mentor,
            expected_end_at=expected,
            note=body.note,
            points_adjust=body.points_adjust,
            attestation_theory=body.attestation_theory,
            attestation_practice=body.attestation_practice,
            attestation_period=body.attestation_period,
            attestation_mentor=body.attestation_mentor,
            recommendation=body.recommendation,
        )
        return await svc.serialize_cadet(cadet)
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.post("/cadets/{vk_id}/graduate")
async def academy_graduate(
    vk_id: int,
    body: GraduateBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        cadet = await svc.require_cadet(server_id, vk_id)
        cadet = await svc.graduate(cadet, user, mentor_score=body.mentor_score, comment=body.comment)
        return await svc.serialize_cadet(cadet)
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.post("/cadets/{vk_id}/comments")
async def academy_comment(
    vk_id: int,
    body: CommentBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        cadet = await svc.require_cadet(server_id, vk_id)
        await svc.add_comment(cadet, user, body.body)
        return {"ok": True}
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.post("/cadets/{vk_id}/warnings")
async def academy_warning(
    vk_id: int,
    body: CommentBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        cadet = await svc.require_cadet(server_id, vk_id)
        await svc.add_warning(cadet, user, body.body)
        return {"ok": True}
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.get("/templates")
async def academy_templates(user: dict = Depends(require_ca_user)):
    _require_academy(user)
    await svc.ensure_academy_templates()
    return {"templates": await svc.list_templates(include_inactive=svc.is_academy_lead(user))}


@router.post("/templates")
async def academy_create_template(body: TemplateBody, user: dict = Depends(require_ca_user)):
    _require_academy(user)
    try:
        row = await svc.upsert_template(user, body.model_dump())
        return svc.serialize_template(row)
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.patch("/templates/{template_id}")
async def academy_update_template(
    template_id: int,
    body: TemplateBody,
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        row = await svc.upsert_template(user, body.model_dump(), template_id=template_id)
        return svc.serialize_template(row)
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.get("/assignments")
async def academy_assignments(
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    return {"assignments": await svc.list_assignments(server_id, user)}


@router.get("/reviews")
async def academy_reviews(
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    return {"items": await svc.pending_reviews(server_id, user)}


@router.post("/assignments")
async def academy_create_assignment(
    body: AssignmentBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        row = await svc.create_assignment(server_id, user, **body.model_dump())
        return await svc.serialize_assignment(row, viewer=user)
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.post("/assignments/{assignment_id}/submit")
async def academy_submit(
    assignment_id: int,
    body: SubmitBody,
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        report = await svc.submit_report(
            assignment_id,
            user,
            body=body.body,
            proof_urls=body.proof_urls,
        )
        return svc._report_payload(report)
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.post("/assignments/{assignment_id}/review/{vk_id}")
async def academy_review(
    assignment_id: int,
    vk_id: int,
    body: ReviewBody,
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        report = await svc.review_report(
            assignment_id,
            vk_id,
            user,
            action=body.action,
            score=body.score,
            comment=body.comment,
        )
        return svc._report_payload(report)
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.get("/sessions")
async def academy_sessions(
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    return {"sessions": await svc.list_sessions(server_id)}


@router.post("/sessions")
async def academy_create_session(
    body: SessionBody,
    server_id: int = Query(DEFAULT_SERVER_ID),
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    try:
        session = await svc.create_session(
            server_id,
            user,
            title=body.title,
            held_at=body.held_at,
            notes=body.notes,
            status=body.status,
            attendance={int(k): v for k, v in (body.attendance or {}).items()} or None,
        )
        rows = await svc.list_sessions(server_id)
        return next((s for s in rows if s["id"] == session.id), {"id": session.id})
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http(exc) from exc


@router.patch("/sessions/{session_id}")
async def academy_patch_session(
    session_id: int,
    body: SessionPatchBody,
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    session = await AcademySession.get_or_none(id=session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    try:
        await svc.update_session(
            session,
            user,
            title=body.title,
            notes=body.notes,
            status=body.status,
            held_at=body.held_at,
        )
        return {"ok": True}
    except (ValueError, PermissionError) as exc:
        raise _http(exc) from exc


@router.put("/sessions/{session_id}/attendance")
async def academy_attendance(
    session_id: int,
    body: AttendanceBody,
    user: dict = Depends(require_ca_user),
):
    _require_academy(user)
    session = await AcademySession.get_or_none(id=session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    try:
        await svc.set_attendance(session, user, {int(k): v for k, v in body.marks.items()})
        return {"ok": True}
    except (ValueError, PermissionError) as exc:
        raise _http(exc) from exc
