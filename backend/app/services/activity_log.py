"""Человекочитаемый журнал действий панели."""

from __future__ import annotations

from tortoise.expressions import Q

from app.models.bot import AccessLevel
from app.models.panel import PanelAuditLog
from app.services.display_names import resolve_display_names
from app.services.staff import role_title
from app.services.staff_spheres import format_spheres_display

VIEW_MIN_LEVEL = AccessLevel.SUPERVISOR

ACTION_GROUP_PREFIXES: dict[str, tuple[str, ...]] = {
    "staff": ("staff_",),
    "leaders": ("leader_",),
    "justice": ("judge_", "congress_"),
    "tasks": ("task_",),
    "projects": ("project_",),
    "banks": ("qb_",),
    "cases": ("loot_case_",),
}

ACTION_MESSAGES: dict[str, str] = {
    # Следящие и назначения
    "staff_assign": "назначил следящим",
    "staff_update": "изменил должность",
    "staff_revoke": "снял доступ следящего",
    "profile_update": "обновил кабинет",
    "judge_assign": "назначил судьёй",
    "congress_assign": "назначил в конгресс",
    # Руководство
    "leader_assign": "назначил в руководство",
    "leader_update": "изменил карточку руководства",
    "leader_remove": "убрал из реестра руководства",
    "leader_clear_nickname": "очистил ник в реестре руководства",
    # Настройки
    "dev_catalog_update": "обновил справочник",
    "dev_chat_update": "обновил настройки беседы",
    # Банки вопросов
    "qb_bank_create": "создал банк вопросов",
    "qb_bank_update": "изменил банк вопросов",
    "qb_bank_delete": "удалил банк вопросов",
    "qb_item_create": "добавил вопрос в банк",
    "qb_item_created": "добавил вопрос в банк",
    "qb_item_update": "изменил вопрос в банке",
    "qb_item_updated": "изменил вопрос в банке",
    "qb_item_submit": "отправил вопрос на проверку",
    "qb_item_submitted": "отправил вопрос на проверку",
    "qb_item_approve": "одобрил вопрос в банке",
    "qb_item_approved": "одобрил вопрос в банке",
    "qb_item_reject": "отклонил вопрос в банке",
    "qb_item_rejected": "отклонил вопрос в банке",
    "qb_item_needs_revision": "вернул вопрос на доработку",
    "qb_item_comment": "оставил комментарий к вопросу",
    "qb_item_delete": "удалил вопрос из банка",
    "qb_item_deleted": "удалил вопрос из банка",
    # Задачи и проекты
    "task_create": "создал задачу",
    "task_update": "изменил задачу",
    "task_delete": "удалил задачу",
    "project_create": "создал проект",
    "project_update": "изменил проект",
    "project_delete": "удалил проект",
    # Форум
    "judge_forum_template_save": "обновил шаблон списка судей",
    # Кейсы
    "loot_case_create": "создал кейс",
    "loot_case_update": "изменил кейс",
    "loot_case_delete": "удалил кейс",
    "loot_case_spin": "открыл кейс",
    "loot_case_prize_create": "добавил приз в кейс",
    "loot_case_prize_update": "изменил приз в кейсе",
    "loot_case_prize_delete": "удалил приз из кейса",
    "loot_case_prize_bulk": "импортировал призы в кейс",
    "loot_case_prize_shuffle": "перемешал призы в кейсе",
}


def action_label(action: str) -> str:
    if action in ACTION_MESSAGES:
        return ACTION_MESSAGES[action]
    if action.startswith("qb_item_"):
        return "изменил вопрос в банке"
    if action.startswith("loot_case_"):
        return "изменил кейс"
    if action.startswith("leader_"):
        return "изменил карточку руководства"
    if action.startswith("dev_"):
        return "обновил настройки"
    return "выполнил действие"


CATALOG_KEY_LABELS = {
    "factions": "фракции",
    "ministers": "министры",
    "advisors": "советники",
    "judge_positions": "должности судей",
    "tag_spheres": "сферы тегов",
}


def _catalog_key_labels(keys) -> list[str]:
    if not isinstance(keys, list):
        return []
    out: list[str] = []
    for key in keys:
        raw = str(key).strip()
        if not raw:
            continue
        out.append(CATALOG_KEY_LABELS.get(raw, raw))
    return out


def _clean_nick(raw: str | None) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    from app.services.staff_nickname import rewrite_legacy_nickname_tags

    return rewrite_legacy_nickname_tags(text)


