"""Uses the sibling bot with fake VK responses; no external requests or DB writes."""
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "State-LoveBot"))
from vkbottle.exception_factory import VKAPIError
from services import messaging
from services.sled_internal_api import handle_chat_members


def fake_api(*, result=None, error=None):
    return SimpleNamespace(request=AsyncMock(return_value=result, side_effect=error), messages=SimpleNamespace(get_conversation_members=AsyncMock()))


class BotMembershipTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.object(messaging, "VK_USER_TOKEN", ""))

    async def test_group_variant_can_succeed_after_vk_refusal(self):
        api = fake_api(error=[VKAPIError[15](error_msg="SECRET"), {"response": {"items": [{"member_id": 101}, {"member_id": -99}]}}])
        ids = await messaging.MessagingService(api, group_id=123).get_member_ids(2_000_000_001, strict=True)
        self.assertEqual(ids, [101])
        self.assertNotIn("group_id", api.request.call_args_list[0].args[1])
        self.assertEqual(api.request.call_args_list[1].args[1]["group_id"], 123)
        api.messages.get_conversation_members.assert_not_awaited()

    async def test_failure_preserves_only_safe_codes(self):
        api = fake_api(error=VKAPIError[15](error_msg="SECRET", request_params=[{"key": "access_token", "value": "SECRET"}]))
        user = fake_api(error=VKAPIError[5](error_msg="SECRET"))
        with self.assertLogs(messaging.logger, level="WARNING") as logs:
            with self.assertRaises(messaging.ChatMembershipUnavailable) as caught:
                await messaging.MessagingService(api, user_api=user).get_member_ids(2_000_000_001, strict=True)
        self.assertEqual([x["vk_error_code"] for x in caught.exception.attempts], [15, 15, 5])
        self.assertNotIn("SECRET", json.dumps(caught.exception.attempts) + str(logs.output))
        api.messages.get_conversation_members.assert_not_awaited()

    async def test_user_fallback_is_preserved(self):
        group = fake_api(error=VKAPIError[15](error_msg="denied"))
        user = fake_api(result={"items": [{"member_id": 123}]})
        self.assertEqual(await messaging.MessagingService(group, user_api=user).get_member_ids(2_000_000_001, strict=True), [123])

    async def test_empty_strict_and_best_effort(self):
        api = fake_api(result={"items": []})
        service = messaging.MessagingService(api)
        self.assertEqual(await service.get_member_ids(2_000_000_001), [])
        with self.assertRaises(messaging.ChatMembershipUnavailable) as caught:
            await service.get_member_ids(2_000_000_001, strict=True)
        self.assertTrue(all(x["error_kind"] == "empty_response" for x in caught.exception.attempts))

    async def test_pagination_is_preserved(self):
        api = fake_api(error=[{"items": [{"member_id": x} for x in range(1, 201)]}, {"items": [{"member_id": 201}]}])
        self.assertEqual(len(await messaging.MessagingService(api).get_member_ids(2_000_000_001, strict=True)), 201)
        self.assertEqual(api.request.call_args_list[1].args[1]["offset"], 200)

    async def test_handler_returns_safe_diagnostics(self):
        request = SimpleNamespace(rel_url=SimpleNamespace(query={"peer_id": "2000000001"}), app={"vk_api": fake_api(error=VKAPIError[15](error_msg="SECRET"))})
        with patch("services.sled_internal_api._check_secret", return_value=True), patch("config.settings.VK_USER_TOKEN", ""):
            response = await handle_chat_members(request)
        self.assertEqual(response.status, 503)
        body = json.loads(response.text)
        self.assertEqual(body["error"], "membership_unavailable")
        self.assertEqual(body["diagnostics"]["attempts"][0]["vk_error_code"], 15)
        self.assertNotIn("SECRET", response.text)


if __name__ == "__main__":
    unittest.main()
