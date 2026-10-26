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
    "main": ("staff_", "leader_", "judge_", "congress_", "profile_", "task_", "issuance_"),
    "materials": ("qb_", "knowledge_", "regulation_", "congress_bill_"),
    "settings": ("dev_", "settings_", "judge_forum_", "forum_list_"),
    "staff": ("staff_", "profile_"),
    "leaders": ("leader_",),
    "justice": ("judge_", "congress_"),
    "tasks": ("task_",),
    "projects": ("project_",),
    "banks": ("qb_",),
    "cases": ("loot_case_",),
    "issuance": ("issuance_",),
}

ACTION_MESSAGES: dict[str, str] = {
    # Следящие и назначения
    "staff_assign": "назначил следящим",
    "staff_update": "обновил профиль",
    "staff_transfer": "перевёл",
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
    "forum_list_save": "обновил шаблон форумного списка",
    "forum_list_reset": "сбросил шаблон форумного списка",
    # Кейсы
    "loot_case_create": "создал кейс",
    "loot_case_update": "изменил кейс",
    "loot_case_delete": "удалил кейс",
    "loot_case_spin": "открыл кейс",
    "issuance_case_issue": "выдал выигрыш",
    "issuance_case_reject": "отклонил выдачу выигрыша",
    "issuance_case_unissue": "отменил выдачу выигрыша",
    "issuance_case_unreject": "вернул выигрыш на выдачу",
    "loot_case_prize_create": "добавил приз в кейс",
    "loot_case_prize_update": "изменил приз в кейсе",
    "loot_case_prize_delete": "удалил приз из кейса",
    "loot_case_prize_bulk": "импортировал призы в кейс",
    "loot_case_prize_shuffle": "перемешал призы в кейсе",
    "question_bank_create": "создал банк вопросов",
    "obzvon_question_create": "создал вопрос обзвона",
    "obzvon_session_create": "начал сессию обзвона",
    "obzvon_session_complete": "завершил сессию обзвона",
    "obzvon_template_create": "создал шаблон обзвона",
    "arz_lead_cookies": "обновил cookies Arizona Leaders",
    "issuance_created": "создал заявку на выдачу",
    "issuance_issued": "выдал",
    "issuance_unissued": "снял отметку о выдаче",
    "issuance_rejected": "отклонил заявку на выдачу",
    "issuance_unrejected": "снял отклонение заявки на выдачу",
    "issuance_deleted": "удалил заявку на выдачу",
}


_ACTION_TOKEN_RU = {
    "create": "создал",
    "created": "создал",
    "update": "изменил",
    "updated": "изменил",
    "delete": "удалил",
    "deleted": "удалил",
    "complete": "завершил",
    "completed": "завершил",
    "submit": "отправил",
    "submitted": "отправил",
    "approve": "одобрил",
    "approved": "одобрил",
    "reject": "отклонил",
    "rejected": "отклонил",
    "assign": "назначил",
    "revoke": "снял",
    "enroll": "зачислил",
    "spin": "открыл",
    "shuffle": "перемешал",
    "bulk": "импортировал",
    "cookies": "cookies",
    "obzvon": "обзвона",
    "question": "вопрос",
    "session": "сессию",
    "template": "шаблон",
    "prize": "приз",
    "bank": "банк",
    "lead": "Arizona Leaders",
    "arz": "",
    "staff": "штат",
    "task": "задачу",
    "project": "проект",
    "issuance": "выдачу",
    "forum": "форум",
    "catalog": "справочник",
    "chat": "беседу",
    "nickname": "ник",
}


