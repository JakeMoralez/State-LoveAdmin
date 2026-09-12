# Решения по открытым вопросам (§12 ТЗ)

Принятые defaults для MVP (можно изменить в `.env`):

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | Сервер | Один `DEFAULT_SERVER_ID` из env (single-server продукт; multi-tenant не делаем) |
| 2 | Импорт Google Sheets | CSV импорт заметок — фаза 2; MVP — экспорт CSV |
| 4 | Спринты | Статусы + `due_date`, без спринтов |
| 5 | Создание проектов | Lead+ (ур. 7+) и Owner |
| 6 | Типы задач | `task_type`: assignment, check, report, bug |
| 6a | Госструктуры — категории | `audience`: supervisors (1–2), gs_zgs (3–4), structure_managers (5+); снимок исполнителей |
| 6b | Повтор задач | `TaskRecurrence`: daily / weekly(+дни) / monthly(+числа) / specific dates; инстанс = обычный Task |
| 7 | Связи задач | Не в MVP |
| 9 | VK уведомления | При назначении и смене статуса на review/done |
| 10 | Доски | Одна общая + создание новых Lead+ |
| 11 | Удаление на доске | Lead+ |
| 13 | Дизайн | **Вариант A — «Судебный реестр»** |
| 14 | Тема | Тёмная по умолчанию |
| 15 | Название | «State Love · След. ЦА» |
| 17 | БД | Две БД: `bot.db` (схема LoveBot; staff access пишет и панель) + `panel.db` (портал). Сферы — только `panel.db` через HTTP |
| 18 | VPS | Тот же VPS, nginx поддомен |
| 19 | VK app | Создать standalone, env `VK_APP_ID` / `VK_APP_SECRET` |
| 20 | Telegram | Только VK |
| 21 | Руководство UX | `/leaders` — реестр; `/assign?type=leader|…` — создание; `/dev/leadership` — только bulk `is_leader` |
| 22 | Auth sessions | JWT cookie `sled_session`; `PanelSession` ORM удалён как мёртвый код |
