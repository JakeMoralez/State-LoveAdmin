"""Человечные тексты ответов бэкенда панели.

Единый каталог строк, чтобы сообщения об ошибках были на русском и по делу
(см. docs/voice-and-tone.md). Формат ответа не меняем — эти строки идут в
привычное поле ``{"detail": ...}`` через ``HTTPException``.
"""

from __future__ import annotations

from typing import Any

# --- Общие ------------------------------------------------------------------
INTERNAL_ERROR = "Что-то сломалось на нашей стороне. Попробуйте ещё раз через минуту."
UNAUTHORIZED_INTERNAL = "Нет доступа к внутреннему API."
OAUTH_ERROR = "Не удалось войти через VK. Попробуйте ещё раз."
VALIDATION_GENERIC = "Проверьте правильность заполнения формы."

# --- Человечные названия часто встречающихся полей формы ---------------------
_FIELD_LABELS: dict[str, str] = {
    "access_level": "уровень доступа",
    "spheres": "сферы",
    "senior_spheres": "старшие сферы",
    "vk_id": "VK ID",
    "server_id": "сервер",
    "sphere": "сфера",
    "title": "название",
    "name": "название",
    "text": "текст",
    "content": "содержимое",
    "status": "статус",
    "priority": "приоритет",
    "due_date": "срок",
    "assignee_ids": "исполнители",
    "nickname": "никнейм",
    "discord_id": "Discord ID",
    "forum_url": "ссылка на форум",
    "url": "ссылка",
}


def field_label(name: str) -> str:
    """Человекочитаемое имя поля (или само имя, если перевода нет)."""
    return _FIELD_LABELS.get(name, name)


def _field_from_loc(loc: Any) -> str:
    """Достать имя поля из pydantic-loc вида ("body", "field")."""
    if isinstance(loc, (list, tuple)) and loc:
        # Пропускаем префиксы body/query/path — они не нужны пользователю.
        parts = [str(p) for p in loc if p not in ("body", "query", "path")]
        if parts:
            return field_label(parts[-1])
    return ""


def humanize_validation(errors: list[dict[str, Any]]) -> str:
    """Собрать человечное сообщение из ошибок валидации FastAPI/pydantic.

    Возвращает строку — форма ответа остаётся ``{"detail": <str>}``, что
    корректно обрабатывается фронтом (он поддерживает detail-строку).
    """
    missing: list[str] = []
    invalid: list[str] = []
    for err in errors:
        etype = str(err.get("type", ""))
        label = _field_from_loc(err.get("loc"))
        if not label:
            continue
        if "missing" in etype or etype == "value_error.missing":
            missing.append(label)
        else:
            invalid.append(label)

    parts: list[str] = []
    if missing:
        parts.append("Заполните обязательные поля: " + ", ".join(_dedup(missing)) + ".")
    if invalid:
        parts.append("Проверьте значения полей: " + ", ".join(_dedup(invalid)) + ".")
    return " ".join(parts) if parts else VALIDATION_GENERIC