def humanize_action_key(action: str) -> str:
    parts = [p for p in (action or "").replace("-", "_").lower().split("_") if p]
    if not parts:
        return (action or "").strip() or "неизвестное действие"
    words = [_ACTION_TOKEN_RU[p] if p in _ACTION_TOKEN_RU else p for p in parts]
    return " ".join(w for w in words if w).strip() or action.replace("_", " ")


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
    if action.startswith("obzvon_"):
        return humanize_action_key(action)
    if action.startswith("question_bank_"):
        return "изменил банк вопросов"
    if action.startswith("arz_"):
        return "обновил Arizona Leaders"
    if action.startswith("staff_"):
        return "изменил карточку следящего"
    if action.startswith("task_"):
        return "изменил задачу"
    if action.startswith("project_"):
        return "изменил проект"
    if action.startswith("issuance_"):
        return humanize_action_key(action)
    return humanize_action_key(action)


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


def _as_level_num(value) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _role_label(value) -> str:
    num = _as_level_num(value)
    if num is not None:
        return AccessLevel.title(num)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return ""


_GLOBAL_ROLE_NAMES = {"Куратор", "ЗГА", "ГА", "Разработчик"}


def _is_global_staff_role(label: str, level: int | None) -> bool:
    if level is not None and level >= AccessLevel.CURATOR:
        return True
    return label in _GLOBAL_ROLE_NAMES


def _clean_sphere_text(text: str | None) -> str:
    text = (text or "").strip()
    if not text or text == "—":
        return ""
    return text


def _sphere_keys(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(k).strip() for k in value if str(k).strip()]


def _spheres_side(detail: dict, side: str) -> str:
    raw = detail.get("spheres")
    if isinstance(raw, dict):
        display_key = "from_display" if side == "from" else "to_display"
        display = raw.get(display_key)
        if isinstance(display, str):
            cleaned = _clean_sphere_text(display)
            if cleaned:
                return cleaned
        keys = _sphere_keys(raw.get("from" if side == "from" else "to"))
        if keys:
            return _clean_sphere_text(format_spheres_display(keys))
    if side == "to":
        display = detail.get("spheres_display")
        if isinstance(display, str):
            cleaned = _clean_sphere_text(display)
            if cleaned:
                return cleaned
        if isinstance(raw, list):
            return _clean_sphere_text(format_spheres_display(_sphere_keys(raw)))
    return ""


def _join_role_sphere(role: str, sphere: str) -> str:
    if role and sphere:
        return f"{role}, {sphere}"
    return role or sphere


def _nick_side(value) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if not text:
        return ""
    from app.services.staff_nickname import rewrite_legacy_nickname_tags

    cleaned = rewrite_legacy_nickname_tags(text)
    if cleaned.startswith("[") and "]" in cleaned:
        cleaned = cleaned.split("]", 1)[1].lstrip(" _")
    return cleaned.replace(" ", "_") or text


def _nickname_pair(detail: dict) -> tuple[str, str]:
    raw = detail.get("nickname")
    if isinstance(raw, dict):
        return _nick_side(raw.get("from")), _nick_side(raw.get("to"))
    if raw is True:
        return _nick_side(detail.get("target_nickname")), ""
    if isinstance(raw, str):
        return "", _nick_side(raw)
    return "", ""


def _role_changed(detail: dict) -> bool:
    level = detail.get("access_level")
    if not isinstance(level, dict):
        return False
    from_num = _as_level_num(level.get("from"))
    to_num = _as_level_num(level.get("to"))
    if from_num is not None and to_num is not None:
        return from_num != to_num
    return _role_label(level.get("from_name") or level.get("from")) != _role_label(
        level.get("to_name") or level.get("to")
    )


def _spheres_changed(detail: dict) -> bool:
    raw = detail.get("spheres")
    if raw is True:
        return True
    if isinstance(raw, dict):
        return _sphere_keys(raw.get("from")) != _sphere_keys(raw.get("to")) or (
            _clean_sphere_text(str(raw.get("from_display") or ""))
            != _clean_sphere_text(str(raw.get("to_display") or ""))
        )
    if isinstance(raw, list):
        return bool(_sphere_keys(raw))
    return bool(_clean_sphere_text(str(detail.get("spheres_display") or "")))


