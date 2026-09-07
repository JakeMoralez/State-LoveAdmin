# AGENTS.md — карта проекта State Love Admin

> Файл-ориентир для ИИ-агентов и разработчиков. Читается Cursor автоматически.
> Цель: быстро понять «что где лежит», архитектуру и ключевые инварианты, не
> перечитывая весь код. Держи в актуальном состоянии при крупных изменениях.

## 1. Что это за проект

**State Love Admin** — веб-портал для «следящей администрации» игрового
сообщества. Управление штатом (staff), доступами, задачами, чек-листами, банками
вопросов, кейсами-рулетками, проектами, форумными списками судей и т.п.

Работает в связке с **State-LoveBot** (соседний репозиторий `../State-LoveBot`,
Discord/VK-бот). Панель **читает** пользователей и доступы из БД бота и общается с
ним по внутреннему HTTP-API.

## 2. Технологический стек

| Слой | Технологии |
|---|---|
| Backend | Python, **FastAPI**, **Tortoise ORM**, uvicorn |
| Frontend | **React 19** + **Vite** + **TypeScript** + **Tailwind CSS 4**, react-router-dom 7 |
| Auth | **VK OAuth** (основной вход) + Discord OAuth (привязка аккаунта) |
| БД | SQLite (dev) / PostgreSQL (prod) — **две** отдельные базы (см. §4) |
| Прочее | @vkid/sdk, @dnd-kit (drag&drop), lucide-react, date-fns |
| Деплой | Docker / nginx / systemd, `love.vlesnix.site` (см. `deploy/`) |

## 3. Карта каталогов (верхний уровень)

```
State-LoveAdmin/
├── backend/                 # FastAPI-приложение
│   ├── app/
│   │   ├── main.py          # ★ точка входа: lifespan, CORS, регистрация роутеров, /api/health
│   │   ├── config.py        # ★ все env-переменные, TORTOISE_ORM (2 подключения)
│   │   ├── database.py      # инициализация БД
│   │   ├── db_utils.py      # хелперы sqlite/postgres URL
│   │   ├── routers/         # HTTP-эндпоинты (по одному файлу на домен)
│   │   ├── services/        # ★ бизнес-логика (самая важная папка)
│   │   └── models/
│   │       ├── bot.py       # ★ READ-ONLY зеркало таблиц бота (connection "bot")
│   │       └── panel.py     # ★ таблицы, которыми владеет панель (connection "default")
│   ├── scripts/             # разовые миграции/сиды (migrate_*, seed_*, fix_*)
│   ├── requirements.txt
│   └── *.sql, MIGRATIONS_README.md
├── frontend/                # React/Vite SPA
│   ├── src/
│   │   ├── main.tsx         # bootstrap
│   │   ├── App.tsx          # ★ все маршруты (роутинг)
│   │   ├── api.ts           # ★ единый клиент к backend (fetch, credentials: include)
│   │   ├── pages/           # страницы (по одной на маршрут)
│   │   ├── components/      # переиспользуемые компоненты (ui/, staff/, tasks/, cases/, ...)
│   │   ├── lib/             # ★ чистая логика/константы (accessLevels, spheres, permissions, ...)
│   │   ├── context/         # AuthContext, MobileTopBarTitleContext
│   │   └── hooks/           # useMediaQuery и пр.
│   ├── package.json, vite.config.ts, tsconfig*.json
│   └── congress.html        # отдельная статическая страница (маршрут /congress)
├── deploy/                  # nginx, systemd unit, Dockerfile, install/update скрипты
├── docs/decisions.md        # решения по спорным вопросам ТЗ
├── docker-compose.yml
└── README.md
```

## 4. Архитектура: ДВЕ базы данных (ключевой инвариант)

В `config.py` → `TORTOISE_ORM` определены **два подключения**:

| Connection | Env / URL | Модели | Владелец | Доступ панели |
|---|---|---|---|---|
| `bot` | `BOT_DATABASE_URL` (по умолч. `../State-LoveBot/bot.db`) | `app/models/bot.py` | **State-LoveBot** | **только чтение** |
| `default` | `PANEL_DATABASE_URL` (по умолч. `backend/data/panel.db`) | `app/models/panel.py` | **эта панель** | чтение/запись |

- **Никогда не пиши в таблицы `bot`-подключения** из панели — это чужая БД. Панель
  их только читает (пользователи, доступы, серверы).
- `panel.py` — здесь заводятся новые таблицы фичей панели.

### Таблицы `bot.py` (зеркало, read-only)
`User`, `Server`, `UserServerAccess` (уровень доступа, роли, сферы старшего),
`RoleChat`, `JudgeForumListSettings`. Плюс класс-константа **`AccessLevel`** (см. §6).

