# Deploy: love.vlesnix.site

## Требования

- VPS с nginx, certbot, Python 3.11+, Node 20+
- State-LoveBot запущен с `SLED_BOT_SECRET` и internal API на `127.0.0.1:8081`
- DNS: `love.vlesnix.site` → IP VPS

## Установка

```bash
sudo mkdir -p /opt/State-Love-Admin
sudo chown $USER:$USER /opt/State-Love-Admin
git clone <repo> /opt/State-Love-Admin
cd /opt/State-Love-Admin

cp .env.example .env
# Заполнить: DISCORD_CLIENT_*, SESSION_SECRET, BOT_DATABASE_URL, SLED_BOT_SECRET, VK_GROUP_ID
# PANEL_BASE_URL=https://love.vlesnix.site
# DISCORD_REDIRECT_URI=https://love.vlesnix.site/api/auth/discord/callback
#
# В State-LoveBot .env: тот же SLED_BOT_SECRET + PANEL_BASE_URL (для /panel)

cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
cd ../frontend && npm ci && npm run build

sudo cp deploy/nginx-love.conf /etc/nginx/sites-available/love.vlesnix.site
sudo ln -sf /etc/nginx/sites-available/love.vlesnix.site /etc/nginx/sites-enabled/
sudo certbot --nginx -d love.vlesnix.site

sudo cp deploy/state-love-admin.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now state-love-admin
sudo nginx -t && sudo systemctl reload nginx
```

## Проверка

```bash
curl -s https://love.vlesnix.site/api/health
systemctl status state-love-admin
```

## Обновление

```bash
cd /opt/State-Love-Admin
git pull
cd frontend && npm ci && npm run build
cd ../backend && ./venv/bin/pip install -r requirements.txt
sudo systemctl restart state-love-admin
```

### БД бота и список следящих

Панель читает staff **только** из `BOT_DATABASE_URL` (файл SQLite бота). Путь **должен совпадать** с `DATABASE_URL` в `.env` бота:

```bash
grep DATABASE /opt/State-LoveBot/.env
grep BOT_DATABASE /opt/State-Love-Admin/.env
curl -s https://love.vlesnix.site/api/health
# staff_count > 0, bot_db_exists: true
journalctl -u state-love-admin -n 20 | grep Startup
```

Если новые ПГС есть в боте, но нет в «Следящие» — почти всегда разные файлы БД (`users.db` vs `bot.db` или старый путь после миграции).

## Бот (git, отдельный репозиторий)

Если бот ещё в `/root` вручную — миграция без простоя: **State-LoveBot** → `deploy/README.md` → `migrate-from-manual.sh`.

После миграции обновление бота:

```bash
cd /opt/State-LoveBot && sudo bash deploy/update.sh
```

Проверка связи панель ↔ бот:

```bash
curl -s -H "X-Sled-Secret: $SLED_BOT_SECRET" http://127.0.0.1:8081/internal/staff-ca | head
```

## Docker (локально / тест)

```bash
cp .env.example .env
# поправить BOT_DATABASE_URL и пути

docker compose up -d --build
# UI: http://localhost:8080  API: http://localhost:8000
```

## Раздел разработчика

В `.env` на проде:

```
DEV_MODE=false
MAIN_ADMIN_ID=<ваш vk_id>
# или DEV_PANEL_VK_IDS=123,456
```

В сайдбаре появится **Разработка → Лог ошибок**: клиентские JS-ошибки, 500 API и падения React.
Хранится до `DEV_ERROR_RETENTION` записей (по умолчанию 500).