def _nick_changed(detail: dict) -> bool:
    raw = detail.get("nickname")
    if isinstance(raw, dict):
        old, new = _nickname_pair(detail)
        return bool(old or new) and old != new
    if raw is True:
        return not _role_changed(detail) and not _spheres_changed(detail)
    return isinstance(raw, str) and bool(raw.strip())


def staff_update_verb(detail: dict | None) -> str:
    detail = detail or {}
    role = _role_changed(detail) or (
        isinstance(detail.get("access_level"), dict) and not _nick_changed(detail) and not _spheres_changed(detail)
    )
    nick = _nick_changed(detail)
    spheres = _spheres_changed(detail) and not role
    if role and nick:
        return "изменил должность и ник"
    if nick and spheres:
        return "изменил ник и сферы"
    if nick:
        return "изменил ник"
    if spheres:
        return "изменил сферы"
    if role or isinstance(detail.get("access_level"), dict):
        return "изменил должность"
    if detail.get("granted_at"):
        return "изменил дату назначения"
    if detail.get("promoted_at"):
        return "изменил дату повышения"
    if detail.get("has_ca_access") is not None:
        return "изменил доступ к порталу"
    if detail.get("note"):
        return "изменил заметку"
    return "изменил карточку следящего"


def staff_update_bracket(detail: dict | None) -> str:
    """[Было: … | Стало: …] без хвостов вроде «ник» / «сферы»."""
    detail = detail or {}
    level = detail.get("access_level")
    from_num = to_num = None
    from_role = to_role = ""
    if isinstance(level, dict):
        from_num = _as_level_num(level.get("from"))
        to_num = _as_level_num(level.get("to"))
        from_role = _role_label(level.get("from_name") or level.get("from"))
        to_role = _role_label(level.get("to_name") or level.get("to"))
    elif level is not None:
        to_num = _as_level_num(level)
        to_role = _role_label(detail.get("access_level_name") or level)
    elif detail.get("access_level_name"):
        to_role = _role_label(detail.get("access_level_name"))

    from_sph = _spheres_side(detail, "from")
    to_sph = _spheres_side(detail, "to")
    if from_role or to_role:
        if _is_global_staff_role(from_role, from_num):
            from_sph = ""
        if _is_global_staff_role(to_role, to_num):
            to_sph = ""

    from_part = _join_role_sphere(from_role, from_sph)
    to_part = _join_role_sphere(to_role, to_sph)
    if from_part or to_part:
        if from_part and to_part:
            if from_role == to_role and from_sph == to_sph:
                return f"[Стало: {to_part}]"
            return f"[Было: {from_part} | Стало: {to_part}]"
        return f"[Стало: {to_part}]" if to_part else f"[Было: {from_part}]"

    old_nick, new_nick = _nickname_pair(detail)
    if old_nick or new_nick:
        if old_nick and new_nick and old_nick != new_nick:
            return f"[Было: {old_nick} | Стало: {new_nick}]"
        return f"[Стало: {new_nick}]" if new_nick else f"[Было: {old_nick}]"

    if from_sph or to_sph:
        if from_sph and to_sph and from_sph != to_sph:
            return f"[Было: {from_sph} | Стало: {to_sph}]"
        return f"[Стало: {to_sph or from_sph}]"
    return ""


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
        bracket = staff_update_bracket(detail)
        return f" {bracket}" if bracket else ""

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

    if action.startswith("issuance_"):
        label = (detail.get("amount_label") or "").strip()
        if label:
            return f" [{label}]"

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
    verb = staff_update_verb(detail)
    bracket = staff_update_bracket(detail)
    if detail.get("has_ca_access") is not None and verb.startswith("изменил доступ"):
        state = "выдан" if detail.get("has_ca_access") else "снят"
        return f"{actor_name} {verb}{who} [Стало: {state}]"
    if bracket:
        return f"{actor_name} {verb}{who} {bracket}"
    return f"{actor_name} {verb}{who}"