def _name(names: dict[int, str], vk_id: int | None, stored: str | None = None) -> str:
    cleaned = _clean_nick(stored)
    if cleaned:
        return cleaned
    if vk_id is None:
        return "—"
    return _clean_nick(names.get(int(vk_id))) or names.get(int(vk_id), f"id{vk_id}")


def _detail_suffix(action: str, detail: dict | None) -> str:
    if not detail:
        return ""

    if action == "staff_assign":
        level = detail.get("access_level_name") or AccessLevel.title(
            int(detail.get("access_level") or 0)
        )
        spheres = detail.get("spheres_display") or format_spheres_display(
            list(detail.get("spheres") or [])
        )
        parts = [p for p in (level, spheres) if p and p != "—"]
        return f" ({', '.join(parts)})" if parts else ""

    if action == "staff_update":
        bits: list[str] = []
        if "access_level" in detail:
            ch = detail["access_level"]
            if isinstance(ch, dict):
                old = ch.get("from_name") or ch.get("from")
                new = ch.get("to_name") or ch.get("to")
                bits.append(f"уровень: {old} → {new}")
            else:
                bits.append(f"уровень: {ch}")
        if detail.get("nickname"):
            bits.append("ник")
        if detail.get("spheres"):
            bits.append("сферы")
        if detail.get("has_ca_access") is not None:
            bits.append("доступ ЦА")
        if detail.get("note"):
            bits.append("заметка")
        return f": {', '.join(bits)}" if bits else ""

    if action in ("judge_assign", "congress_assign", "leader_update", "leader_assign"):
        position = (detail.get("position") or "").strip()
        org = (detail.get("org_tag") or "").strip()
        extra = " ".join(p for p in (position, f"[{org}]" if org else "") if p)
        return f" — {extra}" if extra else ""

    if action == "dev_catalog_update":
        labels = _catalog_key_labels(detail.get("keys"))
        return f" ({', '.join(labels)})" if labels else ""

    if action == "dev_chat_update":
        bits: list[str] = []
        peer = detail.get("peer_id")
        if peer is not None:
            bits.append(f"#{peer}")
        kind = (detail.get("chat_kind") or "").strip()
        if kind:
            bits.append(kind)
        return f" ({', '.join(bits)})" if bits else ""

    if action == "staff_revoke":
        return ""

    if action == "loot_case_spin":
        prize = (detail.get("prize_title") or "").strip()
        case_title = (detail.get("case_title") or "").strip()
        if prize and case_title:
            return f": выпал приз «{prize}» из кейса «{case_title}»"
        if prize:
            return f": выпал приз «{prize}»"
        if case_title:
            return f" «{case_title}»"
        return ""

    if action == "loot_case_prize_bulk":
        count = detail.get("count")
        try:
            n = int(count)
        except (TypeError, ValueError):
            n = 0
        return f" ({n})" if n else ""

    if action == "task_update":
        status = (detail.get("status") or "").strip()
        if status:
            return f" (статус: {status})"

    if action.startswith("qb_item_") and detail.get("comment"):
        comment = str(detail["comment"]).strip()
        if comment:
            return f" — {comment}"

    title = (detail.get("title") or "").strip()
    if title:
        return f" «{title}»"
    return ""


def _format_staff_update(
    actor_name: str,
    target_name: str | None,
    detail: dict,
) -> str:
    who = f" {target_name}" if target_name else ""
    level = detail.get("access_level")
    if isinstance(level, dict):
        old = level.get("from_name") or level.get("from") or "—"
        new = level.get("to_name") or level.get("to") or "—"
        return f"{actor_name} изменил должность{who} [Было: {old} | Стало: {new}]"
    if detail.get("spheres") is not None:
        spheres = detail.get("spheres_display") or format_spheres_display(
            list(detail.get("spheres") or [])
        )
        return f"{actor_name} изменил сферы{who} [Стало: {spheres or '—'}]"
    if detail.get("nickname"):
        return f"{actor_name} изменил ник{who}"
    if detail.get("has_ca_access") is not None:
        state = "выдан" if detail.get("has_ca_access") else "снят"
        return f"{actor_name} изменил доступ к порталу{who} [Стало: {state}]"
    suffix = _detail_suffix("staff_update", detail)
    return f"{actor_name} изменил карточку следящего{who}{suffix}"


