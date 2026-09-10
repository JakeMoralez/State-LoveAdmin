"""Shared httpx.AsyncClient for panel → bot / VK outbound calls."""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0)
        logger.debug("Shared httpx AsyncClient created")
    return _client


async def close_http_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        logger.debug("Shared httpx AsyncClient closed")
    _client = None