def history_label(action: str, detail: dict | None) -> str | None:
    detail = detail or {}
    if action == "staff_transfer":
        return f"{appointment_label(detail.get('appointment_before') or {})} → {appointment_label(detail.get('appointment_after') or {})}"
    if action in ("staff_assign", "leader_assign", "judge_assign", "congress_assign") and detail.get("appointment_after"):
        return appointment_label(detail["appointment_after"])
    if action == "leader_update" and isinstance(detail.get("position"), dict):
        change = detail["position"]
        return f"{change.get('from') or 'Ранее не указано'} → {change.get('to') or 'Без должности'}"
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
        bracket = staff_update_bracket(detail)
        return bracket or None
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


def _detail_target_vk(detail: dict, row: PanelAuditLog) -> int | None:
    for key in ("target_vk_id", "vk_id"):
        raw = detail.get(key)
        if raw is None:
            continue
        try:
            return int(raw)
        except (TypeError, ValueError):
            continue
    if row.entity_type in ("staff", "user", "leader", "profile"):
        try:
            return int(row.entity_id)
        except (TypeError, ValueError):
            return None
    return None


def _stored_target_nick(detail: dict) -> str | None:
    for key in ("target_nickname", "nickname"):
        raw = detail.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw
    return None


def safe_activity_detail(action: str, detail: dict) -> dict:
    """The general journal never exposes bank answers or integration secrets."""
    if action.startswith(("qb_", "question_bank_", "obzvon_")):
        allowed = {"bank_id", "item_id", "count", "status", "sphere", "actor_name_snapshot", "actor_role_snapshot", "source"}
        return {k: v for k, v in detail.items() if k in allowed}
    blocked = ("cookie", "token", "secret", "password", "authorization", "correct_answer", "answer", "body", "headers")
    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if not any(word in k.lower() for word in blocked)}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value
    return clean(detail)


def appointment_label(snapshot: dict) -> str:
    position = snapshot.get("position") or snapshot.get("access_role_title") or snapshot.get("access_level_name") or ""
    org = snapshot.get("org_tag") or ""
    scopes = format_spheres_display(snapshot.get("spheres") or [])
    if org:
        position = f"{position} {org}"
    elif scopes and scopes != "—":
        position = f"{position} · {scopes}"
    return position


def appointment_genitive(snapshot: dict) -> str:
    level = snapshot.get("access_level") or 0
    scopes = snapshot.get("spheres") or []
    scope_words = {"central_apparatus": "центральным аппаратом", "justice": "Министерством юстиции", "defense": "Министерством обороны", "health": "Министерством здравоохранения", "gov_structures": "государственными организациями", "illegal_structures": "нелегальными организациями"}
    titles = {1: "помощника следящих", 2: "следящего", 3: "заместителя главного следящего", 4: "главного следящего", 5: "следящего", 6: "заместителя главного следящего", 7: "главного следящего", 8: "куратора сервера", 9: "заместителя главного администратора", 10: "главного администратора", 11: "разработчика"}
    if level in titles:
        words = ", ".join(scope_words.get(key, key) for key in scopes if key != "server")
        return titles[level] + (f" за {words}" if words else "")
    title = snapshot.get("position") or ""
    forms = {"Лидер": "лидера", "Заместитель": "заместителя", "Министр": "министра", "Советник": "советника", "Судья": "судьи", "Спикер конгресса": "спикера конгресса", "Вице-спикер конгресса": "вице-спикера конгресса"}
    return (forms.get(title, f"«{title}»" if title else "без уточнения") + " " + (snapshot.get("org_tag") or "")).strip()


