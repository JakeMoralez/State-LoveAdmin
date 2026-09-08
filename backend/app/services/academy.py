"""Академия следящих — зачисление, этапы, задания, резерв."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from tortoise.expressions import Q

from app.config import DEFAULT_SERVER_ID
from app.models.bot import AccessLevel, UserServerAccess
from app.models.panel import (
    AcademyAssignment,
    AcademyAssignmentTemplate,
    AcademyAttendance,
    AcademyCadet,
    AcademyEvent,
    AcademyReport,
    AcademySession,
    AcademyWarning,
)
from app.services.access import get_access_level
from app.services.audit import log_audit
from app.services.display_names import resolve_bot_nickname, resolve_display_names, resolve_vk_photos
from app.services.staff_permissions import ASSIGN_STAFF_MIN_LEVEL
from app.services.vk_notify import notify_vk, notify_vk_many

LEAD_MIN_LEVEL = AccessLevel.ZGS
CADET_MAX_LEVEL = AccessLevel.SUPERVISOR

DIRECTIONS = (
    "general",
    "central_apparatus",
    "justice",
    "defense",
    "health",
    "gov_structures",
)
STAGES = ("theory", "mentored", "practice", "attestation")
STATUSES = ("active", "frozen", "graduated", "expelled")
RECOMMENDATIONS = ("none", "zgs", "priority")
CATEGORIES = ("theory", "practice", "management")
REVIEWER_KINDS = ("mentor", "academy_lead")
REPORT_STATUSES = ("pending", "accepted", "revision", "rejected")
SESSION_STATUSES = ("scheduled", "held", "cancelled")
ATTEND_STATUSES = ("present", "absent", "excused")
PROOF_KINDS = ("text", "link", "file", "proof")

DIRECTION_LABELS: dict[str, str] = {
    "general": "Подготовка ЗГС/ГС",
    "central_apparatus": "Центральный аппарат",
    "justice": "Министерство Юстиции",
    "defense": "Министерство Обороны",
    "health": "Министерство Здравоохранения",
    "gov_structures": "Правительство / госструктуры",
}
STAGE_LABELS: dict[str, str] = {
    "theory": "Теория",
    "mentored": "Работа с наставником",
    "practice": "Самостоятельная практика",
    "attestation": "Аттестация",
}
STATUS_LABELS: dict[str, str] = {
    "active": "Обучается",
    "frozen": "Заморожен",
    "graduated": "Выпускник",
    "expelled": "Отчислен",
}
REPORT_STATUS_LABELS: dict[str, str] = {
    "pending": "На проверке",
    "accepted": "Принято",
    "revision": "На доработку",
    "rejected": "Отклонено",
}
RECOMMENDATION_LABELS: dict[str, str] = {
    "none": "Без рекомендации",
    "zgs": "Рекомендован к назначению ЗГС/ГС",
    "priority": "Приоритетный кадровый резерв",
}
CATEGORY_LABELS: dict[str, str] = {
    "theory": "Теория",
    "practice": "Практика",
    "management": "Управление",
}

DEFAULT_TEMPLATES: tuple[dict[str, Any], ...] = (
    {
        "title": "Правила работы следящих",
        "category": "theory",
        "stage": "theory",
        "max_points": 10,
        "due_days": 3,
        "required": True,
        "description": "Кратко изложите правила работы следящих и приложите конспект.",
        "proof_kinds": ["text"],
        "reviewer_kind": "mentor",
        "sort_order": 10,
    },
    {
        "title": "Обязанности ЗГС и ГС сферы",
        "category": "theory",
        "stage": "theory",
        "max_points": 10,
        "due_days": 3,
        "required": True,
        "description": "Опишите обязанности ЗГС и ГС: что делегируется, за что отвечают лично.",
        "proof_kinds": ["text"],
        "reviewer_kind": "mentor",
        "sort_order": 20,
    },
    {
        "title": "Работа с лидерами",
        "category": "theory",
        "stage": "theory",
        "max_points": 10,
        "due_days": 3,
        "required": True,
        "description": "Как следящий ведёт лидеров: тон, сроки, эскалация, типичные ошибки.",
        "proof_kinds": ["text"],
        "reviewer_kind": "mentor",
        "sort_order": 30,
    },
    {
        "title": "Жалобы и форумные разделы",
        "category": "theory",
        "stage": "theory",
        "max_points": 10,
        "due_days": 3,
        "required": True,
        "description": "Разберите маршрут жалобы и какие разделы форума обязан знать ЗГС.",
        "proof_kinds": ["text", "link"],
        "reviewer_kind": "mentor",
        "sort_order": 40,
    },
    {
        "title": "Конфликты, обзвоны и отчётность",
        "category": "theory",
        "stage": "theory",
        "max_points": 10,
        "due_days": 4,
        "required": True,
        "description": "Ситуационная задача: конфликт лидеров + как провести обзвон и сдать отчёт.",
        "proof_kinds": ["text"],
        "reviewer_kind": "mentor",
        "sort_order": 50,
    },
    {
        "title": "Проверка недельного отчёта лидера",
        "category": "practice",
        "stage": "mentored",
        "max_points": 10,
        "due_days": 3,
        "required": True,
        "description": "Вместе с наставником проверьте отчёт лидера. Приложите ссылку и вывод.",
        "proof_kinds": ["link", "text"],
        "reviewer_kind": "mentor",
        "sort_order": 60,
    },
    {
        "title": "Проверка жалобы",
        "category": "practice",
        "stage": "mentored",
        "max_points": 10,
        "due_days": 3,
        "required": True,
        "description": "Разберите жалобу: факты, решение, формулировка ответа.",
        "proof_kinds": ["link", "text"],
        "reviewer_kind": "mentor",
        "sort_order": 70,
    },
    {
        "title": "Разбор спорной ситуации",
        "category": "management",
        "stage": "mentored",
        "max_points": 10,
        "due_days": 4,
        "required": True,
        "description": "Опишите спор и предложенное решение. Наставник подтверждает.",
        "proof_kinds": ["text", "link"],
        "reviewer_kind": "mentor",
        "sort_order": 80,
    },
    {
        "title": "Ответ лидеру",
        "category": "practice",
        "stage": "mentored",
        "max_points": 10,
        "due_days": 2,
        "required": False,
        "description": "Подготовьте ответ лидеру (черновик). Наставник правит тон и факты.",
        "proof_kinds": ["text"],
        "reviewer_kind": "mentor",
        "sort_order": 90,
    },
    {
        "title": "Проверка мероприятия",
        "category": "practice",
        "stage": "mentored",
        "max_points": 10,
        "due_days": 5,
        "required": False,
        "description": "Посетите или разберите мероприятие организации, приложите доказательство.",
        "proof_kinds": ["proof", "text"],
        "reviewer_kind": "mentor",
        "sort_order": 100,
    },
    {
        "title": "Курирование одной организации",
        "category": "management",
        "stage": "practice",
        "max_points": 10,
        "due_days": 7,
        "required": True,
        "description": "Самостоятельно курируйте организацию за период. Итог подтверждает наставник.",
        "proof_kinds": ["text", "link"],
        "reviewer_kind": "mentor",
        "sort_order": 110,
    },
    {
        "title": "Самостоятельная проверка",
        "category": "practice",
        "stage": "practice",
        "max_points": 10,
        "due_days": 5,
        "required": True,
        "description": "Проведите проверку без наставника рядом. Приложите ход и вывод.",
        "proof_kinds": ["text", "proof"],
        "reviewer_kind": "mentor",
        "sort_order": 120,
    },
    {
        "title": "Собрание / созвон",
        "category": "management",
        "stage": "practice",
        "max_points": 10,
        "due_days": 7,
        "required": True,
        "description": "Проведите собрание или созвон, приложите повестку и итог.",
        "proof_kinds": ["text", "link"],
        "reviewer_kind": "mentor",
        "sort_order": 130,
    },
    {
        "title": "Замечания руководству",
        "category": "management",
        "stage": "practice",
        "max_points": 10,
        "due_days": 5,
        "required": False,
        "description": "Оформите замечания руководству организации: факты и требования.",
        "proof_kinds": ["text"],
        "reviewer_kind": "mentor",
        "sort_order": 140,
    },
    {
        "title": "План работы сферы",
        "category": "management",
        "stage": "practice",
        "max_points": 10,
        "due_days": 7,
        "required": True,
        "description": "Составьте план работы сферы на неделю или месяц.",
        "proof_kinds": ["text", "link"],
        "reviewer_kind": "academy_lead",
        "sort_order": 150,
    },
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def display_status(cadet: AcademyCadet) -> str:
    if cadet.status == "graduated":
        return "Выпускник"
    if cadet.status == "expelled":
        return "Отчислен"
    if cadet.status == "frozen":
        return "Заморожен"
    if cadet.stage == "practice":
        return "На практике"
    if cadet.stage == "attestation":
        return "Аттестация"
    return "Обучается"


def is_academy_lead(user: dict) -> bool:
    return int(user.get("access_level") or 0) >= LEAD_MIN_LEVEL


def can_enroll(user: dict) -> bool:
    return int(user.get("access_level") or 0) >= ASSIGN_STAFF_MIN_LEVEL


def is_mentor_of(user: dict, cadet: AcademyCadet) -> bool:
    return bool(cadet.mentor_vk_id) and int(cadet.mentor_vk_id) == int(user.get("vk_id") or 0)


def can_manage_cadet(user: dict, cadet: AcademyCadet) -> bool:
    return is_academy_lead(user) or is_mentor_of(user, cadet)


def can_view_cadet(user: dict, cadet: AcademyCadet) -> bool:
    return int(user.get("vk_id") or 0) == int(cadet.vk_id) or can_manage_cadet(user, cadet)


def can_review_report(user: dict, assignment: AcademyAssignment, cadet: AcademyCadet) -> bool:
    if is_academy_lead(user):
        return True
    if assignment.reviewer_kind == "mentor" and is_mentor_of(user, cadet):
        return True
    return False


def staff_academy_fields(cadet: AcademyCadet | None) -> dict[str, Any]:
    if cadet is None:
        return {"is_academy": False, "academy": None}
    active = cadet.status in ("active", "frozen")
    return {
        "is_academy": active,
        "academy": {
            "id": cadet.id,
            "direction": cadet.direction,
            "stage": cadet.stage,
            "status": cadet.status,
            "display_status": display_status(cadet),
            "mentor_vk_id": cadet.mentor_vk_id,
            "enrolled_at": cadet.enrolled_at.isoformat() if cadet.enrolled_at else None,
            "expected_end_at": cadet.expected_end_at.isoformat() if cadet.expected_end_at else None,
            "recommendation": cadet.recommendation,
        },
    }


async def cadets_by_vk(server_id: int) -> dict[int, AcademyCadet]:
    rows = await AcademyCadet.filter(server_id=server_id)
    return {int(row.vk_id): row for row in rows}


async def _add_event(cadet: AcademyCadet, action: str, actor_vk_id: int, detail: dict | None = None) -> None:
    await AcademyEvent.create(
        cadet=cadet,
        action=action,
        actor_vk_id=actor_vk_id,
        detail=detail,
    )


async def _names(*vk_ids: int | None) -> dict[int, str]:
    ids = {int(v) for v in vk_ids if v}
    if not ids:
        return {}
    return await resolve_display_names(ids)


async def _nick(vk_id: int, server_id: int, names: dict[int, str]) -> str:
    nick = await resolve_bot_nickname(vk_id, server_id)
    if nick:
        return nick
    return names.get(vk_id) or f"id{vk_id}"


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    return date.fromisoformat(text[:10])


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    value = datetime.fromisoformat(text)
    return _as_aware(value)


def _validate_direction(value: str | None) -> str:
    key = (value or "general").strip()
    if key not in DIRECTIONS:
        raise ValueError("Неизвестное направление академии")
    return key


def _validate_stage(value: str | None) -> str:
    key = (value or "theory").strip()
    if key not in STAGES:
        raise ValueError("Неизвестный этап академии")
    return key


def _validate_status(value: str | None) -> str:
    key = (value or "active").strip()
    if key not in STATUSES:
        raise ValueError("Неизвестный статус академии")
    return key


def _recommendation_for_total(total: int) -> str:
    if total >= 95:
        return "priority"
    if total >= 85:
        return "zgs"
    return "none"


async def ensure_academy_templates() -> int:
    count = await AcademyAssignmentTemplate.all().count()
    if count:
        return 0
    for item in DEFAULT_TEMPLATES:
        await AcademyAssignmentTemplate.create(**item)
    return len(DEFAULT_TEMPLATES)


async def get_cadet(server_id: int, vk_id: int) -> AcademyCadet | None:
    return await AcademyCadet.get_or_none(server_id=server_id, vk_id=vk_id)


async def require_cadet(server_id: int, vk_id: int) -> AcademyCadet:
    row = await get_cadet(server_id, vk_id)
    if not row:
        raise ValueError("Человек не состоит в академии")
    return row


async def require_cadet_by_id(cadet_id: int, server_id: int) -> AcademyCadet:
    row = await AcademyCadet.get_or_none(id=cadet_id, server_id=server_id)
    if not row:
        raise LookupError("Академик не найден")
    return row


async def _assert_can_enroll_target(vk_id: int, server_id: int) -> int:
    level = await get_access_level(vk_id, server_id)
    if level < AccessLevel.PGS:
        raise ValueError("В академию можно зачислить только следящего с доступом к порталу")
    if level > CADET_MAX_LEVEL:
        raise ValueError("ЗГС и выше в академию не зачисляются — это уже управленческий уровень")
    return level


async def _assert_mentor(mentor_vk_id: int | None, server_id: int) -> None:
    if not mentor_vk_id:
        return
    access = await UserServerAccess.get_or_none(user_id=mentor_vk_id, server_id=server_id)
    level = await get_access_level(mentor_vk_id, server_id)
    senior = bool(access and getattr(access, "is_senior", False))
    if level < AccessLevel.SUPERVISOR:
        raise ValueError("Наставник должен быть следящим")
    if level < LEAD_MIN_LEVEL and not senior:
        raise ValueError("Наставник — ЗГС/ГС или старший следящий")


def _assignment_targets(assignment: AcademyAssignment, vk_id: int) -> bool:
    ids = [int(v) for v in (assignment.assignee_vk_ids or [])]
    return int(vk_id) in ids


async def _assignments_for(server_id: int, vk_id: int) -> list[AcademyAssignment]:
    rows = await AcademyAssignment.filter(server_id=server_id)
    return [row for row in rows if _assignment_targets(row, vk_id)]


async def compute_metrics(cadet: AcademyCadet) -> dict[str, Any]:
    assignments = await _assignments_for(cadet.server_id, cadet.vk_id)
    reports = await AcademyReport.filter(vk_id=cadet.vk_id)
    report_by_assignment = {int(r.assignment_id): r for r in reports}
    now = _now()
    issued = len(assignments)
    required = [a for a in assignments if a.required]
    accepted = 0
    required_accepted = 0
    overdue = 0
    scores: list[float] = []
    practical = 0
    rejected = 0
    on_time = 0
    timed = 0
    stage_required = [a for a in required if a.stage == cadet.stage]
    stage_required_ok = 0

    for assignment in assignments:
        report = report_by_assignment.get(int(assignment.id))
        due = _as_aware(assignment.due_at)
        if report and report.status == "accepted":
            accepted += 1
            if assignment.required:
                required_accepted += 1
            if assignment.required and assignment.stage == cadet.stage:
                stage_required_ok += 1
            if report.score is not None and assignment.max_points:
                scores.append((int(report.score) / max(int(assignment.max_points), 1)) * 10)
            if assignment.category in ("practice", "management"):
                practical += 1
            if due:
                timed += 1
                submitted = _as_aware(report.submitted_at) or due
                if submitted <= due:
                    on_time += 1
        else:
            if report and report.status == "rejected":
                rejected += 1
            if (
                cadet.status == "active"
                and due
                and due < now
                and (report is None or report.status not in ("accepted",))
            ):
                overdue += 1

    sessions = await AcademySession.filter(server_id=cadet.server_id, status="held")
    session_ids = [s.id for s in sessions]
    attendance_rows = await AcademyAttendance.filter(vk_id=cadet.vk_id, session_id__in=session_ids) if session_ids else []
    attend_map = {int(r.session_id): r.status for r in attendance_rows}
    present = 0
    absent = 0
    for session in sessions:
        mark = attend_map.get(int(session.id))
        if mark == "present":
            present += 1
        elif mark == "absent":
            absent += 1
    attend_den = present + absent
    attend_pct = round(100 * present / attend_den) if attend_den else None
    warn_count = await AcademyWarning.filter(cadet_id=cadet.id).count()

    avg_score = round(sum(scores) / len(scores), 1) if scores else None
    on_time_pct = round(100 * on_time / timed) if timed else None
    activity_parts = [p for p in (on_time_pct, attend_pct) if p is not None]
    activity = round(sum(activity_parts) / len(activity_parts)) if activity_parts else None

    req_den = len(required) or issued
    req_num = required_accepted if required else accepted
    progress = round(100 * req_num / req_den) if req_den else 0

    if cadet.attestation_total is not None:
        rating = max(0, min(100, int(cadet.attestation_total) + int(cadet.points_adjust or 0)))
    else:
        score_part = (avg_score * 10) if avg_score is not None else 0
        act_part = activity if activity is not None else 50
        rating = max(0, min(100, round(score_part * 0.55 + act_part * 0.45) + int(cadet.points_adjust or 0)))

    return {
        "assignments_done": accepted,
        "assignments_total": issued,
        "required_done": required_accepted,
        "required_total": len(required),
        "average_score": avg_score,
        "overdue": overdue,
        "practical_checks": practical,
        "errors": rejected,
        "warnings": warn_count,
        "activity": activity,
        "rating": rating,
        "progress": progress,
        "stage_ready": bool(stage_required) and stage_required_ok >= len(stage_required),
        "stage_required_done": stage_required_ok,
        "stage_required_total": len(stage_required),
        "sessions_total": len(sessions),
        "sessions_present": present,
        "sessions_absent": absent,
        "attendance_pct": attend_pct,
    }


def suggest_attestation(metrics: dict[str, Any]) -> dict[str, int]:
    progress = int(metrics.get("progress") or 0)
    activity = int(metrics.get("activity") or 0)
    avg = metrics.get("average_score")
    avg_n = float(avg) if avg is not None else 0.0
    theory = max(0, min(20, round(avg_n * 2)))
    practice = max(0, min(40, round(progress * 0.4)))
    period = max(0, min(30, round(activity * 0.3)))
    return {"theory": theory, "practice": practice, "period": period}


async def _attach_avatars(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ids = {int(r["vk_id"]) for r in rows if r.get("vk_id")}
    photos = await resolve_vk_photos(ids) if ids else {}
    for row in rows:
        row["avatar_url"] = photos.get(int(row["vk_id"])) if row.get("vk_id") else None
    return rows


async def serialize_cadet(
    cadet: AcademyCadet,
    *,
    names: dict[int, str] | None = None,
    metrics: dict[str, Any] | None = None,
    include_metrics: bool = True,
    avatar_url: str | None = None,
    skip_avatar: bool = False,
) -> dict[str, Any]:
    names = names or await _names(cadet.vk_id, cadet.mentor_vk_id, cadet.enrolled_by)
    if metrics is None and include_metrics:
        metrics = await compute_metrics(cadet)
    if avatar_url is None and not skip_avatar:
        photos = await resolve_vk_photos({int(cadet.vk_id)})
        avatar_url = photos.get(int(cadet.vk_id))
    return {
        "id": cadet.id,
        "vk_id": cadet.vk_id,
        "nickname": await _nick(cadet.vk_id, cadet.server_id, names),
        "avatar_url": avatar_url,
        "direction": cadet.direction,
        "direction_label": DIRECTION_LABELS.get(cadet.direction, cadet.direction),
        "stage": cadet.stage,
        "stage_label": STAGE_LABELS.get(cadet.stage, cadet.stage),
        "status": cadet.status,
        "display_status": display_status(cadet),
        "mentor_vk_id": cadet.mentor_vk_id,
        "mentor_name": await _nick(cadet.mentor_vk_id, cadet.server_id, names) if cadet.mentor_vk_id else None,
        "enrolled_at": cadet.enrolled_at.isoformat() if cadet.enrolled_at else None,
        "enrolled_by": cadet.enrolled_by,
        "expected_end_at": cadet.expected_end_at.isoformat() if cadet.expected_end_at else None,
        "left_at": cadet.left_at.isoformat() if cadet.left_at else None,
        "attestation_theory": cadet.attestation_theory,
        "attestation_practice": cadet.attestation_practice,
        "attestation_period": cadet.attestation_period,
        "attestation_mentor": cadet.attestation_mentor,
        "attestation_total": cadet.attestation_total,
        "recommendation": cadet.recommendation,
        "recommendation_label": RECOMMENDATION_LABELS.get(cadet.recommendation, cadet.recommendation),
        "points_adjust": cadet.points_adjust,
        "note": cadet.note,
        "metrics": metrics,
    }


async def enroll(
    server_id: int,
    vk_id: int,
    actor: dict,
    *,
    direction: str = "general",
    stage: str = "theory",
    mentor_vk_id: int | None = None,
    enrolled_at: str | None = None,
    expected_end_at: str | None = None,
    note: str = "",
) -> AcademyCadet:
    if not can_enroll(actor):
        raise PermissionError("Зачислять в академию может Следящий структуры (5) и выше")
    await _assert_can_enroll_target(vk_id, server_id)
    await _assert_mentor(mentor_vk_id, server_id)
    existing = await get_cadet(server_id, vk_id)
    if existing and existing.status in ("active", "frozen"):
        raise ValueError("Уже состоит в академии")

    direction = _validate_direction(direction)
    stage = _validate_stage(stage)
    when = _parse_dt(enrolled_at) or _now()
    end = _parse_date(expected_end_at)

    if existing:
        existing.direction = direction
        existing.stage = stage
        existing.status = "active"
        existing.mentor_vk_id = mentor_vk_id
        existing.enrolled_at = when
        existing.enrolled_by = int(actor["vk_id"])
        existing.expected_end_at = end
        existing.left_at = None
        existing.recommendation = "none"
        existing.attestation_theory = None
        existing.attestation_practice = None
        existing.attestation_period = None
        existing.attestation_mentor = None
        existing.attestation_total = None
        existing.note = note or existing.note
        await existing.save()
        cadet = existing
    else:
        cadet = await AcademyCadet.create(
            vk_id=vk_id,
            server_id=server_id,
            direction=direction,
            stage=stage,
            status="active",
            mentor_vk_id=mentor_vk_id,
            enrolled_at=when,
            enrolled_by=int(actor["vk_id"]),
            expected_end_at=end,
            note=note,
        )

    await _add_event(
        cadet,
        "enrolled",
        int(actor["vk_id"]),
        {"direction": direction, "stage": stage, "mentor_vk_id": mentor_vk_id},
    )
    await log_audit(int(actor["vk_id"]), "academy_enroll", "academy_cadet", cadet.id, {"vk_id": vk_id})
    names = await _names(vk_id)
    await notify_vk(
        vk_id,
        "Вас зачислили в Академию следящих.\n"
        f"Направление: {DIRECTION_LABELS.get(direction, direction)}\n"
        f"Этап: {STAGE_LABELS.get(stage, stage)}\n"
        "Ник и должность не меняются — это дополнительный статус.\n"
        "Карточка: сайт → Академия",
        category="assign",
    )
    del names
    return cadet


async def update_cadet(
    cadet: AcademyCadet,
    actor: dict,
    *,
    direction: str | None = None,
    stage: str | None = None,
    status: str | None = None,
    mentor_vk_id: int | None | object = ...,
    expected_end_at: str | None | object = ...,
    note: str | None = None,
    points_adjust: int | None = None,
    attestation_theory: int | None = None,
    attestation_practice: int | None = None,
    attestation_period: int | None = None,
    attestation_mentor: int | None = None,
    recommendation: str | None = None,
) -> AcademyCadet:
    if not can_manage_cadet(actor, cadet):
        raise PermissionError("Недостаточно прав для изменения карточки академика")
    if status in ("expelled", "graduated") and not is_academy_lead(actor):
        raise PermissionError("Выпуск и отчисление подтверждает ЗГС+")

    changes: dict[str, Any] = {}
    if direction is not None:
        cadet.direction = _validate_direction(direction)
        changes["direction"] = cadet.direction
    if stage is not None:
        new_stage = _validate_stage(stage)
        if new_stage != cadet.stage:
            cadet.stage = new_stage
            changes["stage"] = new_stage
            await notify_vk(
                cadet.vk_id,
                f"Новый этап Академии: {STAGE_LABELS.get(new_stage, new_stage)}.",
                category="assign",
            )
    if status is not None:
        new_status = _validate_status(status)
        if new_status != cadet.status:
            if new_status in ("graduated", "expelled"):
                cadet.left_at = _now()
            if new_status == "active":
                cadet.left_at = None
            cadet.status = new_status
            changes["status"] = new_status
    if mentor_vk_id is not ...:
        mentor = int(mentor_vk_id) if mentor_vk_id else None
        await _assert_mentor(mentor, cadet.server_id)
        cadet.mentor_vk_id = mentor
        changes["mentor_vk_id"] = mentor
    if expected_end_at is not ...:
        cadet.expected_end_at = _parse_date(expected_end_at) if expected_end_at else None
        changes["expected_end_at"] = cadet.expected_end_at.isoformat() if cadet.expected_end_at else None
    if note is not None:
        cadet.note = note
    if points_adjust is not None:
        cadet.points_adjust = int(points_adjust)
        changes["points_adjust"] = cadet.points_adjust
    for field, raw, lo, hi in (
        ("attestation_theory", attestation_theory, 0, 20),
        ("attestation_practice", attestation_practice, 0, 40),
        ("attestation_period", attestation_period, 0, 30),
        ("attestation_mentor", attestation_mentor, 0, 10),
    ):
        if raw is not None:
            value = max(lo, min(hi, int(raw)))
            setattr(cadet, field, value)
            changes[field] = value
    parts = [
        cadet.attestation_theory,
        cadet.attestation_practice,
        cadet.attestation_period,
        cadet.attestation_mentor,
    ]
    if any(p is not None for p in parts):
        total = sum(int(p or 0) for p in parts)
        cadet.attestation_total = total
        if recommendation is None and cadet.status == "graduated":
            cadet.recommendation = _recommendation_for_total(total)
    if recommendation is not None:
        if recommendation not in RECOMMENDATIONS:
            raise ValueError("Неизвестная рекомендация")
        cadet.recommendation = recommendation
        changes["recommendation"] = recommendation

    await cadet.save()
    if changes:
        action = "updated"
        if changes.get("stage"):
            action = "stage_changed"
        if changes.get("status") == "graduated":
            action = "graduated"
        if changes.get("status") == "expelled":
            action = "expelled"
        if changes.get("status") == "frozen":
            action = "frozen"
        await _add_event(cadet, action, int(actor["vk_id"]), changes)
        await log_audit(int(actor["vk_id"]), f"academy_{action}", "academy_cadet", cadet.id, changes)
    return cadet


async def graduate(
    cadet: AcademyCadet,
    actor: dict,
    *,
    mentor_score: int | None = None,
    comment: str = "",
) -> AcademyCadet:
    if not is_academy_lead(actor):
        raise PermissionError("Выпускает ЗГС+")
    metrics = await compute_metrics(cadet)
    suggested = suggest_attestation(metrics)
    theory = cadet.attestation_theory if cadet.attestation_theory is not None else suggested["theory"]
    practice = cadet.attestation_practice if cadet.attestation_practice is not None else suggested["practice"]
    period = cadet.attestation_period if cadet.attestation_period is not None else suggested["period"]
    mentor = mentor_score if mentor_score is not None else (cadet.attestation_mentor or 0)
    cadet = await update_cadet(
        cadet,
        actor,
        status="graduated",
        stage="attestation",
        attestation_theory=theory,
        attestation_practice=practice,
        attestation_period=period,
        attestation_mentor=mentor,
        recommendation=_recommendation_for_total(theory + practice + period + mentor),
    )
    text = (comment or "").strip()
    if text:
        await _add_event(cadet, "comment", int(actor["vk_id"]), {"text": text, "kind": "graduate"})
    return cadet

async def list_roster(server_id: int, user: dict, *, include_left: bool = False) -> list[dict[str, Any]]:
    qs = AcademyCadet.filter(server_id=server_id)
    if not include_left:
        qs = qs.filter(status__in=["active", "frozen"])
    rows = await qs
    visible = [c for c in rows if can_view_cadet(user, c)]
    names = await _names(*[c.vk_id for c in visible], *[c.mentor_vk_id for c in visible])
    out: list[dict[str, Any]] = []
    for cadet in visible:
        out.append(await serialize_cadet(cadet, names=names, skip_avatar=True))
    out.sort(
        key=lambda r: (
            -float((r.get("metrics") or {}).get("average_score") or 0),
            r["nickname"].lower(),
        )
    )
    return await _attach_avatars(out)


async def summary(server_id: int, user: dict) -> dict[str, Any]:
    rows = await AcademyCadet.filter(server_id=server_id)
    visible = [c for c in rows if can_view_cadet(user, c)]
    active = [c for c in visible if c.status in ("active", "frozen")]
    mentors = {int(c.mentor_vk_id) for c in active if c.mentor_vk_id}
    ready = [
        c
        for c in active
        if c.stage == "attestation"
        or (c.stage == "practice" and (await compute_metrics(c)).get("stage_ready"))
    ]
    month_start = date.today().replace(day=1)
    graduates = [
        c
        for c in visible
        if c.status == "graduated" and c.left_at and _as_aware(c.left_at).date() >= month_start
    ]
    pending = await pending_reviews(server_id, user)
    self_cadet = next((c for c in active if int(c.vk_id) == int(user.get("vk_id") or 0)), None)
    is_mentor = any(int(c.mentor_vk_id or 0) == int(user.get("vk_id") or 0) for c in active)
    return {
        "cadets": len(active),
        "mentors": len(mentors),
        "ready_for_attestation": len(ready),
        "graduates_month": len(graduates),
        "pending_reviews": len(pending),
        "is_lead": is_academy_lead(user),
        "is_mentor": is_mentor,
        "is_cadet": self_cadet is not None,
        "can_enroll": can_enroll(user),
    }


async def mine(server_id: int, user: dict) -> list[dict[str, Any]]:
    rows = await AcademyCadet.filter(
        server_id=server_id,
        mentor_vk_id=int(user["vk_id"]),
        status__in=["active", "frozen"],
    )
    names = await _names(*[c.vk_id for c in rows])
    out: list[dict[str, Any]] = []
    for cadet in rows:
        item = await serialize_cadet(cadet, names=names, skip_avatar=True)
        pending = 0
        for assignment in await _assignments_for(server_id, cadet.vk_id):
            report = await AcademyReport.get_or_none(assignment_id=assignment.id, vk_id=cadet.vk_id)
            if report and report.status == "pending" and can_review_report(user, assignment, cadet):
                pending += 1
        item["pending_reviews"] = pending
        out.append(item)
    return await _attach_avatars(out)


async def list_mentors(server_id: int) -> list[dict[str, Any]]:
    rows = await UserServerAccess.filter(server_id=server_id, access_level__gte=AccessLevel.SUPERVISOR)
    ids: list[int] = []
    for row in rows:
        if row.access_level >= LEAD_MIN_LEVEL or getattr(row, "is_senior", False):
            ids.append(int(row.user_id))
    names = await _names(*ids)
    out = []
    for vk_id in ids:
        out.append({"vk_id": vk_id, "nickname": await _nick(vk_id, server_id, names)})
    out.sort(key=lambda r: r["nickname"].lower())
    return out


async def add_comment(cadet: AcademyCadet, actor: dict, body: str) -> None:
    if not can_manage_cadet(actor, cadet):
        raise PermissionError("Комментарий может оставить наставник или ЗГС+")
    text = body.strip()
    if not text:
        raise ValueError("Пустой комментарий")
    await _add_event(cadet, "comment", int(actor["vk_id"]), {"text": text})
    await log_audit(int(actor["vk_id"]), "academy_comment", "academy_cadet", cadet.id, {})


async def add_warning(cadet: AcademyCadet, actor: dict, body: str) -> AcademyWarning:
    if not can_manage_cadet(actor, cadet):
        raise PermissionError("Предупреждение ставит наставник или ЗГС+")
    text = body.strip()
    if not text:
        raise ValueError("Пустое предупреждение")
    row = await AcademyWarning.create(cadet=cadet, author_vk_id=int(actor["vk_id"]), body=text)
    await _add_event(cadet, "warning", int(actor["vk_id"]), {"text": text, "warning_id": row.id})
    await log_audit(int(actor["vk_id"]), "academy_warning", "academy_cadet", cadet.id, {})
    await notify_vk(cadet.vk_id, f"Предупреждение Академии:\n{text}", category="assign")
    return row


async def list_events(cadet: AcademyCadet) -> list[dict[str, Any]]:
    rows = await AcademyEvent.filter(cadet_id=cadet.id).order_by("-created_at")
    names = await _names(*[r.actor_vk_id for r in rows])
    out = []
    for row in rows:
        out.append(
            {
                "id": row.id,
                "action": row.action,
                "actor_vk_id": row.actor_vk_id,
                "actor_name": names.get(int(row.actor_vk_id)) or f"id{row.actor_vk_id}",
                "detail": row.detail,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
        )
    return out


def serialize_template(row: AcademyAssignmentTemplate) -> dict[str, Any]:
    return {
        "id": row.id,
        "title": row.title,
        "category": row.category,
        "category_label": CATEGORY_LABELS.get(row.category, row.category),
        "stage": row.stage,
        "stage_label": STAGE_LABELS.get(row.stage, row.stage),
        "max_points": row.max_points,
        "due_days": row.due_days,
        "required": row.required,
        "description": row.description,
        "proof_kinds": list(row.proof_kinds or []),
        "reviewer_kind": row.reviewer_kind,
        "is_active": row.is_active,
        "sort_order": row.sort_order,
    }


async def list_templates(*, include_inactive: bool = False) -> list[dict[str, Any]]:
    qs = AcademyAssignmentTemplate.all().order_by("sort_order", "id")
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return [serialize_template(row) for row in await qs]


async def upsert_template(actor: dict, body: dict[str, Any], template_id: int | None = None) -> AcademyAssignmentTemplate:
    if not is_academy_lead(actor):
        raise PermissionError("Шаблоны заданий меняет ЗГС+")
    title = str(body.get("title") or "").strip()
    if not title:
        raise ValueError("Укажите название шаблона")
    category = str(body.get("category") or "theory")
    if category not in CATEGORIES:
        raise ValueError("Неизвестная категория")
    stage = _validate_stage(str(body.get("stage") or "theory"))
    reviewer = str(body.get("reviewer_kind") or "mentor")
    if reviewer not in REVIEWER_KINDS:
        raise ValueError("Кто проверяет: наставник или руководство")
    kinds = [k for k in (body.get("proof_kinds") or ["text"]) if k in PROOF_KINDS] or ["text"]
    payload = {
        "title": title,
        "category": category,
        "stage": stage,
        "max_points": max(1, min(20, int(body.get("max_points") or 10))),
        "due_days": max(1, min(30, int(body.get("due_days") or 3))),
        "required": bool(body.get("required", True)),
        "description": str(body.get("description") or ""),
        "proof_kinds": kinds,
        "reviewer_kind": reviewer,
        "is_active": bool(body.get("is_active", True)),
        "sort_order": int(body.get("sort_order") or 0),
        "created_by": int(actor["vk_id"]),
    }
    if template_id:
        row = await AcademyAssignmentTemplate.get_or_none(id=template_id)
        if not row:
            raise LookupError("Шаблон не найден")
        await row.update_from_dict(payload)
        await row.save()
        await log_audit(int(actor["vk_id"]), "academy_template_update", "academy_template", row.id, {"title": title})
        return row
    row = await AcademyAssignmentTemplate.create(**payload)
    await log_audit(int(actor["vk_id"]), "academy_template_create", "academy_template", row.id, {"title": title})
    return row


async def _resolve_assignees(
    server_id: int,
    actor: dict,
    assignee_vk_ids: list[int] | None,
    all_active: bool,
    all_mentees: bool,
) -> list[int]:
    if assignee_vk_ids:
        return sorted({int(v) for v in assignee_vk_ids})
    if all_active:
        if not is_academy_lead(actor):
            raise PermissionError("Всем активным академикам задание выдаёт только ЗГС+")
        qs = AcademyCadet.filter(server_id=server_id, status="active")
        return sorted({int(c.vk_id) for c in await qs})
    if all_mentees:
        qs = AcademyCadet.filter(server_id=server_id, status="active", mentor_vk_id=int(actor["vk_id"]))
        return sorted({int(c.vk_id) for c in await qs})
    raise ValueError("Выберите академика или выдайте задание всем своим подопечным")


async def create_assignment(
    server_id: int,
    actor: dict,
    *,
    template_id: int | None = None,
    title: str | None = None,
    category: str | None = None,
    stage: str | None = None,
    max_points: int | None = None,
    required: bool | None = None,
    description: str | None = None,
    proof_kinds: list[str] | None = None,
    reviewer_kind: str | None = None,
    assignee_vk_ids: list[int] | None = None,
    all_active: bool = False,
    all_mentees: bool = False,
    due_at: str | None = None,
    due_days: int | None = None,
) -> AcademyAssignment:
    has_mentees = await AcademyCadet.filter(
        server_id=server_id, mentor_vk_id=int(actor["vk_id"]), status="active"
    ).exists()
    if not (is_academy_lead(actor) or has_mentees):
        raise PermissionError("Выдавать задания может наставник или ЗГС+")

    template = None
    if template_id:
        template = await AcademyAssignmentTemplate.get_or_none(id=template_id, is_active=True)
        if not template:
            raise LookupError("Шаблон не найден")

    title_f = (title or (template.title if template else "")).strip()
    if not title_f:
        raise ValueError("Укажите название задания")
    category_f = category or (template.category if template else "theory")
    if category_f not in CATEGORIES:
        raise ValueError("Неизвестная категория")
    stage_f = _validate_stage(stage or (template.stage if template else "theory"))
    reviewer = reviewer_kind or (template.reviewer_kind if template else "mentor")
    if reviewer not in REVIEWER_KINDS:
        raise ValueError("Некорректный проверяющий")
    kinds = [k for k in (proof_kinds or (template.proof_kinds if template else ["text"])) if k in PROOF_KINDS] or ["text"]
    ids = await _resolve_assignees(
        server_id,
        actor,
        assignee_vk_ids,
        all_active,
        all_mentees,
    )
    if not ids:
        raise ValueError("Нет академиков для выдачи")
    if not is_academy_lead(actor):
        allowed = {
            int(c.vk_id)
            for c in await AcademyCadet.filter(server_id=server_id, mentor_vk_id=int(actor["vk_id"]))
        }
        if any(v not in allowed for v in ids):
            raise PermissionError("Наставник выдаёт задания только своим академикам")

    due = _parse_dt(due_at)
    if due is None:
        days = due_days if due_days is not None else (template.due_days if template else 3)
        due = _now() + timedelta(days=max(1, int(days)))

    row = await AcademyAssignment.create(
        server_id=server_id,
        template_id=template.id if template else None,
        title=title_f,
        category=category_f,
        stage=stage_f,
        max_points=max(1, min(20, int(max_points if max_points is not None else (template.max_points if template else 10)))),
        required=bool(required if required is not None else (template.required if template else True)),
        description=(description if description is not None else (template.description if template else "")),
        proof_kinds=kinds,
        reviewer_kind=reviewer,
        assignee_vk_ids=ids,
        due_at=due,
        created_by=int(actor["vk_id"]),
    )
    await log_audit(int(actor["vk_id"]), "academy_assignment_create", "academy_assignment", row.id, {"title": title_f})
    due_label = due.date().isoformat() if due else "—"
    await notify_vk_many(
        ids,
        f"Новое задание Академии: «{title_f}».\nСрок: до {due_label}.\nСдать можно на сайте или командой /academy submit {row.id}",
        category="tasks",
    )
    for vk_id in ids:
        cadet = await get_cadet(server_id, vk_id)
        if cadet:
            await _add_event(cadet, "assignment_issued", int(actor["vk_id"]), {"assignment_id": row.id, "title": title_f})
    return row


def _report_payload(report: AcademyReport | None, *, nickname: str | None = None) -> dict[str, Any] | None:
    if not report:
        return None
    return {
        "id": report.id,
        "vk_id": report.vk_id,
        "nickname": nickname,
        "body": report.body,
        "proof_urls": list(report.proof_urls or []),
        "status": report.status,
        "status_label": REPORT_STATUS_LABELS.get(report.status, report.status),
        "score": report.score,
        "reviewer_vk_id": report.reviewer_vk_id,
        "review_comment": report.review_comment,
        "submitted_at": report.submitted_at.isoformat() if report.submitted_at else None,
        "reviewed_at": report.reviewed_at.isoformat() if report.reviewed_at else None,
    }


async def serialize_assignment(
    row: AcademyAssignment,
    *,
    viewer: dict | None = None,
    reports: list[AcademyReport] | None = None,
) -> dict[str, Any]:
    if reports is None:
        reports = await AcademyReport.filter(assignment_id=row.id)
    visible_reports = reports
    if viewer and not is_academy_lead(viewer):
        mentees = {
            int(c.vk_id)
            for c in await AcademyCadet.filter(server_id=row.server_id, mentor_vk_id=int(viewer["vk_id"]))
        }
        mentees.add(int(viewer["vk_id"]))
        visible_reports = [r for r in reports if int(r.vk_id) in mentees]
    pending = sum(1 for r in visible_reports if r.status == "pending")
    names = await _names(*[r.vk_id for r in visible_reports], *list(row.assignee_vk_ids or []), row.created_by)
    viewer_id = int(viewer["vk_id"]) if viewer else 0
    my_report = next((r for r in visible_reports if int(r.vk_id) == viewer_id), None)
    if my_report:
        viewer_status = my_report.status
        viewer_status_label = REPORT_STATUS_LABELS.get(my_report.status, my_report.status)
    elif viewer_id and viewer_id in {int(v) for v in (row.assignee_vk_ids or [])}:
        viewer_status = "open"
        viewer_status_label = "Не сдано"
    else:
        viewer_status = None
        viewer_status_label = None
    report_rows = []
    for report in visible_reports:
        nick = await _nick(int(report.vk_id), row.server_id, names)
        report_rows.append(_report_payload(report, nickname=nick))
    return {
        "id": row.id,
        "title": row.title,
        "category": row.category,
        "category_label": CATEGORY_LABELS.get(row.category, row.category),
        "stage": row.stage,
        "stage_label": STAGE_LABELS.get(row.stage, row.stage),
        "max_points": row.max_points,
        "required": row.required,
        "description": row.description,
        "proof_kinds": list(row.proof_kinds or []),
        "reviewer_kind": row.reviewer_kind,
        "assignee_vk_ids": list(row.assignee_vk_ids or []),
        "due_at": row.due_at.isoformat() if row.due_at else None,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "pending_count": pending,
        "viewer_status": viewer_status,
        "viewer_status_label": viewer_status_label,
        "reports": report_rows,
    }


async def list_assignments(server_id: int, user: dict) -> list[dict[str, Any]]:
    rows = await AcademyAssignment.filter(server_id=server_id).order_by("-id")
    lead = is_academy_lead(user)
    mentee_ids = {
        int(c.vk_id)
        for c in await AcademyCadet.filter(server_id=server_id, mentor_vk_id=int(user["vk_id"]))
    }
    out = []
    for row in rows:
        ids = [int(v) for v in (row.assignee_vk_ids or [])]
        if not lead and int(user["vk_id"]) not in ids and not any(v in mentee_ids for v in ids):
            continue
        out.append(await serialize_assignment(row, viewer=user))
    return out


async def submit_report(
    assignment_id: int,
    actor: dict,
    *,
    body: str = "",
    proof_urls: list[str] | None = None,
    vk_id: int | None = None,
) -> AcademyReport:
    assignment = await AcademyAssignment.get_or_none(id=assignment_id)
    if not assignment:
        raise LookupError("Нет такого задания")
    target = int(vk_id or actor["vk_id"])
    if target != int(actor["vk_id"]) and not is_academy_lead(actor):
        raise PermissionError("Сдать задание можно только за себя")
    if not _assignment_targets(assignment, target):
        if is_academy_lead(actor) and target == int(actor["vk_id"]):
            raise PermissionError("Это задание выдано академикам. Сдавать нужно из аккаунта академика.")
        raise PermissionError("Это задание вам не выдано")
    cadet = await get_cadet(assignment.server_id, target)
    if not cadet:
        raise ValueError("Вы не академик. Сдавать задания может только зачисленный.")
    if cadet.status != "active":
        raise ValueError("Сдавать задания может только активный академик")
    text = (body or "").strip()
    urls = [u.strip() for u in (proof_urls or []) if str(u).strip()]
    if not text and not urls:
        raise ValueError("Приложите текст отчёта, ссылку или фото")

    report = await AcademyReport.get_or_none(assignment_id=assignment.id, vk_id=target)
    if report and report.status == "accepted":
        raise ValueError("Это задание уже принято")
    now = _now()
    if report:
        report.body = text
        report.proof_urls = urls
        report.status = "pending"
        report.score = None
        report.reviewer_vk_id = None
        report.review_comment = ""
        report.submitted_at = now
        report.reviewed_at = None
        await report.save()
    else:
        report = await AcademyReport.create(
            assignment=assignment,
            vk_id=target,
            body=text,
            proof_urls=urls,
            status="pending",
            submitted_at=now,
        )
    await _add_event(cadet, "report_submitted", int(actor["vk_id"]), {"assignment_id": assignment.id, "title": assignment.title})
    await log_audit(int(actor["vk_id"]), "academy_report_submit", "academy_assignment", assignment.id, {"vk_id": target})
    reviewers: set[int] = set()
    if assignment.reviewer_kind == "mentor" and cadet.mentor_vk_id:
        reviewers.add(int(cadet.mentor_vk_id))
    if assignment.reviewer_kind == "academy_lead" or not reviewers:
        leads = await UserServerAccess.filter(server_id=assignment.server_id, access_level__gte=LEAD_MIN_LEVEL)
        reviewers.update(int(r.user_id) for r in leads)
    reviewers.discard(target)
    await notify_vk_many(
        reviewers,
        f"Отчёт по заданию «{assignment.title}» от академика ждёт проверки.",
        category="tasks",
    )
    return report


async def review_report(
    assignment_id: int,
    vk_id: int,
    actor: dict,
    *,
    action: str,
    score: int | None = None,
    comment: str = "",
) -> AcademyReport:
    assignment = await AcademyAssignment.get_or_none(id=assignment_id)
    if not assignment:
        raise LookupError("Задание не найдено")
    cadet = await get_cadet(assignment.server_id, vk_id)
    if not cadet:
        raise ValueError("Академик не найден")
    if not can_review_report(actor, assignment, cadet):
        raise PermissionError("Проверять это задание вы не можете")
    report = await AcademyReport.get_or_none(assignment_id=assignment.id, vk_id=vk_id)
    if not report:
        raise ValueError("Отчёт ещё не сдан")
    if action not in ("accept", "revision", "reject"):
        raise ValueError("Действие: принять, на доработку или отклонить")
    if action == "accept":
        pts = 0 if score is None else int(score)
        report.status = "accepted"
        report.score = max(0, min(int(assignment.max_points), pts))
    elif action == "revision":
        report.status = "revision"
        report.score = None
    else:
        report.status = "rejected"
        report.score = 0
    report.reviewer_vk_id = int(actor["vk_id"])
    report.review_comment = comment.strip()
    report.reviewed_at = _now()
    await report.save()
    await _add_event(
        cadet,
        "report_reviewed",
        int(actor["vk_id"]),
        {
            "assignment_id": assignment.id,
            "title": assignment.title,
            "status": report.status,
            "score": report.score,
            "comment": report.review_comment,
        },
    )
    await log_audit(int(actor["vk_id"]), "academy_report_review", "academy_assignment", assignment.id, {"vk_id": vk_id, "status": report.status})
    score_line = f"{report.score}/{assignment.max_points}" if report.score is not None else "—"
    await notify_vk(
        vk_id,
        f"Задание «{assignment.title}» проверено.\n"
        f"Решение: { {'accepted': 'принято', 'revision': 'на доработку', 'rejected': 'отклонено'}[report.status] }\n"
        f"Оценка: {score_line}\n"
        f"{('Комментарий: ' + report.review_comment) if report.review_comment else ''}",
        category="tasks",
    )
    return report


async def create_session(
    server_id: int,
    actor: dict,
    *,
    title: str,
    held_at: str | None = None,
    notes: str = "",
    status: str = "held",
    attendance: dict[int, str] | None = None,
) -> AcademySession:
    if not is_academy_lead(actor) and not await AcademyCadet.filter(
        server_id=server_id, mentor_vk_id=int(actor["vk_id"]), status="active"
    ).exists():
        raise PermissionError("Занятия отмечает наставник или ЗГС+")
    name = title.strip()
    if not name:
        raise ValueError("Укажите тему занятия")
    if status not in SESSION_STATUSES:
        raise ValueError("Статус занятия: запланировано / проведено / отменено")
    when = _parse_dt(held_at) or _now()
    session = await AcademySession.create(
        server_id=server_id,
        title=name,
        notes=notes,
        held_at=when,
        status=status,
        created_by=int(actor["vk_id"]),
    )
    if attendance:
        await set_attendance(session, actor, attendance)
    await log_audit(int(actor["vk_id"]), "academy_session_create", "academy_session", session.id, {"title": name})
    if status == "held":
        active = await AcademyCadet.filter(server_id=server_id, status="active")
        await notify_vk_many(
            [int(c.vk_id) for c in active],
            f"Занятие Академии: «{name}».",
            category="assign",
        )
    return session


async def set_attendance(session: AcademySession, actor: dict, marks: dict[int, str]) -> None:
    if not is_academy_lead(actor) and not await AcademyCadet.filter(
        server_id=session.server_id, mentor_vk_id=int(actor["vk_id"])
    ).exists():
        raise PermissionError("Посещаемость ставит наставник или ЗГС+")
    for vk_id, status in marks.items():
        mark = str(status)
        if mark not in ATTEND_STATUSES:
            continue
        row = await AcademyAttendance.get_or_none(session_id=session.id, vk_id=int(vk_id))
        if row:
            row.status = mark
            await row.save(update_fields=["status"])
        else:
            await AcademyAttendance.create(session=session, vk_id=int(vk_id), status=mark)
    await log_audit(int(actor["vk_id"]), "academy_attendance", "academy_session", session.id, {"count": len(marks)})


async def list_sessions(server_id: int) -> list[dict[str, Any]]:
    rows = await AcademySession.filter(server_id=server_id).order_by("-held_at")
    out = []
    for session in rows:
        marks = await AcademyAttendance.filter(session_id=session.id)
        out.append(
            {
                "id": session.id,
                "title": session.title,
                "notes": session.notes,
                "held_at": session.held_at.isoformat() if session.held_at else None,
                "status": session.status,
                "created_by": session.created_by,
                "attendance": {str(m.vk_id): m.status for m in marks},
                "present": sum(1 for m in marks if m.status == "present"),
                "absent": sum(1 for m in marks if m.status == "absent"),
            }
        )
    return out


async def update_session(session: AcademySession, actor: dict, *, title: str | None = None, notes: str | None = None, status: str | None = None, held_at: str | None = None) -> AcademySession:
    if not is_academy_lead(actor):
        raise PermissionError("Занятие меняет ЗГС+")
    if title is not None:
        session.title = title.strip() or session.title
    if notes is not None:
        session.notes = notes
    if status is not None:
        if status not in SESSION_STATUSES:
            raise ValueError("Некорректный статус занятия")
        session.status = status
    if held_at is not None:
        parsed = _parse_dt(held_at)
        if parsed:
            session.held_at = parsed
    await session.save()
    return session


async def pending_reviews(server_id: int, user: dict) -> list[dict[str, Any]]:
    rows = await list_assignments(server_id, user)
    out: list[dict[str, Any]] = []
    for assignment in rows:
        assignment_row = await AcademyAssignment.get_or_none(id=assignment["id"])
        for report in assignment.get("reports") or []:
            if not report or report.get("status") != "pending":
                continue
            vk_id = int(report["vk_id"])
            cadet = await get_cadet(server_id, vk_id)
            if assignment_row and cadet and not can_review_report(user, assignment_row, cadet):
                continue
            out.append(
                {
                    "assignment_id": assignment["id"],
                    "title": assignment["title"],
                    "max_points": assignment["max_points"],
                    "due_at": assignment.get("due_at"),
                    "vk_id": vk_id,
                    "nickname": report.get("nickname") or await _nick(vk_id, server_id, {}),
                    "status": report["status"],
                    "status_label": report.get("status_label") or REPORT_STATUS_LABELS["pending"],
                    "body": report.get("body") or "",
                    "proof_urls": list(report.get("proof_urls") or []),
                    "submitted_at": report.get("submitted_at"),
                    "stage_label": assignment.get("stage_label"),
                    "cadet_stage_label": STAGE_LABELS.get(cadet.stage, cadet.stage) if cadet else None,
                }
            )
    return await _attach_avatars(out)


EVENT_LABELS: dict[str, str] = {
    "enrolled": "принят в Академию",
    "updated": "обновлена карточка",
    "stage_changed": "сменён этап",
    "graduated": "выпущен в кадровый резерв",
    "expelled": "отчислен",
    "frozen": "заморожен",
    "comment": "комментарий наставника",
    "warning": "предупреждение Академии",
    "assignment_issued": "выдано задание",
    "report_submitted": "сдан отчёт",
    "report_reviewed": "задание проверено",
}


def labels_payload() -> dict[str, Any]:
    return {
        "directions": [{"value": k, "label": DIRECTION_LABELS[k]} for k in DIRECTIONS],
        "stages": [{"value": k, "label": STAGE_LABELS[k]} for k in STAGES],
        "statuses": [{"value": k, "label": STATUS_LABELS[k]} for k in STATUSES],
        "recommendations": [{"value": k, "label": RECOMMENDATION_LABELS[k]} for k in RECOMMENDATIONS],
        "categories": [{"value": k, "label": CATEGORY_LABELS[k]} for k in CATEGORIES],
        "reviewer_kinds": [
            {"value": "mentor", "label": "Наставник"},
            {"value": "academy_lead", "label": "Руководство Академии"},
        ],
        "proof_kinds": [
            {"value": "text", "label": "Текст"},
            {"value": "link", "label": "Ссылка"},
            {"value": "file", "label": "Файл / URL"},
            {"value": "proof", "label": "Доказательство"},
        ],
        "events": EVENT_LABELS,
        "report_statuses": [{"value": k, "label": REPORT_STATUS_LABELS[k]} for k in REPORT_STATUSES],
    }
