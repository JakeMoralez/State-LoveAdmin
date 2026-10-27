# AGENTS.md — карта проекта State Love Admin

> Файл-ориентир для ИИ-агентов и разработчиков. Читается Cursor автоматически.
> Цель: быстро понять «что где лежит», архитектуру и ключевые инварианты, не
> перечитывая весь код. Держи в актуальном состоянии при крупных изменениях.

## 1. Что это за проект

**State Love Admin** — веб-портал для «следящей администрации» игрового
сообщества. Управление штатом (staff), доступами, задачами, чек-листами, банками
вопросов, кейсами-рулетками, форумными списками судей и т.п.

Работает в связке с **State-LoveBot** (соседний репозиторий `../State-LoveBot`,
VK-бот + Discord-привязка). Панель читает/пишет staff-доступы в БД бота и
общается с ним по внутреннему HTTP-API (см. §4 матрица владения).

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

| Connection | Env / URL | Модели | Владелец схемы | Кто пишет данные |
|---|---|---|---|---|
| `bot` | `BOT_DATABASE_URL` | `app/models/bot.py` | **State-LoveBot** (миграции/схема бота) | **Бот** + **панель** (staff assign / level / роли / nick / `has_ca_access`) |
| `default` | `PANEL_DATABASE_URL` | `app/models/panel.py` | **эта панель** (`generate_schemas` только сюда) | только панель |

### Матрица владения (кто SoT)

| Данные | Где лежит | Пишет | Читает бот |
|---|---|---|---|
| `users`, `user_server_access` (уровень, флаги ролей, nick) | `bot.db` | Панель (UI/API) и бот (локальные cmds); схема — только бот | напрямую из своей БД |
| Сферы следящих (`StaffNote.spheres`) | `panel.db` | Панель | **только HTTP** `GET/PUT /internal/staff-spheres/...` |
| Задачи, архив чеклистов, audit, DiscordLink | `panel.db` | Панель | HTTP `/internal/*` |
| Чаты, command overrides, forum cookies | `bot.db` / файлы бота | Бот (+ DevSettings proxy) | локально |
| Каталог уровней 1–11 | `backend/app/domain/access_levels.py` | — | зеркало `database/access_levels.py` |
| Правила выдачи сфер | `backend/app/domain/sphere_grant_rules.py` | — | зеркало `database/sphere_grant_rules.py` |

- **Схему `bot`-подключения панель не генерирует** (`generate_schemas=False` + schema только для `default`).
- Панель **осознанно пишет** в `user_server_access` / `users` при назначении и правках staff — это не баг, а рабочий SoT для реестра.
- Сырой SQL бота в `panel.db` для сфер **запрещён** — только internal API.

### Таблицы `bot.py` (зеркало ORM)
`User`, `Server`, `UserServerAccess` (уровень доступа, роли, senior_spheres),
`RoleChat`, `JudgeForumListSettings`. Плюс класс **`AccessLevel`** из domain-каталога.

### Таблицы `panel.py` (владеет панель)
Сессии JWT (`sled_session` cookie) + `PanelLoginToken`, `PanelAuditLog`, `DiscordLink`, `StaffNote`, `DevErrorLog`,
`Task`/`TaskComment`/`TaskAttachment`/`TaskNotificationLog`/
`TaskRecurrence`,
архив чек-листов (`Checklist*`, данные сохранены), банки вопросов (`QuestionBank*`), кейсы (`LootCase*`),
`PanelSettings`.

## 5. Backend: роутеры → сервисы

Все API под префиксом `/api/...` (кроме `internal` — межсервисный). Регистрация
роутеров — в `main.py`. Паттерн: **роутер = тонкий HTTP-слой, сервис = логика**.

