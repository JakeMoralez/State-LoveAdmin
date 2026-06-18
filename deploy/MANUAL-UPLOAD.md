# Заливка на VPS без Git

## Что копировать с ПК

Папку `State-Love-Admin` на сервер в `/opt/State-Love-Admin`.

**Не заливать** (на сервере создадутся заново):

- `frontend/node_modules`
- `backend/venv`
- `.env` с локального ПК (на сервере свой из `.env.example`)

WinSCP / FileZilla: хост = IP VPS, пользователь = `root` или твой user, порт 22.

Или с PowerShell:

```powershell
scp -r C:\Users\aAdmin\Documents\GitHub\State-Love-Admin user@IP_VPS:/opt/
```

Рядом на сервере должен быть бот и его БД, например `/opt/State-LoveBot/bot.db`.

---

## На VPS (первый раз)

```bash
sudo mkdir -p /opt/State-Love-Admin/data
sudo chown -R $USER:$USER /opt/State-Love-Admin

cd /opt/State-Love-Admin
cp .env.example .env
nano .env
```

Минимум в `.env`:

```env
PANEL_BASE_URL=https://love.vlesnix.site
DISCORD_REDIRECT_URI=https://love.vlesnix.site/api/auth/discord/callback
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
SESSION_SECRET=<случайная длинная строка>

BOT_DATABASE_URL=sqlite:////opt/State-LoveBot/bot.db
PANEL_DATABASE_URL=sqlite:////opt/State-Love-Admin/data/panel.db

SLED_BOT_SECRET=...
SLED_INTERNAL_URL=http://127.0.0.1:8081

DEV_MODE=false
MAIN_ADMIN_ID=<твой vk_id>
```

Сборка:

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip nginx certbot python3-certbot-nginx nodejs npm

cd /opt/State-Love-Admin/backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

cd /opt/State-Love-Admin/frontend
npm ci
npm run build
```

Nginx + SSL:

```bash
sudo cp /opt/State-Love-Admin/deploy/nginx-love.conf /etc/nginx/sites-available/love.vlesnix.site
sudo ln -sf /etc/nginx/sites-available/love.vlesnix.site /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d love.vlesnix.site
```

Systemd:

```bash
sudo cp /opt/State-Love-Admin/deploy/state-love-admin.service /etc/systemd/system/
# в service файле User= твой пользователь Linux
sudo systemctl daemon-reload
sudo systemctl enable --now state-love-admin
```

Проверка:

```bash
curl -s https://love.vlesnix.site/api/health
systemctl status state-love-admin
```

Discord Developer Portal → OAuth2 → Redirects:  
`https://love.vlesnix.site/api/auth/discord/callback`

После деплоя в разделе **Следящие** (уровень 7+) привяжите Discord ID каждому аккаунту.

---

## Обновление (снова залил файлы с ПК)

```bash
cd /opt/State-Love-Admin/frontend
npm ci
npm run build

cd /opt/State-Love-Admin/backend
./venv/bin/pip install -r requirements.txt

sudo systemctl restart state-love-admin
```

Папку `data/` и `data/uploads/` **не удалять** — там БД и скрины.