def sentence_parts(action: str, detail: dict) -> tuple[str, str]:
    if detail.get("additional_role"):
        return "назначил", f"дополнительно на роль «{detail['additional_role']}»."
    before = detail.get("appointment_before") or {}
    after = detail.get("appointment_after") or {}
    if action == "staff_transfer":
        return "перевёл", f"с должности {appointment_genitive(before)} на должность {appointment_genitive(after)}."
    if after and action.endswith("_assign"):
        return "назначил", f"на должность {appointment_genitive(after)}."
    if action in ("staff_revoke", "leader_remove"):
        label = appointment_genitive(before) if before else ""
        return "снял", (f"с должности {label}." if label else "с должности.")
    if action in ("staff_update", "profile_update", "leader_update"):
        changes = {k for k, v in detail.items() if isinstance(v, dict) and "from" in v and "to" in v}
        if changes and changes <= {"senior_spheres", "is_senior", "nickname"} and changes & {"senior_spheres", "is_senior"}:
            return ("изменил старшинство по сферам у" if detail.get("target_access_level", 2) == 2 else "изменил дополнительные обязанности у"), "."
        return "обновил профиль", "."
    return action_label(action), _detail_suffix(action, detail).strip()


async def serialize_activity_row(row: PanelAuditLog, names: dict[int, str]) -> dict:
    detail = row.detail or {}
    if not isinstance(detail, dict):
        detail = {}
    detail = safe_activity_detail(row.action, detail)
    target_vk_id = _detail_target_vk(detail, row)
    stored_nick = _stored_target_nick(detail)
    actor_name = _name(names, row.actor_vk_id, detail.get("actor_name_snapshot"))
    if target_vk_id is not None:
        target_name = _name(names, int(target_vk_id), stored_nick)
    elif stored_nick:
        target_name = _clean_nick(stored_nick) or stored_nick.strip()
    else:
        target_name = None

    verb, tail = sentence_parts(row.action, detail)
    actor_role = detail.get("actor_role_snapshot") or ""
    return {
        "actor_role": actor_role, "sentence_verb": verb, "sentence_tail": tail,
        "id": row.id,
        "action": row.action,
        "action_label": action_label(row.action),
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "actor_vk_id": row.actor_vk_id,
        "actor_name": actor_name,
        "target_vk_id": target_vk_id,
        "target_name": target_name,
        "message": " ".join(p for p in (actor_role, actor_name, verb, target_name, tail) if p).replace(" .", "."),
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
    qs = (PanelAuditLog.all()
          .exclude(action__icontains="cookie")
          .exclude(Q(action__startswith="loot_case_") & ~Q(action="loot_case_spin"))
          .order_by("-created_at", "-id"))
    effective_group = group or ("main" if not actions and vk_id is None else "")
    prefixes = ACTION_GROUP_PREFIXES.get(effective_group)
    if prefixes:
        prefix_q = Q()
        for prefix in prefixes:
            prefix_q |= Q(action__startswith=prefix)
        qs = qs.filter(prefix_q)
    if actions:
        qs = qs.filter(action__in=actions)
    # Search and person matching happen before counting/pagination. Older events
    # may identify their subject only in JSON, so entity_id alone is insufficient.
    needs_filter = bool(q and q.strip()) or vk_id is not None
    total = await qs.count() if not needs_filter else 0
    rows = await qs if needs_filter else await qs.offset(offset).limit(min(limit, 100))
    if vk_id is not None:
        def matches(row):
            target = _detail_target_vk(row.detail if isinstance(row.detail, dict) else {}, row)
            return target == vk_id if about else row.actor_vk_id == vk_id
        rows = [row for row in rows if matches(row)]
    vk_ids = {row.actor_vk_id for row in rows}
    for row in rows:
        target = _detail_target_vk(row.detail if isinstance(row.detail, dict) else {}, row)
        if target is not None:
            vk_ids.add(target)
    names = await resolve_display_names(vk_ids)
    items = [await serialize_activity_row(row, names) for row in rows]
    if q and q.strip():
        needle = q.strip().casefold()
        items = [item for item in items if needle in " ".join(str(item.get(k) or "") for k in
                 ("message", "actor_name", "target_name", "action_label", "action")).casefold()
                 or needle in str(item["detail"].get("reason") or "").casefold()]
    if needs_filter:
        total = len(items)
        items = items[offset:offset + min(limit, 100)]
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
