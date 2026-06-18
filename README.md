# State Love Admin — портал след. ЦА

Веб-портал для следящей администрации: staff, CRM, доски идей.
Интеграция с [State-LoveBot](../State-LoveBot).

## Стек

- **Backend:** FastAPI + Tortoise ORM
- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS 4
- **Дизайн:** вариант A «Судебный реестр»

## Быстрый старт (dev)

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate   # Linux: source venv/bin/activate
pip install -r requirements.txt
copy ..\.env.example ..\.env   # настроить пути к bot.db

cd ..
uvicorn app.main:app --reload --app-dir backend

# Frontend
cd frontend
npm install
npm run dev
```

Откройте http://localhost:5173

### Dev-режим без VK OAuth

В `.env`:
```
DEV_MODE=true
DEV_VK_ID=<ваш vk_id с доступом ЦА>
```

## Production

См. [deploy/README.md](deploy/README.md) — nginx, systemd, `love.vlesnix.site`.

## Документация

- [docs/decisions.md](docs/decisions.md) — решения по открытым вопросам ТЗ