### Таблицы `panel.py` (владеет панель)
Сессии/токены входа, `PanelAuditLog`, `DiscordLink`, `StaffNote`, `DevErrorLog`,
`Project`/`ProjectMember`, `Task`/`TaskComment`/`TaskAttachment`/`TaskNotificationLog`,
чек-лист (`Checklist*`), банки вопросов (`QuestionBank*`), кейсы (`LootCase*`),
академия (`AcademyCadet`, `AcademyEvent`, `AcademyWarning`, `AcademyAssignment*`,
`AcademyReport`, `AcademySession`, `AcademyAttendance`).

## 5. Backend: роутеры → сервисы

Все API под префиксом `/api/...` (кроме `internal` — межсервисный). Регистрация
роутеров — в `main.py`. Паттерн: **роутер = тонкий HTTP-слой, сервис = логика**.

| Роутер (`routers/`) | Префикс | Основные сервисы (`services/`) |
|---|---|---|
| `auth` | `/api/auth` | `auth`, `discord_oauth`, `discord_links`, `bot_login` |
| `internal` | `/internal` | `sled_client` (обмен с ботом, `SLED_*`) |
| `staff` | `/api/staff` | `staff`, `staff_permissions`, `staff_spheres`, `staff_assign`, `staff_nickname`, `access`, `leadership_access`, `arz_lead` |
| `spheres` | `/api/spheres` | `staff_spheres`, `sphere_work` |
| `assign` | `/api/assign` | `staff_assign`, `role_assign`, `internal_assign` |
| `tasks` | `/api/tasks` | `task_helpers`, `task_notifications`, `vk_notify` |
| `academy` | `/api/academy` | `academy` (зачисление, этапы, задания, занятия, резерв) |
| `projects` | `/api/projects` | (модели `Project*`) |
| `checklist` | `/api/checklist` | (модели `Checklist*`) |
| `question_banks` | `/api/question-banks` | `question_banks` |
| `cases` | `/api/dev/cases` | `cases`, `gallery_viewer` |
| `forum_judge_list` | `/api/forum` | `forum_judge_list` |
| `activity` | `/api/activity` | `activity_log`, `audit` |
| `dashboard` | `/api/dashboard` | `access`, `display_names` |
| `profile` | `/api/profile` | `access`, `display_names`, `bot_users` |
| `uploads` | `/api/uploads` | `gallery_viewer` (генерация галерей) |
| `dev` | `/api/dev` | `dev_access`, `error_log`, `arz_lead` |

Сквозные сервисы: `bootstrap` (`ensure_defaults` на старте), `display_names` /
`vk_resolve` (имена VK), `error_log`, `audit`, `activity_log`.

Фоновая задача: `_task_reminder_loop` в `main.py` → `task_notifications.run_task_reminders`
(напоминания по задачам, интервал `TASK_REMINDER_INTERVAL_SEC`).

## 6. Модель доступа (ядро домена)

**Уровни доступа 1–11** (`AccessLevel` в `backend/app/models/bot.py`, зеркало во
фронте `frontend/src/lib/accessLevels.ts` — держать синхронными!):

`1 ПГС · 2 Следящий · 3 ЗГС · 4 ГС · 5 Следящий структуры · 6 ЗГС ГОС ·
7 ГС ГОС · 8 Куратор · 9 ЗГА · 10 ГА · 11 Разработчик`

- Вход на портал: уровень **≥ 1** (`access.can_use_portal`).
- Панель-роль: `owner` (≥11) / `lead` (≥8) / `member` (иначе).
- Доп. флаги на `UserServerAccess`: `has_ca_access` (Центральный аппарат),
  `is_senior` + `senior_spheres`, `is_judge`, `is_attorney`, `is_leader`,
  `is_congress_speaker`, `is_congress_vice`.
- Кто какой уровень может **выдавать** — `grantableAccessLevelOptions` в
  `accessLevels.ts` (обычно ≤ своего−1; dev/≥10 — все).
- Разграничение по действиям с реестром «Руководство» — там же (`canEdit...`).

### Сферы (второе измерение)
`frontend/src/lib/spheres.ts` (+ backend `staff_spheres`): `central_apparatus`,
`justice`, `defense`, `health`, `gov_structures`, `illegal_structures`, `server`.
Многие таблицы панели скоупятся по паре **`(server_id, sphere)`** (задачи, чек-лист,
банки вопросов, проекты). API часто принимает `?sphere=` (см. `withSphere` в `api.ts`).

## 7. Auth-поток

1. Frontend: `@vkid/sdk` → редирект на VK → `/api/auth/vk/callback`.
2. Backend выдаёт сессию (cookie **`sled_session`**, TTL `SESSION_TTL_HOURS`),
   таблицы `PanelSession` / `PanelLoginToken`.