def history_label(action: str, detail: dict | None) -> str | None:
    detail = detail or {}
    if action == "staff_assign":
        level = detail.get("access_level_name") or AccessLevel.title(
            int(detail.get("access_level") or 0)
        )
        spheres = detail.get("spheres_display") or format_spheres_display(
            list(detail.get("spheres") or [])
        )
        parts = [p for p in (level, spheres) if p and p != "—"]
        return " · ".join(parts) if parts else "назначен следящим"
    if action == "staff_revoke":
        return "доступ снят"
    if action == "staff_update":
        level = detail.get("access_level")
        if isinstance(level, dict):
            old = level.get("from_name") or level.get("from") or "—"
            new = level.get("to_name") or level.get("to") or "—"
            return f"уровень: {old} → {new}"
        if detail.get("spheres") is not None:
            spheres = detail.get("spheres_display") or format_spheres_display(
                list(detail.get("spheres") or [])
            )
            return f"сферы: {spheres or '—'}"
        return None
    return None


def format_activity_message(
    action: str,
    *,
    actor_name: str,
    target_name: str | None = None,
    detail: dict | None = None,
) -> str:
    if action == "staff_update":
        return _format_staff_update(actor_name, target_name, detail or {})
    verb = action_label(action)
    if target_name:
        suffix = _detail_suffix(action, detail)
        return f"{actor_name} {verb} {target_name}{suffix}"
    suffix = _detail_suffix(action, detail)
    if suffix.startswith(" («"):
        return f"{actor_name} {verb}{suffix}"
    return f"{actor_name} {verb}{suffix}"


async def serialize_activity_row(row: PanelAuditLog, names: dict[int, str]) -> dict:
    detail = row.detail or {}
    target_vk_id = detail.get("target_vk_id")
    if target_vk_id is None and row.entity_type in ("staff", "user", "leader"):
        try:
            target_vk_id = int(row.entity_id)
        except (TypeError, ValueError):
            target_vk_id = None

    stored_nick = None
    if isinstance(detail, dict):
        stored_nick = detail.get("target_nickname") or detail.get("nickname")
    actor_name = _name(names, row.actor_vk_id)
    target_name = (
        _name(names, int(target_vk_id), stored_nick) if target_vk_id is not None else None
    )

    return {
        "id": row.id,
        "action": row.action,
        "action_label": action_label(row.action),
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "actor_vk_id": row.actor_vk_id,
        "actor_name": actor_name,
        "target_vk_id": target_vk_id,
        "target_name": target_name,
        "message": format_activity_message(
            row.action,
            actor_name=actor_name,
            target_name=target_name,
            detail=detail,
        ),
        "detail": detail,
        "history_label": history_label(row.action, detail),
        "created_at": row.created_at.isoformat(),
    }


async def list_activity(
    *,
    limit: int = 50,
    offset: int = 0,
    q: str | None = None,
    vk_id: int | None = None,
    actions: list[str] | None = None,
    group: str | None = None,
    about: bool = False,
) -> dict:
    qs = PanelAuditLog.all().order_by("-created_at")
    prefixes = ACTION_GROUP_PREFIXES.get((group or "").strip())
    if prefixes:
        prefix_q = Q()
        for prefix in prefixes:
            prefix_q |= Q(action__startswith=prefix)
        qs = qs.filter(prefix_q)
    elif actions:
        qs = qs.filter(action__in=actions)
    if vk_id is not None:
        sid = str(int(vk_id))
        if about:
            qs = qs.filter(Q(entity_id=sid))
        else:
            qs = qs.filter(Q(actor_vk_id=int(vk_id)) | Q(entity_id=sid))
    total = await qs.count()
    rows = await qs.offset(offset).limit(min(limit, 100))

    vk_ids: set[int] = {row.actor_vk_id for row in rows}
    for row in rows:
        detail = row.detail or {}
        tid = detail.get("target_vk_id")
        if tid is not None:
            vk_ids.add(int(tid))
        elif row.entity_type in ("staff", "user", "leader"):
            try:
                vk_ids.add(int(row.entity_id))
            except (TypeError, ValueError):
                pass

    names = await resolve_display_names(vk_ids)
    items = [await serialize_activity_row(row, names) for row in rows]

    if q:
        ql = q.strip().lower()
        if ql:
            items = [
                item
                for item in items
                if ql in item["message"].lower()
                or ql in (item.get("actor_name") or "").lower()
                or ql in (item.get("target_name") or "").lower()
                or ql in item["action"].lower()
                or ql in (item.get("action_label") or "").lower()
            ]

    return {"total": total, "items": items, "limit": limit, "offset": offset}


def staff_assign_detail(
    *,
    target_vk_id: int,
    nickname: str,
    access_level: int,
    spheres: list[str],
) -> dict:
    return {
        "target_vk_id": target_vk_id,
        "nickname": nickname,
        "access_level": access_level,
        "access_level_name": AccessLevel.title(access_level),
        "access_role_title": role_title(access_level),
        "spheres": spheres,
        "spheres_display": format_spheres_display(spheres),
    }
