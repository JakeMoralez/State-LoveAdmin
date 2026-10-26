"""Isolated regression checks; never connects to the configured bot database."""
import sys
import sqlite3
import tempfile
from contextlib import closing
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tortoise import Tortoise
from app.models.panel import PanelAuditLog, LootCase
from app.services.activity_log import list_activity
from app.services.audit import log_audit
from app.services.case_duration_migration import migrate_case_duration, KEY
from app.services.cases import normalize_spin_duration_ms


class InterfaceUpdatesTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "panel.sqlite3"
        self.url = "sqlite://" + str(self.path)
        await Tortoise.init(config={"connections": {"default": self.url}, "apps": {
            "models": {"models": ["app.models.panel"], "default_connection": "default"}}})
        await Tortoise.generate_schemas()

    async def asyncTearDown(self):
        await Tortoise.close_connections()
        self.directory.cleanup()

    async def test_migration_backs_up_preserves_custom_values_and_runs_once(self):
        conn = Tortoise.get_connection("default")
        # Only the duration column matters here; use the real model table.
        for value in [28000, 12000, 20000, 45000]:
            await LootCase.create(title=str(value), spin_duration_ms=value, created_by_vk_id=1)
        backup = await migrate_case_duration(self.url, Path(self.directory.name) / "backups")
        with closing(sqlite3.connect(backup)) as db:
            self.assertEqual([r[0] for r in db.execute("SELECT spin_duration_ms FROM loot_cases ORDER BY id")], [28000, 12000, 20000, 45000])
        self.assertEqual([r["spin_duration_ms"] for r in await conn.execute_query_dict("SELECT spin_duration_ms FROM loot_cases ORDER BY id")], [14000, 12000, 20000, 45000])
        await conn.execute_query("UPDATE loot_cases SET spin_duration_ms=28000 WHERE id=1")
        self.assertIsNone(await migrate_case_duration(self.url, Path(self.directory.name) / "backups"))
        self.assertEqual((await conn.execute_query_dict("SELECT spin_duration_ms FROM loot_cases WHERE id=1"))[0]["spin_duration_ms"], 28000)

    async def test_backup_failure_does_not_apply_or_mark_migration(self):
        with patch("app.services.case_duration_migration.backup_panel", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                await migrate_case_duration(self.url, Path(self.directory.name))
        self.assertFalse(await Tortoise.get_connection("default").execute_query_dict("SELECT key FROM panel_migrations WHERE key=?", [KEY]))

    async def test_hidden_legacy_events_do_not_affect_counts_or_person_pagination(self):
        for action in ["arz_lead_cookies", "dev_forum_cookies", "loot_case_update", "loot_case_prize_update", "loot_case_spin", "loot_case_spin"]:
            await PanelAuditLog.create(actor_vk_id=123, action=action, entity_type="case", entity_id="1", detail={})
        with patch("app.services.activity_log.resolve_display_names", AsyncMock(return_value={123: "Test"})):
            for query in [{"vk_id": 123}, {"group": "cases"}, {"actions": ["loot_case_spin", "loot_case_update"]}]:
                result = await list_activity(limit=1, offset=1, **query)
                self.assertEqual(result["total"], 2)
                self.assertEqual([item["action"] for item in result["items"]], ["loot_case_spin"])

    async def test_cookie_and_case_edit_writes_are_skipped_before_bot_lookup(self):
        for action in ["arz_lead_cookies", "dev_forum_cookies", "loot_case_create", "loot_case_prize_bulk"]:
            await log_audit(123, action, "case", 1)
        self.assertEqual(await PanelAuditLog.all().count(), 0)

    def test_knowledge_excerpt_keeps_note_content_and_original_body(self):
        from app.routers.knowledge import _plain_excerpt
        for marker in ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION", "INFO", "DANGER"]:
            body = f"# Заголовок\r\n> [!{marker}]\r\n> Содержимое заметки и [ссылка](https://example.com)."
            original = body
            excerpt = _plain_excerpt(body)
            self.assertNotIn("[!", excerpt)
            self.assertIn("Содержимое заметки", excerpt)
            self.assertIn("ссылка", excerpt)
            self.assertEqual(body, original)

    def test_duration_contract_preserves_twelve_and_twenty_seconds(self):
        self.assertEqual(normalize_spin_duration_ms(None), 14000)
        for value in [3000, 12000, 14000, 20000, 28000, 45000]:
            self.assertEqual(normalize_spin_duration_ms(value), value)

    async def test_portal_settings_do_not_ping_bot(self):
        from app.routers import dev
        with patch.object(dev, "ping_bot", AsyncMock(side_effect=AssertionError("unexpected network"))) as ping:
            with patch.object(dev, "count_staff", AsyncMock(return_value=2)):
                response = await dev.get_dev_portal({"access_level": 11, "vk_id": 123})
        self.assertIn("settings", response)
        self.assertEqual(response["staff_count"], 2)
        ping.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
