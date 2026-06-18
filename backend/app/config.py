"""Configuration from environment."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")

PANEL_BASE_URL: str = os.getenv("PANEL_BASE_URL", "http://localhost:5173")
API_HOST: str = os.getenv("API_HOST", "127.0.0.1")
API_PORT: int = int(os.getenv("API_PORT", "8000"))

BOT_DATABASE_URL: str = os.getenv(
    "BOT_DATABASE_URL",
    os.getenv("DATABASE_URL", f"sqlite://{BASE_DIR.parent / 'State-LoveBot' / 'bot.db'}"),
)
PANEL_DATABASE_URL: str = os.getenv(
    "PANEL_DATABASE_URL",
    f"sqlite://{BASE_DIR / 'data' / 'panel.db'}",
)

DEFAULT_SERVER_ID: int = int(os.getenv("DEFAULT_SERVER_ID", "30"))
MAIN_ADMIN_ID: int = int(os.getenv("MAIN_ADMIN_ID", "0"))
CA_LEADERSHIP_PEER_ID: int = int(os.getenv("CA_LEADERSHIP_PEER_ID", "0"))

VK_APP_ID: str = os.getenv("VK_APP_ID", "")
VK_APP_SECRET: str = os.getenv("VK_APP_SECRET", "")
VK_REDIRECT_URI: str = os.getenv(
    "VK_REDIRECT_URI",
    f"{PANEL_BASE_URL.rstrip('/')}/api/auth/vk/callback",
)

DISCORD_CLIENT_ID: str = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET: str = os.getenv("DISCORD_CLIENT_SECRET", "")
DISCORD_REDIRECT_URI: str = os.getenv(
    "DISCORD_REDIRECT_URI",
    f"{PANEL_BASE_URL.rstrip('/')}/api/auth/discord/callback",
)

SESSION_SECRET: str = os.getenv("SESSION_SECRET", "change-me-in-production")
SESSION_TTL_HOURS: int = int(os.getenv("SESSION_TTL_HOURS", "24"))
SESSION_COOKIE_NAME: str = "sled_session"

SLED_BOT_SECRET: str = os.getenv("SLED_BOT_SECRET", "")
SLED_INTERNAL_URL: str = os.getenv("SLED_INTERNAL_URL", "http://127.0.0.1:8081")

# VK service token for users.get (display names fallback)
VK_SERVICE_TOKEN: str = os.getenv("VK_SERVICE_TOKEN", os.getenv("VK_GROUP_TOKEN", ""))

UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "data" / "uploads")))

# Dev mode: skip VK OAuth, use DEV_VK_ID
DEV_MODE: bool = os.getenv("DEV_MODE", "").lower() in ("1", "true", "yes")
DEV_VK_ID: int = int(os.getenv("DEV_VK_ID", "0"))
DEV_SKIP_CA: bool = os.getenv("DEV_SKIP_CA", "").lower() in ("1", "true", "yes")

_dev_panel_ids = os.getenv("DEV_PANEL_VK_IDS", "")
DEV_PANEL_VK_IDS: list[int] = [int(x.strip()) for x in _dev_panel_ids.split(",") if x.strip().isdigit()]
DEV_PANEL_MIN_LEVEL: int = int(os.getenv("DEV_PANEL_MIN_LEVEL", "10"))
DEV_ERROR_RETENTION: int = int(os.getenv("DEV_ERROR_RETENTION", "500"))

TORTOISE_ORM: dict = {
    "connections": {
        "bot": BOT_DATABASE_URL,
        "default": PANEL_DATABASE_URL,
    },
    "apps": {
        "bot": {
            "models": ["app.models.bot"],
            "default_connection": "bot",
        },
        "models": {
            "models": ["app.models.panel"],
            "default_connection": "default",
        },
    },
}