| Роутер (`routers/`) | Префикс | Основные сервисы (`services/`) |
|---|---|---|
| `auth` | `/api/auth` | `auth`, `discord_oauth`, `discord_links`, `bot_login` |
| `internal` | `/internal` | `sled_client` (обмен с ботом, `SLED_*`) |
| `staff` | `/api/staff` | `staff`, `staff_permissions`, `staff_spheres`, `staff_assign`, `staff_nickname`, `access`, `leadership_access` |
| `spheres` | `/api/spheres` | `staff_spheres`, `sphere_work` |
| `assign` | `/api/assign` | `staff_assign`, `role_assign`, `internal_assign` |
| `tasks` | `/api/tasks` | `task_helpers`, `task_notifications`, `vk_notify` |
| `checklist_archived` | `/api/checklist` | Архив: все операции возвращают HTTP 410; исходный `checklist.py` сохранён |
| `question_banks` | `/api/question-banks` | `question_banks` |
| `cases` | `/api/dev/cases` | `cases`, `gallery_viewer` |
| `forum_judge_list` | `/api/forum` | `forum_judge_list` |
| `activity` | `/api/activity` | `activity_log`, `audit` |
| `dashboard` | `/api/dashboard` | `access`, `display_names` |
| `profile` | `/api/profile` | `access`, `display_names`, `bot_users` |
| `uploads` | `/api/uploads` | `gallery_viewer` (генерация галерей) |
| `dev` | `/api/dev` | `dev_access`, `error_log` |

Сквозные сервисы: `bootstrap` (`ensure_defaults` на старте), `display_names` /
`vk_resolve` (имена VK), `error_log`, `audit`, `activity_log`.

Фоновая задача: `_task_reminder_loop` в `main.py` → spawn `TaskRecurrence`
+ `task_notifications.run_task_reminders` (напоминания; интервал из `PanelSettings`
/ `TASK_REMINDER_INTERVAL_SEC`).

**Задачи / Госструктуры:** внутри `gov_structures` категории `audience`
(`supervisors` · `gs_zgs` · `structure_managers`); повтор — таблица `task_recurrences`
(сервисы `task_audience.py`, `task_recurrence.py`).

## 6. Модель доступа (ядро домена)

**Уровни доступа 1–11** (`AccessLevel` ← канон `backend/app/domain/access_levels.py`;
зеркало бота `database/access_levels.py`; FE `frontend/src/lib/accessLevels.ts` —
держать синхронными, проверка `backend/scripts/check_access_levels_parity.py`):

