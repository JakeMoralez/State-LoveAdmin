"""Run with data/forum19-check/Scripts/python.exe; all connections are fake/local."""
import asyncio
import io
import json
import logging
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BOT = Path(__file__).resolve().parents[3] / "State-LoveBot"
sys.path.insert(0, str(BOT))
sys.path.insert(0, str(BOT / "tests"))
from test_forum_session import FakeAPI, OLD, NEW
from services import forum_api as forum, forum_cookies_store as store, forum_diagnostics as diag


class Forum19Tests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "cookies.json"
        self.enterContext(patch.object(store, "_STORE_PATH", self.path))
        self.enterContext(patch.object(forum.ForumService, "_read_cookies_from_env", return_value=OLD))
        self.enterContext(patch.object(forum, "ArizonaAPI", FakeAPI))
        self.enterContext(patch.object(forum, "_HAS_ARIZONA", True))
        FakeAPI.instances = []; FakeAPI.failure = None; FakeAPI.started = None; FakeAPI.proceed = None
        FakeAPI.member = SimpleNamespace(username="Test")
        store.save_persisted_cookies(OLD)
        self.service = forum.ForumService()
        self.previous = FakeAPI("old", OLD)
        self.service._api = self.previous; self.service._backend = "arizona"

    async def test_timeout_cancels_trial_closes_it_and_preserves_previous(self):
        original = self.path.read_bytes()
        FakeAPI.started = asyncio.Event(); FakeAPI.proceed = asyncio.Event()
        bounded = diag.bounded_operation(.02)(forum.ForumService.apply_cookies.__wrapped__)
        report = await bounded(self.service, NEW, "new")
        self.assertEqual(report.error_kind, "timeout")
        self.assertFalse(report.applied)
        self.assertTrue(FakeAPI.instances[-1].closed)
        self.assertFalse(self.previous.closed)
        self.assertIs(self.service.api, self.previous)
        self.assertEqual(self.path.read_bytes(), original)
        self.assertFalse(self.service._session_lock.locked())

    async def test_timeout_after_commit_returns_applied_result(self):
        async def slow_close():
            await asyncio.sleep(.06)
            self.previous.closed = True
        self.previous.close = slow_close
        bounded = diag.bounded_operation(.02)(forum.ForumService.apply_cookies.__wrapped__)
        report = await bounded(self.service, NEW, "new")
        self.assertTrue(report.ok)
        self.assertTrue(report.applied)
        self.assertIsNot(self.service.api, self.previous)
        self.assertEqual(store.load_persisted_cookies()["xf_user"], NEW["xf_user"])
        self.assertTrue(self.previous.closed)

    async def test_structured_trace_does_not_forward_raw_messages(self):
        async def operation(service):
            sdk = logging.getLogger("arizona_forum_async")
            sdk.debug("HTTP %s %s -> %s за %.3fs", "GET", "/account/", 401, .125)
            sdk.error("https://user:CANARY_PASSWORD@example.com/?_xfToken=CANARY_TOKEN")
            return forum.ForumHealthReport(True, True, False, error_kind="authentication")
        await diag.bounded_operation(1)(operation)(self.service)
        payload = json.dumps(self.service.diagnostics())
        self.assertNotIn("CANARY", payload)
        self.assertNotIn("xf_user", payload)
        self.assertEqual(self.service.diagnostics()["last_check"]["http_status"], 401)
        self.assertEqual(self.service.diagnostics()["last_check"]["path"], "/account/")

    async def test_sdk_queue_cancel_does_not_cancel_other_waiters(self):
        from arizona_forum_async.request_queue import RequestQueue
        queue = RequestQueue(interval=.02, max_requests=100, window_seconds=1)
        await queue.acquire()
        cancelled = asyncio.create_task(queue.acquire())
        surviving = asyncio.create_task(queue.acquire())
        await asyncio.sleep(0)
        cancelled.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await cancelled
        await asyncio.wait_for(surviving, 1)

    def test_exact_installed_revision_and_public_session_contract(self):
        metadata = diag.library_info()
        self.assertEqual(metadata["version"], "1.9")
        self.assertEqual(metadata["revision"], "f904e7fc03f67907f542658e3f7c3d13d3058263")
        from arizona_forum_async import ArizonaAPI
        self.assertTrue(isinstance(ArizonaAPI.session, property))


if __name__ == "__main__":
    unittest.main()
