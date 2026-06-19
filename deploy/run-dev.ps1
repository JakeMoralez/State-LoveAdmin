# Локальный запуск State-Love-Admin рядом с State-LoveBot
#   .\deploy\run-dev.ps1           — только API
#   .\deploy\run-dev.ps1 -Frontend — API + фронт в отдельном окне

param([switch]$Frontend)

$Root = Split-Path $PSScriptRoot -Parent
$BotRoot = Join-Path (Split-Path $Root -Parent) "State-LoveBot"
$BotDb = Join-Path $BotRoot "users.db"
if (-not (Test-Path $BotDb)) {
    $BotDb = Join-Path $BotRoot "bot.db"
}

if (-not (Test-Path "$Root\.env")) {
    Write-Host "Копирую .env.example -> .env" -ForegroundColor Yellow
    Copy-Item "$Root\.env.example" "$Root\.env"
    Write-Host "Укажите в .env свой DEV_VK_ID (vk_id с доступом ЦА в боте)" -ForegroundColor Yellow
}

$env:BOT_DATABASE_URL = "sqlite:///$($BotDb -replace '\\','/')"
$env:PANEL_DATABASE_URL = "sqlite:///$($Root -replace '\\','/')/data/panel.db"
$env:UPLOAD_DIR = "$Root\data\uploads"
$env:DEV_MODE = "true"
$env:DEV_SKIP_CA = "true"
New-Item -ItemType Directory -Force -Path "$Root\data", "$Root\data\uploads" | Out-Null

Push-Location "$Root\backend"
if (-not (Test-Path "venv\Scripts\python.exe")) {
    python -m venv venv
    .\venv\Scripts\pip install -r requirements.txt
}

Write-Host ""
Write-Host "Папки:" -ForegroundColor Cyan
Write-Host "  Admin: $Root"
Write-Host "  Bot:   $BotRoot"
Write-Host "  БД:    $BotDb"
Write-Host ""
Write-Host "URL:" -ForegroundColor Green
Write-Host "  API:   http://127.0.0.1:8012/api/health"
Write-Host "  Сайт:  http://localhost:5180"
Write-Host "  Вход:  кнопка на http://localhost:5180/login  (DEV_MODE=true)"
Write-Host ""

if ($Frontend) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\frontend'; if (-not (Test-Path node_modules)) { npm install }; npm run dev -- --host 127.0.0.1 --port 5180 --strictPort"
}

.\venv\Scripts\uvicorn app.main:app --reload --host 127.0.0.1 --port 8012
Pop-Location