`1 ПС · 2 Следящий · 3 ЗГС · 4 ГС · 5 Следящий структуры · 6 ЗГС ГОС ·
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
банки вопросов). API часто принимает `?sphere=` (см. `withSphere` в `api.ts`).

## 7. Auth-поток

1. Frontend: `@vkid/sdk` → редирект на VK → `/api/auth/vk/callback`.
2. Backend выдаёт JWT в cookie **`sled_session`**: idle sliding
   (`SESSION_IDLE_HOURS`, default 168) + абсолютный потолок с `iat`
   (`SESSION_ABSOLUTE_HOURS`, default 720). Cookie продлевается при
   валидных запросах (порог ~25% idle) и через `POST /api/auth/refresh`.
   `SESSION_TTL_HOURS` — deprecated alias для idle. Одноразовые токены
   входа с бота — `PanelLoginToken`.
3. Frontend хранит состояние в `context/AuthContext.tsx`; защита маршрутов —
   `RequireAuth` в `App.tsx`.
4. **Dev-режим:** `DEV_MODE=true` + `DEV_VK_ID` — вход без VK OAuth (см. `config.py`,
   `services/dev_access.py`). Полезно для локальной разработки.
5. Discord — вторичная **привязка** аккаунта (`discord_oauth`, таблица `DiscordLink`).

## 8. Frontend: карта маршрутов

Определены в `frontend/src/App.tsx`. Все под `RequireAuth` + `Layout`, кроме
`/login` и `/congress`.

`/dashboard` · `/access` · `/staff` · `/leaders` · `/profile` (+ `/profile/:vkId`) ·
`/tasks` (+ `:taskId`) · `/checklist` · `/question-banks` (+ `/review`, `/:id`) ·
`/assign` · `/activity` · `/forum/judge-list` · `/forum/formatting` ·
`/dev` · `/dev/leadership` (bulk `is_leader` only) · `/dev/cases` (+ `/:id`, `/:id/spin`).

Карточка человека: канон **`/profile/{public_id}`** (не vk_id; старые `/staff/:vkId`,
`/leaders/:vkId` и числовой `/profile/{vkId}` резолвятся в публичный ID).
`/profile` без id — личный кабинет.

Руководство: реестр `/leaders`, создание `/assign`, флаги только `/dev/leadership`.

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
- **Синхронизация уровней:** канон `backend/app/domain/access_levels.py` → копия в
  LoveBot `database/access_levels.py` + FE `accessLevels.ts`. Проверка:
  `python backend/scripts/check_access_levels_parity.py`.
- **Сферы grant:** канон `backend/app/domain/sphere_grant_rules.py` → копия в бот;
  `python backend/scripts/check_sphere_grant_rules_parity.py`.
- **Схема bot.db:** не генерировать из панели; колонки senior — через бот/скрипты
  (`ensure_user_server_access_senior_columns` — осознанный ALTER, не Tortoise schemas).
- **Скоуп по сферам:** при работе с задачами/чек-листом/банками почти
  всегда учитывай `(server_id, sphere)`; не забывай прокидывать `?sphere=`.
- **`DEFAULT_SERVER_ID`** (по умолч. 30) — продукт **single-server**: почти все API
  завязаны на этот id; UI-свитчера серверов нет (кроме отдельных форумных страниц).
  Колонка `server_id` есть «на вырост», но multi-tenant сейчас не цель.
- **Схемы БД** panel создаются на старте только для connection `default`;
  ручные изменения — через `backend/scripts/` и `*.sql` (см. `MIGRATIONS_README.md`).
- **Ошибки** панели и бота пишутся в `DevErrorLog` (`error_log`, source=`server`/`client`/`bot`;
  бот → `POST /internal/errors`). Correlation: заголовок `X-Request-Id`.
- **Аудит:** значимые действия писать в `PanelAuditLog` (`services/audit.py`).
- Интеграция с ботом — только через `services/sled_client.py` + роутер `internal`
  (секрет `SLED_BOT_SECRET`, адрес `SLED_INTERNAL_URL`).
- **Настройки (`/dev/settings`):** вкладки Беседы · Справочники · **Форум** ·
  Интеграции · Портал · Уведомления · Права команд · Ссылки. Runtime-ключи —
  `PanelSettings` (`panel.db`); сессия форума и overrides команд — через LoveBot
  `/internal/forum/*` и `/internal/command-access` (секреты только маска/флаг).
- **Arizona Leaders / arz_lead:** **не реализовано** (activity-лейблы могут остаться
  от заготовок). Не опираться на `services/arz_lead*` — модулей нет.

## 11. Где что искать (быстрый индекс)

| Хочу... | Смотри |
|---|---|
| Понять права/уровни | `domain/access_levels.py`, `services/access.py`, `lib/accessLevels.ts` |
| Правила сфер | `domain/sphere_grant_rules.py` (+ зеркало в LoveBot) |
| Добавить эндпоинт | новый/существующий файл в `routers/` + сервис в `services/` + `include_router` в `main.py` |
| Добавить таблицу | `models/panel.py` (+ при необходимости скрипт в `scripts/`) |
| Добавить страницу | `pages/*.tsx` + маршрут в `App.tsx` + вызовы в `api.ts` |
| Env-переменные | `backend/app/config.py` + `.env.example` |
| Логику сфер | `services/staff_spheres.py`, `lib/spheres.ts` |
| Деплой/прод | `deploy/` (`README.md`, nginx, systemd, Docker) |
| Решения по ТЗ | `docs/decisions.md` |
| Dev Settings / форум / права команд | `pages/DevSettingsPage.tsx`, `routers/dev.py`, LoveBot `command_catalog.py` + `sled_internal_api.py` |

## Очистка разделов

Проекты удалены. Старые страницы перенаправляются к задачам. Миграция `backend/scripts/retire_projects.py` по умолчанию показывает отчёт; `--apply` создаёт полную резервную копию, сохраняет задачи/повторы и их сферы, затем удаляет проектные таблицы и связи. Для PostgreSQL нужен `pg_dump`. Выполнять при остановленном backend.

## Профили и назначения

Текущее оформление и жёлтый акцент сохранены; отдельного прототипа и оценок дизайна нет. Правила и проверки описаны в `docs/staff-appointments.md`. `services/appointments.py` сохраняет закрытые назначения в `StaffAppointmentArchive` (БД панели), `services/bot_appointments.py` обслуживает явное изменение ника ботом. GET реестров не меняет должности. Участники бесед без назначения отображаются отдельно. Старшинство уровня 2 и дополнительные обязанности уровней 3–7 не переносятся автоматически друг в друга.


### UI профиля и проверка интерфейса (октябрь 2026)

- `ProfileView` использует вкладки `overview`, `history`, `actions`, `manage` через `?tab=`.
  `StaffProfileModal` / `LeaderProfileModal` принимают `inline` для общей формы во вкладке управления.
- `useProfileDraft` сохраняет черновик в sessionStorage по пользователю, серверу и профилю;
  очищается при сохранении, явном отказе и выходе. Навигация с черновиком требует подтверждения.
- Общий `Select` сохраняет фокус на combobox; меню в диалоге портируется в его overlay.
  Escape обрабатывается сначала селектом, затем `useOverlayFocus`.
- События изменения cookies и редактирования кейсов не записываются в аудит и скрываются
  при чтении старых записей. `loot_case_spin` остаётся в ленте с результатом.
- Стандарт рулетки — 14000 мс; одноразовая миграция с полной резервной копией описана
  в `backend/MIGRATIONS_README.md`. Выбор победителя остаётся на сервере.
- Проверки: `frontend/scripts/test-interface-logic.mjs` (чистая логика),
  `check-staff-interface.mjs`, `check-search-navigation.mjs`, `check-roulette.mjs` (Chrome).
  Браузерные проверки используют dev-вход; прокрутка тестирует подменённый API без выдачи призов.


### Выдаваемые кейсы, настройки и фон входа

- `/cases` — собственные экземпляры; `/cases/:id/open` — открытие и восстановление результата.
  Выдавать и отзывать неоткрытые копии могут уровни 5+; получатели — активные staff 1+.
  Выдача себе и подтверждение своего выигрыша разрешены. Редактор `/dev/cases` остаётся dev-only.
- `services/case_grants.py` владеет операциями с `LootCaseGrant` / `LootCaseReward` в panel.db.
  Снимок включает призы, веса редкостей и длительность. Открытие, выигрыш и audit атомарны;
  уникальная связь grant → reward исключает повторный выигрыш. Bot DB здесь только читается.
- `/api/issuance/cases` и вкладка «Кейсы» отделены от денежных выдач. Получатель видит свои
  выигрыши, 5+ — все и решения. Никаких автоматических игровых начислений.
- `case_inventory_v1`: полный backup `data/backups/case-inventory/` ДО генерации новых таблиц,
  запись в panel_migrations после неё. Подробнее: `docs/case-inventory.md`.
- DevSettings: `?tab=chats|catalog|forum|integrations|portal|notifications|commands|system`.
  Посещённые панели остаются смонтированными; `SettingsSection` сообщает dirty/busy.
  Общая кнопка обновляет текущую панель. Секретные поля хранятся только в памяти страницы.
  Настройки `/dev/portal` не пингуют бота.
- Login GhostFibers — исходник React Bits с MIT + Commons Clause, лицензия рядом с файлом.
  Фон лениво загружается, WebGL2, с reduced motion / hidden pause и графитовым fallback.
  Палитра совпадает с сайтом, декоративный canvas не перехватывает ввод.
- Новые проверки: `test_case_inventory.py`, `test_forum19_compat.py`,
  `frontend/scripts/check-case-inventory.mjs`, `check-settings-login.mjs`.

### Форумный список r-arrow

- `/forum/list`: формирование и копирование 1+, общий шаблон и импорт 7+.
  `services/forum_list*.py`, `routers/forum_list.py`, `ForumListPage.tsx`.
- `ForumListSettings` / `ForumListSnapshot` — только panel.db; миграция
  `forum_list_v1` делает backup до создания таблиц. Полный снимок, TTL 5 минут,
  общая lease, лимит 8 запросов/минуту. Подробности: `docs/forum-list.md`.
- Ключ: разработчик, «Настройки → Интеграции», write-only через
  `/api/dev/forum-list-key`; проверка перед атомарной записью серверного `.env`.
- Пользовательский образец BBCode: `assets/forum_list_default.bbcode` (15 таблиц,
  76 мест). Явные токены, все организации в каталоге, администрация без выдуманных
  контактов. Отсутствующий VK дополняется однозначным действующим назначением
  из местного реестра; данные API приоритетны.
- `active_appointment_ids` исключает обе разновидности действующего назначения
  из «Участников без назначения». Участие в беседе не меняет должность.
- Проверки: `test_forum_list.py`, `test_staff_appointments.py`,
  `frontend/scripts/check-forum-list.mjs`.
- Резервный VK берётся из текущего реестра при формировании/предпросмотре,
  без записи в снимок r-arrow. Нулевые ID не блокируют поиск.
- Назначение/редактирование следящего откатывается при ошибке ника;
  ошибка не подавляется. Реестр использует карточку из ответа PATCH.
  Браузерная регрессия: `frontend/scripts/check-staff-save.mjs`.
