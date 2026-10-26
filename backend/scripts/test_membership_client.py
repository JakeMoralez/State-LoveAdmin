"""Membership errors must be useful without exposing upstream response bodies."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import sled_client


class MembershipClientTest(unittest.IsolatedAsyncioTestCase):
    async def fetch(self, response):
        client = SimpleNamespace(get=AsyncMock(return_value=response))
        with patch.object(sled_client, "SLED_BOT_SECRET", "test"), patch.object(sled_client, "get_http_client", return_value=client):
            return await sled_client.fetch_chat_members(2_000_000_001)

    async def test_legacy_bot_error_is_explained(self):
        ids, error = await self.fetch(httpx.Response(503, json={"error": "membership_unavailable"}))
        self.assertEqual(ids, [])
        self.assertIn("права администратора", error)
        self.assertNotIn("membership_unavailable", error)

    async def test_safe_vk_code_without_secret_body(self):
        _, error = await self.fetch(httpx.Response(503, json={"error": "membership_unavailable", "token": "SECRET", "diagnostics": {"attempts": [{"vk_error_code": 15}, {"vk_error_code": "SECRET"}, {"vk_error_code": True}, {"vk_error_code": 15}]}}))
        self.assertIn("Код VK: 15.", error)
        self.assertNotIn("SECRET", error)

    async def test_unknown_body_and_auth_are_not_confused(self):
        _, error = await self.fetch(httpx.Response(500, text="SECRET"))
        self.assertIn("HTTP 500", error)
        self.assertNotIn("SECRET", error)
        _, error = await self.fetch(httpx.Response(401, text="SECRET"))
        self.assertIn("SLED_BOT_SECRET", error)

    async def test_valid_and_invalid_response(self):
        self.assertEqual(await self.fetch(httpx.Response(200, json={"member_ids": [10, -1, True, 20]})), ([10, 20], None))
        ids, error = await self.fetch(httpx.Response(200, json={"wrong": []}))
        self.assertEqual(ids, [])
        self.assertIn("некорректный", error)

    async def test_timeout_is_separate(self):
        client = SimpleNamespace(get=AsyncMock(side_effect=httpx.ReadTimeout("SECRET")))
        with patch.object(sled_client, "SLED_BOT_SECRET", "test"), patch.object(sled_client, "get_http_client", return_value=client):
            _, error = await sled_client.fetch_chat_members(2_000_000_001)
        self.assertIn("не успел", error)
        self.assertNotIn("SECRET", error)


if __name__ == "__main__":
    unittest.main()
