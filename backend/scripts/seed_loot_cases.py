"""Seed demo loot cases for local testing."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tortoise import Tortoise

from app.config import TORTOISE_ORM
from app.models.panel import LootCase, LootCasePrize

DEV_VK_ID = 604562391

CASES = [
    {
        "title": "Для лидеров",
        "description": "Презентационный кейс для руководства — тест прокрутки на стриме.",
        "cover_image_url": "",
        "prizes": [
            {"title": "50 000$", "weight": 5, "sort_order": 0, "rarity_label": "common"},
            {"title": "100 000$", "weight": 3, "sort_order": 1, "rarity_label": "uncommon"},
            {"title": "250 000$", "weight": 2, "sort_order": 2, "rarity_label": "rare"},
            {"title": "500 000$", "weight": 1, "sort_order": 3, "rarity_label": "epic"},
            {"title": "1 000 000$", "weight": 1, "sort_order": 4, "rarity_label": "legendary"},
            {"title": "Скин VIP", "weight": 2, "sort_order": 5, "rarity_label": "epic"},
        ],
    },
    {
        "title": "Мини-кейс",
        "description": "Минимальный набор из 2 призов — проверка can_spin.",
        "cover_image_url": "",
        "prizes": [
            {"title": "10 AZ", "weight": 1, "sort_order": 0, "rarity_label": "common"},
            {"title": "50 AZ", "weight": 1, "sort_order": 1, "rarity_label": "rare"},
        ],
    },
    {
        "title": "Ивент «Весна»",
        "description": "Сезонный кейс с разными весами для проверки распределения.",
        "cover_image_url": "",
        "prizes": [
            {"title": "Мерч", "weight": 8, "sort_order": 0, "rarity_label": "common"},
            {"title": "Подписка", "weight": 4, "sort_order": 1, "rarity_label": "uncommon"},
            {"title": "Промокод", "weight": 2, "sort_order": 2, "rarity_label": "rare"},
            {"title": "Главный приз", "weight": 1, "sort_order": 3, "rarity_label": "legendary"},
        ],
    },
]


async def seed() -> None:
    await Tortoise.init(config=TORTOISE_ORM)
    created = 0
    for spec in CASES:
        exists = await LootCase.filter(title=spec["title"]).exists()
        if exists:
            print(f"skip: {spec['title']!r} already exists")
            continue
        case = await LootCase.create(
            title=spec["title"],
            description=spec["description"],
            cover_image_url=spec["cover_image_url"],
            is_active=True,
            created_by_vk_id=DEV_VK_ID,
        )
        for prize in spec["prizes"]:
            await LootCasePrize.create(case_id=case.id, **prize)
        created += 1
        print(f"created: #{case.id} {case.title} ({len(spec['prizes'])} prizes)")
    total = await LootCase.all().count()
    print(f"done: +{created} new, {total} total")
    await Tortoise.close_connections()


if __name__ == "__main__":
    asyncio.run(seed())
