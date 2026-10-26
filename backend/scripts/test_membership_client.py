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

    async def test_legacy_inaccessible_chat_is_skipped(self):
        self.assertEqual(await self.fetch(httpx.Response(503, json={"error": "membership_unavailable"})), (None, None))

    async def test_safe_vk_code_without_secret_body(self):
        self.assertEqual(await self.fetch(httpx.Response(503, json={"error": "membership_unavailable", "token": "SECRET", "diagnostics": {"attempts": [{"vk_error_code": 15}, {"vk_error_code": "SECRET"}, {"vk_error_code": True}, {"vk_error_code": 15}]}})), (None, None))

    async def test_unknown_body_and_auth_are_not_confused(self):
        _, error = await self.fetch(httpx.Response(500, text="SECRET"))
        self.assertIn("HTTP 500", error)
        self.assertNotIn("SECRET", error)
        _, error = await self.fetch(httpx.Response(401, text="SECRET"))
        self.assertIn("SLED_BOT_SECRET", error)

    async def test_group_only_chat_access_failure_does_not_request_user_token(self):
        self.assertEqual(await self.fetch(httpx.Response(503, json={"error": "membership_unavailable", "diagnostics": {"user_token_configured": False, "attempts": [{"vk_error_code": 5}, {"vk_error_code": 917}]}})), (None, None))

    async def test_user_token_hint_only_if_configured(self):
        _, error = await self.fetch(httpx.Response(503, json={"error": "membership_unavailable", "diagnostics": {"user_token_configured": True, "attempts": [{"vk_error_code": 5}]}}))
        self.assertIn("VK_USER_TOKEN", error)

    async def test_missing_admin_is_distinct_from_missing_chat_access(self):
        for code in [7, 15, 917, 922, 925, 927, 932]:
            self.assertEqual(await self.fetch(httpx.Response(503, json={"error": "membership_unavailable", "diagnostics": {"attempts": [{"vk_error_code": code}]}})), (None, None))

    async def test_network_failure_is_not_hidden_with_access_refusal(self):
        ids, error = await self.fetch(httpx.Response(503, json={"error": "membership_unavailable", "diagnostics": {"attempts": [{"vk_error_code": 917}, {"error_kind": "request_failed"}]}}))
        self.assertEqual(ids, [])
        self.assertTrue(error)

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