3. Frontend хранит состояние в `context/AuthContext.tsx`; защита маршрутов —
   `RequireAuth` в `App.tsx`.
4. **Dev-режим:** `DEV_MODE=true` + `DEV_VK_ID` — вход без VK OAuth (см. `config.py`,
   `services/dev_access.py`). Полезно для локальной разработки.
5. Discord — вторичная **привязка** аккаунта (`discord_oauth`, таблица `DiscordLink`).

## 8. Frontend: карта маршрутов

Определены в `frontend/src/App.tsx`. Все под `RequireAuth` + `Layout`, кроме
`/login` и `/congress`.

`/dashboard` · `/access` · `/staff` (+ `/staff/:vkId`) · `/leaders` (+ `:vkId`) ·
`/tasks` (+ `:taskId`) · `/academy` (+ `/:vkId`) · `/checklist` · `/question-banks` (+ `/review`, `/:id`) ·
`/assign` · `/activity` · `/forum/judge-list` · `/forum/formatting` ·
`/projects` (+ `/:id`, `/:id/tasks/:taskId`) · `/profile` ·
`/dev` · `/dev/leadership` · `/dev/cases` (+ `/:id`, `/:id/spin`).

Соответствие «страница ↔ роутер» обычно 1:1 по имени (`TasksPage` ↔ `tasks`).

## 9. Как запустить (dev)

```bash
# Backend
cd backend
python -m venv venv && venv\Scripts\activate      # Linux: source venv/bin/activate
pip install -r requirements.txt
copy ..\.env.example ..\.env                        # заполнить пути к bot.db и VK/Discord ключи
cd ..
uvicorn app.main:app --reload --app-dir backend     # http://127.0.0.1:8000

# Frontend
cd frontend
npm install
npm run dev                                          # http://localhost:5173 (proxy /api → backend)
```

Сборка фронта: `npm run build` (`tsc -b && vite build`). Линт: `npm run lint`.

## 10. Конвенции и подводные камни (важно для ИИ)

- **Две БД:** не писать в `bot`-подключение; новые таблицы — только в `panel.py`.
- **Синхронизация уровней:** правишь `AccessLevel` (bot.py) — обнови
  `accessLevels.ts`, и наоборот. Названия ролей должны совпадать.
- **Скоуп по сферам:** при работе с задачами/чек-листом/банками/проектами почти
  всегда учитывай `(server_id, sphere)`; не забывай прокидывать `?sphere=`.
- **`DEFAULT_SERVER_ID`** (по умолч. 30) — большинство операций привязано к серверу.
- **Схемы БД** создаются автоматически (`register_tortoise(generate_schemas=True)`),
  но ручные изменения — через `backend/scripts/` и `*.sql` (см. `MIGRATIONS_README.md`).
- **Ошибки клиента** логируются на бэкенд (`error_log` / `DevErrorLog`,
  `frontend/src/lib/errorReporter.ts`).
- **Аудит:** значимые действия писать в `PanelAuditLog` (`services/audit.py`).
- Интеграция с ботом — только через `services/sled_client.py` + роутер `internal`
  (секрет `SLED_BOT_SECRET`, адрес `SLED_INTERNAL_URL`).
- **Arizona Leaders:** cookies живут в LoveBot (`arz_lead_cookies.json` / `ARZ_LEAD_COOKIE`),
  не в `panel.db`. Панель ходит на `/internal/arz-lead/*` и пишет снимок в `StaffNote`
  (`leader_appointed_at`, `leader_term_days`, `leader_vk`, `leader_discord`, `arz_lead_id`).

## 11. Где что искать (быстрый индекс)

| Хочу... | Смотри |
|---|---|
| Понять права/уровни | `models/bot.py::AccessLevel`, `services/access.py`, `lib/accessLevels.ts` |
| Добавить эндпоинт | новый/существующий файл в `routers/` + сервис в `services/` + `include_router` в `main.py` |
| Добавить таблицу | `models/panel.py` (+ при необходимости скрипт в `scripts/`) |
| Добавить страницу | `pages/*.tsx` + маршрут в `App.tsx` + вызовы в `api.ts` |
| Env-переменные | `backend/app/config.py` + `.env.example` |
| Логику сфер | `services/staff_spheres.py`, `lib/spheres.ts` |
| Академию следящих | `services/academy.py`, `routers/academy.py`, `/academy`, LoveBot `/academy` |
| Деплой/прод | `deploy/` (`README.md`, nginx, systemd, Docker) |
| Решения по ТЗ | `docs/decisions.md` |
| Сессия / синк Arizona Leaders | LoveBot `services/arz_lead_client.py`, панель `services/arz_lead.py`, Dev Settings вкладка «Arizona» |
