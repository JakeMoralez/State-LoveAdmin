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

if [[ -f "${APP_DIR}/backend/0002_add_senior_fields_user_server_access.sql" ]]; then
  if [[ -n "${BOT_DATABASE_URL:-}" ]] && [[ "${BOT_DATABASE_URL}" == postgres* ]]; then
    echo "Applying senior sphere migration to PostgreSQL..."
    DB_URL="${BOT_DATABASE_URL}"
    if [[ "${DB_URL}" == postgresql://* ]]; then
      DB_USER="$(printf '%s' "${DB_URL#postgresql://}" | cut -d: -f1)"
      DB_HOST="$(printf '%s' "${DB_URL#postgresql://}" | cut -d@ -f2 | cut -d/ -f1 | cut -d: -f1)"
      DB_PORT="$(printf '%s' "${DB_URL#postgresql://}" | cut -d@ -f2 | cut -d/ -f1 | cut -d: -f2)"
      DB_NAME="$(printf '%s' "${DB_URL#postgresql://}" | cut -d/ -f2-)"
    fi

    if command -v psql >/dev/null 2>&1; then
      if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
        PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-postgres}" -f "${APP_DIR}/backend/0002_add_senior_fields_user_server_access.sql"
      else
        psql -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-postgres}" -f "${APP_DIR}/backend/0002_add_senior_fields_user_server_access.sql"
      fi
    else
      echo "psql not found; skipping migration automatically"
    fi
  else
    echo "BOT_DATABASE_URL is not PostgreSQL, skipping SQL migration"
  fi
fi

systemctl restart state-love-admin

echo "Панель обновлена."
echo "Проверка: curl -s https://love.vlesnix.site/api/health"
echo "          systemctl status state-love-admin --no-pager"
