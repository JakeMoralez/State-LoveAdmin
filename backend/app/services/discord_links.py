"""Discord account links for panel login."""

from __future__ import annotations

from fastapi import HTTPException

from app.models.panel import DiscordLink


async def links_for_vk_ids(vk_ids: set[int]) -> dict[int, DiscordLink]:
    if not vk_ids:
        return {}
    rows = await DiscordLink.filter(vk_id__in=list(vk_ids))
    return {int(row.vk_id): row for row in rows}


async def link_by_discord_id(discord_id: str) -> DiscordLink | None:
    return await DiscordLink.get_or_none(discord_id=discord_id)


async def upsert_discord_profile(link: DiscordLink, user_data: dict) -> None:
    link.discord_username = user_data.get("username")
    global_name = user_data.get("global_name")
    link.discord_display_name = global_name or user_data.get("username")
    await link.save()


async def set_discord_link(
    *,
    vk_id: int,
    discord_id: str | None,
    actor_vk_id: int,
) -> DiscordLink | None:
    existing = await DiscordLink.get_or_none(vk_id=vk_id)
    if discord_id is None:
        if existing:
            await existing.delete()
        return None

    other = await DiscordLink.get_or_none(discord_id=discord_id)
    if other and int(other.vk_id) != vk_id:
        raise HTTPException(
            status_code=409,
            detail=f"Discord ID уже привязан к VK {other.vk_id}",
        )

    if existing:
        existing.discord_id = discord_id
        existing.linked_by = actor_vk_id
        await existing.save()
        return existing

    return await DiscordLink.create(
        vk_id=vk_id,
        discord_id=discord_id,
        linked_by=actor_vk_id,
    )