def _dedup(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


# --- Общие статусы ----------------------------------------------------------
FORBIDDEN = "Недостаточно прав."
NOT_FOUND = "Запись не найдена."
NOTHING_TO_UPDATE = "Нет полей для обновления."

# --- Staff / руководство ----------------------------------------------------
NOT_FOUND_STAFF = "Не найден в реестре следящих."
NOT_FOUND_LEADER = "Не найден в реестре руководства."
NOT_FOUND_JUDGE = "Не найден в реестре судей."
LEADER_POSITION_REQUIRED = "Укажите должность: Лидер, Зам, Министр или Советник."
LEADER_ORG_REQUIRED = "Выберите фракцию: LSPD, FBI, …"
NICKNAME_REQUIRED = "Укажите никнейм."
FORUM_REQUIRED = "Укажите аккаунт на форуме."
DISCORD_REQUIRED = "Укажите Discord ID."
LEVEL_REQUIRED = "Укажите уровень доступа."
CA_FLAG_REQUIRED = "Укажите доступ ЦА."
SPHERES_REQUIRED = "Укажите сферы."
SENIOR_FLAG_REQUIRED = "Укажите статус старшего."
SENIOR_SPHERES_REQUIRED = "Укажите сферы старшего."
SELF_ASSIGN_FORBIDDEN = "Нельзя назначить себя."
ASSIGN_FORBIDDEN = "Недостаточно прав для назначения."
NICKNAME_EDIT_FORBIDDEN = "Недостаточно прав для смены ника."
FORUM_EDIT_FORBIDDEN = "Недостаточно прав для форума."
DISCORD_EDIT_FORBIDDEN = "Недостаточно прав для Discord."
LEVEL_EDIT_FORBIDDEN = "Недостаточно прав для смены уровня."
CA_EDIT_FORBIDDEN = "Недостаточно прав для доступа ЦА."
SPHERES_EDIT_FORBIDDEN = "Недостаточно прав для смены сфер."
SENIOR_EDIT_FORBIDDEN = "Недостаточно прав для смены статуса старшего."
SENIOR_SPHERES_EDIT_FORBIDDEN = "Недостаточно прав для смены сфер старшего."
SPHERE_NOTE_FORBIDDEN = "Недостаточно прав для смены сферы."
GRANTED_AT_FORBIDDEN = "Недостаточно прав для смены даты назначения."
NICK_SYNC_FORBIDDEN = "Недостаточно прав для синхронизации ника."
TAG_EDIT_FORBIDDEN = "Недостаточно прав для смены тега."
NEED_LEVEL_FOR_ACCESS = "Укажите уровень доступа."

LEADERSHIP_EDIT_MIN = "Нужен уровень Следящий (2)+ для управления реестром руководства."
LEADERSHIP_REMOVE_SELF = "Нельзя убрать из реестра себя или без уровня Следящий (2+)."
CANNOT_EDIT_PEER_OR_HIGHER = "Нельзя изменять доступ пользователя с вашим уровнем или выше."
NEED_ZGS_FOR_ACCESS = "Нужен уровень ЗГС+ для смены доступа."
REVOKE_VIA_ACTION = "Для снятия доступа используйте действие «Снять доступ»."
CANNOT_GRANT_ABOVE = "Нельзя выдать уровень выше своего."
CANNOT_GRANT_EQUAL_OR_ABOVE = "Нельзя выдать уровень равный или выше своего."
CANNOT_LOWER_OWN_LEVEL = "Нельзя понизить свой уровень."
CANNOT_EDIT_HIGHER_LEVEL = "Нельзя изменить уровень пользователя выше вашего."
NEED_PGS_FOR_NICK = "Нужен уровень ПГС+ для смены ника."
CANNOT_EDIT_OWN_NICK_REGISTRY = "Нельзя менять свой ник через реестр."
CANNOT_EDIT_HIGHER_NICK = "Нельзя менять ник пользователя выше вашего."
NEED_ZGS_FOR_SPHERES = "Нужен уровень ЗГС+ для смены сфер."
NEED_ZGS_FOR_CA = "Нужен уровень ЗГС+ для доступа ЦА."
NEED_ZGS_TO_REVOKE = "Нужен уровень ЗГС+ для снятия доступа."
CANNOT_REVOKE_SELF = "Нельзя снять доступ с себя."
CANNOT_REVOKE_MAIN_ADMIN = "Нельзя снять доступ главного администратора."
CANNOT_REVOKE_UNGGRANTABLE = "Нельзя снять доступ: вы не сможете снова выдать этот уровень."

# --- Tasks ------------------------------------------------------------------
TASK_NOT_FOUND = "Задача не найдена."
TASK_BAD_STATUS = "Неверный статус."
TASK_DELETE_FORBIDDEN = "Удалять задачи могут только ЗГС+."
ATTACHMENT_NOT_FOUND = "Вложение не найдено."

# --- Checklist --------------------------------------------------------------
CHECKLIST_TASKS_FORBIDDEN = "Задачи чеклиста настраивает только ЗГС ЦА+."
CHECKLIST_NEED_TASK = "Нужна хотя бы одна задача."
CHECKLIST_DUP_SLUG = "Дублирующиеся обозначения задач."
NEED_PGS = "Нужен уровень ПГС+."
NO_SPHERE_ACCESS = "Нет доступа к этой сфере."
CHECKLIST_MEMBERS_FORBIDDEN = (
    "Состав колонок настраивает только ЗГС ЦА+. Используйте «Только моя колонка»."
)
CHECKLIST_PICK_MEMBER = "Выберите хотя бы одного следящего для этой сферы."
CHECKLIST_OWN_COLUMN_ONLY = "Можно включить только свою колонку."
CHECKLIST_WEEK_LOCKED = "Прошлая неделя зафиксирована — редактирование недоступно."
CHECKLIST_UNKNOWN_TASK = "Неизвестная задача."
CHECKLIST_TASK_NOT_ON_DAY = "Задача не назначена на этот день."
CHECKLIST_USER_NOT_IN = "Пользователь не в чеклисте."
CHECKLIST_FILL_OWN = "Можно заполнять только свою колонку."
CHECKLIST_CREATE_TASK_FORBIDDEN = "Создание задач из чеклиста — только для ЗГС ЦА+."

# --- Assign -----------------------------------------------------------------
ASSIGN_NEED_SUPERVISOR = "Нужен уровень Следящий (2) или выше."
ASSIGN_STAFF_NEED_ZGS = "Назначение следящего — только ЗГС (3) и выше."
ASSIGN_STAFF_FORBIDDEN = "Недостаточно прав для назначения следящего."
ASSIGN_SENIOR_SPHERE = "Для старшего следящего / совмещения укажите сферу."
ASSIGN_JUDGE_NEED_SUPERVISOR = "Назначение судьи — только Следящий (2) и выше."
ASSIGN_JUDGE_POSITION = "Укажите должность судьи."
ASSIGN_CONGRESS_NEED_SUPERVISOR = "Назначение в конгресс — только Следящий (2) и выше."
ASSIGN_CONGRESS_POSITION = "Укажите должность в конгрессе."

# --- Projects / banks / forum / uploads -------------------------------------
PROJECT_CREATE_FORBIDDEN = "Создавать проекты могут Lead+."
PROJECT_NOT_FOUND = "Проект не найден."
BANK_NOT_FOUND = "Банк не найден."
QUESTION_NOT_FOUND = "Вопрос не найден."
REVIEW_QUEUE_FORBIDDEN = "Очередь проверки доступна ГС/ЗГС+."
QUESTION_EDIT_FORBIDDEN = "Нельзя редактировать этот вопрос."
QUESTION_TEXT_REQUIRED = "Текст вопроса обязателен."
QUESTION_DELETE_FORBIDDEN = "Нельзя удалить этот вопрос."
FORUM_NEED_ZGS_GOS = "Нужен уровень ЗГС ГОС (6) или выше."
FORUM_BAD_THREAD_URL = "Некорректная ссылка на тему."
FORUM_NEED_THREAD = "Укажите ссылку или ID темы."
SERVER_NOT_FOUND = "Сервер не найден."
FORUM_THREAD_HINT = "Укажите ссылку или ID темы в разделе forums/3758/."
UPLOAD_NO_FILE = "Файл не выбран."
UPLOAD_BAD_TYPE = "Допустимы PNG, JPG, GIF, WebP."
UPLOAD_TOO_LARGE = "Максимум 8 МБ на файл."
UPLOAD_NEED_IMAGE = "Выберите хотя бы один скрин."
