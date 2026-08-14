#!/usr/bin/env bash
# Обновление панели на VPS: sudo bash deploy/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/State-Love-Admin}"
APP_USER="${APP_USER:-lovebot}"

cd "${APP_DIR}"

if [[ -d .git ]]; then
  sudo -u "${APP_USER}" env HOME="${APP_DIR}" git -C "${APP_DIR}" pull --ff-only
fi

if [[ "${EUID}" -eq 0 ]]; then
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
fi

cd "${APP_DIR}/frontend"
sudo -u "${APP_USER}" env HOME="${APP_DIR}" npm ci
sudo -u "${APP_USER}" env HOME="${APP_DIR}" npm run build

cd "${APP_DIR}/backend"
sudo -u "${APP_USER}" ./venv/bin/pip install -r requirements.txt

systemctl restart state-love-admin

echo "Панель обновлена."
echo "Проверка: curl -s https://love.vlesnix.site/api/health"
echo "          systemctl status state-love-admin --no-pager"
