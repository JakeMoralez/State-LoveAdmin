#!/usr/bin/env bash
# Production install for love.vlesnix.site
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/State-Love-Admin}"
BOT_DIR="${BOT_DIR:-/opt/State-LoveBot}"

echo "==> State-Love-Admin install -> ${APP_DIR}"

apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx nodejs npm

mkdir -p "${APP_DIR}/data"
cd "${APP_DIR}"

python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt

cd frontend && npm ci && npm run build && cd ..

cp deploy/nginx-love.conf /etc/nginx/sites-available/love.vlesnix.site
ln -sf /etc/nginx/sites-available/love.vlesnix.site /etc/nginx/sites-enabled/

cp deploy/state-love-admin.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable state-love-admin
systemctl restart state-love-admin

certbot --nginx -d love.vlesnix.site || true
nginx -t && systemctl reload nginx

echo "Готово. Проверка: curl -s https://love.vlesnix.site/api/health"
