"""Forum-list regression tests. Only temporary databases and fake HTTP responses."""
import asyncio
import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from tortoise import Tortoise

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import forum_list_data as engine, forum_list as svc, forum_list_provider as upstream, forum_list_key as keys
from app.models.panel import ForumListSettings, ForumListSnapshot, PanelAuditLog

CANARY = "test-only-secret-not-a-real-key"


def fixture():
    def row(id, rank=9, date="2026-10-01", **kw):
        return {"leader_id": id, "nickname": f"User_{id}", "rank": rank, "rank_name": "Лидер" if rank == 10 else "Заместитель",
                "post_date": date, "term_days": 30, "vk_id": str(id), "vk_url": f"https://vk.ru/id{id}", "discord_id": "123456789012345678", **kw}
    result = {"fractions": [
        {"fraction_id": 1, "name": "Полиция", "fraction_name": "LSPD", "government": True, "leaders": [row(10, 10), row(30, date="2026-10-03"), row(20)]},
        {"fraction_id": 13, "name": "Баллас", "fraction_name": "Ballas", "government": False, "leaders": [row(40, 10)]}],
        "leaders": [row(10, 10, fraction_id=1, points=10, post_reason="Назначен"), row(20, fraction_id=1)],
        "judges": [row(50, 12, fraction_id=201, rank_name="Судья")], "ministers": [],
        "administration": [
            {"nickname": "Z_Admin", "role": "ГА", "role_stage": 13, "spheres": ["Сервер"], "online_7_days": None},
            {"nickname": "A_Admin", "role": "ГА", "role_stage": 13, "spheres": ["Сервер"], "online_7_days": "01:02:03"},
            {"nickname": "Other", "role": "Куратор", "role_stage": 13, "spheres": ["Сервер"], "online_7_days": None}]}
    for fid in [2, 3, 4, 5, 6, 7, 9, 10, 20, 22, 23, 27, 32]:
        result["fractions"].append({"fraction_id": fid, "name": f"Организация {fid}", "fraction_name": f"ORG{fid}", "government": True, "leaders": []})
    return result


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.data = engine.normalize(fixture(), 30)

    def test_vk_fallback_requires_unique_name_organization_and_role(self):
        from app.services.forum_list_contacts import apply_contacts
        row = self.data['fractions'][0]['leaders'][0]
        row.update(nickname='Ivan_Volkov', vk_id='', vk_url='')
        apply_contacts(self.data, [('[LSPD][9] Ivan_Volkov', 'LSPD', 'deputy', 100),
                                   ('Ivan_Volkov', 'FBI', 'leader', 200)])
        self.assertEqual(row['vk_url'], '')
        apply_contacts(self.data, [('[LSPD][10] Ivan Volkov', 'LSPD', 'leader', 300)])
        self.assertEqual(row['vk_url'], 'https://vk.ru/id300')
        apply_contacts(self.data, [('Ivan_Volkov', 'LSPD', 'leader', 400)])
        self.assertEqual(row['vk_id'], '300')
        row.update(vk_id='', vk_url='')
        apply_contacts(self.data, [('Ivan_Volkov', 'LSPD', 'leader', 300), ('Ivan_Volkov', 'LSPD', 'leader', 400)])
        self.assertEqual(row['vk_url'], '')

    def test_explicit_slots_are_repeatable_and_independent_of_token_order(self):
        result = engine.render("{{fraction.1.deputies.2.vk_url}} {{fraction.1.deputies.1.nickname}} {{fraction.1.deputies.1.nickname}}", self.data)
        self.assertEqual(result["rendered"], "https://vk.ru/id30 User_20 User_20")
        self.assertEqual(result["errors"], [])

    def test_source_merge_deduplicates_and_sorts(self):
        f = self.data["fractions"][0]
        self.assertEqual([p["leader_id"] for p in f["leaders"]], [10])
        self.assertEqual([p["leader_id"] for p in f["deputies"]], [20, 30])
        self.assertEqual(f["leaders"][0]["post_reason"], "Назначен")

    def test_default_only_contains_government_and_fixed_slots(self):
        template = engine.default_template(self.data)
        self.assertIn("[TABLE", template)
        self.assertIn("[IMG", template)
        self.assertIn("fraction.1.deputies.4.nickname", template)
        self.assertIn("judges.5.nickname", template)
        self.assertIn("fraction.6.vice_governors.1.nickname", template)
        self.assertNotIn("{{ministers.", template)
        self.assertNotIn("fraction.13", template)
        self.assertNotIn("{{admin.", template)
        self.assertIn("Вакантно", engine.render(template, self.data)["rendered"])
        self.assertTrue(any(f["id"] == 13 for f in engine.catalog(self.data)["fractions"]))
        self.assertEqual(template.count('[TABLE width="100%"]'), 15)
        self.assertEqual(len(__import__('re').findall(r'\{\{[^{}]+\.nickname\}\}', template)), 76)
        self.assertIn('rgb(218, 177, 11)', template)
        self.assertIn('Вице-Губернатор', template)
        self.assertEqual(engine.render('{{fraction.6.vice_governors.1.nickname}}', self.data)['rendered'], '—')

    def test_dates_null_values_and_moscow_clock(self):
        text = engine.render("{{fraction.1.leaders.1.planned_end_date}} {{generated_at}}", self.data, datetime(2026, 10, 1, 22, 5, tzinfo=timezone.utc))["rendered"]
        self.assertEqual(text, "31.10.2026 02.10.2026 01:05")
        group = next(g for g in self.data["admin"] if g["name"].startswith("ГА"))
        self.assertEqual(engine.render("{{admin."+group["key"]+".2.online_7_days}}", self.data)["rendered"], "—")
        self.assertEqual([r["nickname"] for r in group["rows"]], ["A_Admin", "Z_Admin"])

    def test_admin_group_does_not_use_portal_or_numeric_stage(self):
        self.assertEqual(len(self.data["admin"]), 2)
        group = self.data["admin"][0]
        result = engine.render("{{admin."+group["key"]+".1.vk_url}}", self.data)
        self.assertIsNone(result["rendered"])
        self.assertNotIn("vk_url", engine.catalog(self.data)["admin_fields"])

    def test_unknown_zero_slot_and_expression_are_errors(self):
        result = engine.render("{{fraction.999.leaders.1.nickname}} {{fraction.1.leaders.0.nickname}} {{__import__('os')}}", self.data)
        self.assertIsNone(result["rendered"])
        self.assertEqual(len(result["errors"]), 3)

    def test_bbcode_data_and_urls_are_safe(self):
        self.data["fractions"][0]["leaders"][0].update(nickname="[url=javascript:x]X[/url]<x>", vk_url="")
        text = engine.render("{{fraction.1.leaders.1.nickname}} {{fraction.1.leaders.1.vk_link}} [URL='{{fraction.1.deputies.9.vk_url}}']VK[/URL]", self.data)["rendered"]
        self.assertNotIn("[url=javascript", text)
        self.assertIn("&#91;", text)
        self.assertIn("&lt;x&gt;", text)
        self.assertTrue(text.endswith("— —"))

    def test_missing_and_overflow(self):
        result = engine.render("{{fraction.1.deputies.1.nickname}} {{fraction.1.deputies.8.post_date}}", self.data)
        self.assertEqual(result["rendered"], "User_20 —")
        self.assertEqual(len(result["warnings"]), 1)

    def test_legacy_import_is_an_explicit_conversion(self):
        result = engine.import_legacy("PLACEHOLDER_DEPUTY_LSPD_NICK PLACEHOLDER_DEPUTY_LSPD_VK PLACEHOLDER_DEPUTY_LSPD_NICK PLACEHOLDER_DEPUTY_LSPD_DATEAPPOINTMENT", self.data, {})
        self.assertEqual(result["errors"], [])
        self.assertIn("{{fraction.1.deputies.2.post_date}}", result["template"])
        result = engine.import_legacy("PLACEHOLDER_MINCNN_GOV_NICK", self.data, {})
        self.assertTrue(result["errors"])


class ServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_contacts_use_only_active_local_offices_on_same_server(self):
        from app.models.bot import User, UserServerAccess
        from app.services.forum_list_contacts import supplement_contacts
        await User.create(vk_id=700, username='User', added_at=svc.now())
        await UserServerAccess.create(user_id=700, server_id=30, access_level=0, is_leader=True, nickname='[LSPD][10] Ivan_Volkov', granted_at=svc.now())
        row = self.data['fractions'][0]['leaders'][0]
        row.update(nickname='Ivan_Volkov', vk_id='', vk_url='')
        await supplement_contacts(self.data, 31)
        self.assertEqual(row['vk_url'], '')
        await supplement_contacts(self.data, 30)
        self.assertEqual(row['vk_url'], 'https://vk.ru/id700')
        row.update(vk_id='', vk_url='')
        await UserServerAccess.filter(user_id=700).update(access_level=2)
        await supplement_contacts(self.data, 30)
        self.assertEqual(row['vk_url'], '')

    async def asyncSetUp(self):
        await Tortoise.init(config={"connections": {"default": "sqlite://:memory:", "bot": "sqlite://:memory:"},
            "apps": {"models": {"models": ["app.models.panel"], "default_connection": "default"},
                     "bot": {"models": ["app.models.bot"], "default_connection": "bot"}}})
        self.addAsyncCleanup(Tortoise.close_connections)
        self.addAsyncCleanup(svc.shutdown)
        await Tortoise.generate_schemas()
        self.enterContext(patch.object(svc, "FORUM_LIST_API_KEY", CANARY))
        self.data = engine.normalize(fixture(), 30)
        self.settings, self.snapshot = await svc.rows()
        await ForumListSettings.filter(server_id=30).update(template=engine.default_template(self.data), version=1)
        await ForumListSnapshot.filter(server_id=30).update(data=self.data, key_fingerprint=svc.fingerprint(), fetched_at=svc.now(), external_server_id=30)
        self.editor = {"vk_id": 100, "access_level": 7, "nickname": "Editor"}

    async def test_permissions_saved_render_and_editor_preview(self):
        for level in range(1, 7):
            user = {"vk_id": 100, "access_level": level}
            self.assertTrue((await svc.preview(user))["rendered"])
            with self.assertRaises(Exception) as error:
                await svc.preview(user, "{{generated_at}}")
            self.assertEqual(error.exception.status_code, 403)
            with self.assertRaises(Exception) as error:
                await svc.save(user, 1, "{{generated_at}}", {})
            self.assertEqual(error.exception.status_code, 403)
        self.assertTrue((await svc.preview(self.editor, "{{generated_at}}"))["rendered"])

    async def test_optimistic_save_reset_and_audit(self):
        result = await svc.save(self.editor, 1, "{{generated_at}}", {})
        self.assertEqual(result["settings"]["version"], 2)
        with self.assertRaises(Exception) as error:
            await svc.save(self.editor, 1, "{{server_id}}", {})
        self.assertEqual(error.exception.status_code, 409)
        result = await svc.save(self.editor, 2, None, None, reset=True)
        self.assertEqual(result["settings"]["version"], 3)
        events = await PanelAuditLog.all()
        self.assertEqual(len(events), 2)
        self.assertNotIn(CANARY, str([e.detail for e in events]))
        self.assertNotIn("template", events[0].detail)

    async def test_noop_and_reading_do_not_add_audit(self):
        settings, _ = await svc.rows()
        await svc.save(self.editor, 1, settings.template, {})
        await svc.state()
        await svc.preview(self.editor)
        self.assertEqual(await PanelAuditLog.all().count(), 0)

    async def test_invalid_tokens_do_not_replace_template(self):
        with self.assertRaises(Exception):
            await svc.save(self.editor, 1, "{{missing}}", {})
        self.assertEqual((await svc.rows())[0].version, 1)

    async def test_key_change_hides_old_snapshot(self):
        with patch.object(svc, "FORUM_LIST_API_KEY", "different-key"):
            state = await svc.state()
            self.assertIsNone(state["result"])
            self.assertIsNone(state["fetched_at"])
            self.assertEqual(state["catalog"]["fractions"], [])

    async def test_refresh_is_shared_and_preserves_saved_template(self):
        await ForumListSnapshot.filter(server_id=30).update(fetched_at=svc.now()-timedelta(minutes=10))
        gate = asyncio.Event()
        fake = SimpleNamespace(client=SimpleNamespace(aclose=AsyncMock()))
        async def load():
            await gate.wait()
            return 30, fixture()
        fake.load = AsyncMock(side_effect=load)
        with patch.object(svc, "Provider", return_value=fake) as constructor:
            await asyncio.gather(*(svc.start_refresh() for _ in range(6)))
            await asyncio.sleep(0)
            self.assertEqual(constructor.call_count, 1)
            gate.set()
            await asyncio.gather(*list(svc._tasks.values()))
        state = await svc.state()
        self.assertEqual(state["settings"]["version"], 1)
        self.assertFalse(state["stale"])

    async def test_failed_refresh_keeps_previous_complete_snapshot_and_cools_down(self):
        old = svc.now()-timedelta(minutes=10)
        await ForumListSnapshot.filter(server_id=30).update(fetched_at=old)
        fake = SimpleNamespace(client=SimpleNamespace(aclose=AsyncMock()), load=AsyncMock(side_effect=upstream.ProviderError("timeout", "Таймаут")))
        with patch.object(svc, "Provider", return_value=fake) as constructor:
            await svc.start_refresh()
            await asyncio.gather(*list(svc._tasks.values()))
            await svc.start_refresh()
            self.assertEqual(constructor.call_count, 1)
        state = await svc.state()
        self.assertTrue(state["result"]["rendered"])
        self.assertTrue(state["stale"])
        self.assertEqual(state["error_kind"], "timeout")
        self.assertEqual(state["refresh_status"], "idle")

    async def test_live_api_contract_and_permissions(self):
        from app.main import app
        from app.services.auth import require_ca_user
        actor = {"vk_id": 100, "access_level": 1, "can_dev_panel": False}
        app.dependency_overrides[require_ca_user] = lambda: actor
        self.addCleanup(app.dependency_overrides.clear)
        with patch.object(svc, "start_refresh", AsyncMock()):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/api/forum/list")
                self.assertEqual(response.status_code, 200)
                self.assertNotIn(CANARY, response.text)
                self.assertEqual((await client.post("/api/forum/list/render", json={"template": "custom"})).status_code, 403)
                self.assertEqual((await client.put("/api/forum/list/settings", json={"version": 1, "template": "custom"})).status_code, 403)
                self.assertEqual((await client.post("/api/forum/list/import", json={"template": "old"})).status_code, 403)
                self.assertEqual((await client.get("/api/dev/forum-list-key")).status_code, 403)
                actor["access_level"] = 7
                self.assertEqual((await client.put("/api/forum/list/settings", json={"version": 1, "template": "{{generated_at}}"})).status_code, 200)
                self.assertEqual((await client.put("/api/dev/forum-list-key", json={"key": CANARY})).status_code, 403)
                actor["access_level"] = 11
                response = await client.put("/api/dev/forum-list-key", json={"key": "short-secret"})
                self.assertEqual(response.status_code, 400)
                self.assertNotIn("short-secret", response.text)

    async def test_write_only_key_and_atomic_env_failure(self):
        fake = SimpleNamespace(client=SimpleNamespace(aclose=AsyncMock()), get=AsyncMock(return_value={"data": {"server_id": 30}}))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/".env"
            path.write_text("KEEP='unchanged'\nFORUM_LIST_API_KEY='old'\n", encoding="utf-8")
            with patch.object(keys, "ENV_PATH", path), patch.object(keys, "Provider", return_value=fake), patch.object(svc, "start_refresh", AsyncMock()):
                result = await keys.configure(CANARY)
                self.assertNotIn(CANARY, json.dumps(result))
                self.assertIn("KEEP='unchanged'", path.read_text())
                self.assertIn(CANARY, path.read_text())
                self.assertTrue(result["configured"])
                with patch.object(keys, "write_env_key", side_effect=OSError("SECRET")):
                    with self.assertRaises(Exception) as error:
                        await keys.configure("another-test-key-value")
                    self.assertNotIn("SECRET", str(error.exception))
                    self.assertEqual(svc.FORUM_LIST_API_KEY, CANARY)
                fake.get.side_effect = upstream.ProviderError("authentication", "Ключ отклонён")
                with self.assertRaises(Exception):
                    await keys.configure("invalid-but-safe-test-key")
                self.assertIn(CANARY, path.read_text())


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        upstream._requests.clear()

    async def make_provider(self, handler):
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        self.addAsyncCleanup(client.aclose)
        return upstream.Provider(CANARY, AsyncMock(), AsyncMock(), client)

    async def test_full_pagination_and_authorization(self):
        calls = []
        def handler(request):
            self.assertEqual(request.headers["Authorization"], "Bearer "+CANARY)
            if request.url.path.endswith("/rate-limit"):
                return httpx.Response(200, json={"success": True, "data": {"remaining": 8}})
            page = int(request.url.params["page"])
            calls.append(page)
            return httpx.Response(200, json={"success": True, "data": [{"leader_id": page}], "meta": {"page": page, "pages": 2, "total": 2, "server_id": 30}})
        provider = await self.make_provider(handler)
        self.assertEqual(len(await provider.all_pages("/leaders", 30)), 2)
        self.assertEqual(calls, [1, 2])

    async def test_error_bodies_and_tokens_never_reach_errors(self):
        for status, kind in [(401, "authentication"), (403, "permission"), (500, "upstream")]:
            provider = await self.make_provider(lambda request: httpx.Response(status, text=CANARY))
            with self.assertRaises(upstream.ProviderError) as error:
                await provider.get("/me")
            self.assertEqual(error.exception.kind, kind)
            self.assertNotIn(CANARY, str(error.exception))

    async def test_rate_limit_and_429_wait_without_publishing_partial_data(self):
        sequence = iter([0, 8, 8])
        count = 0
        def handler(request):
            nonlocal count
            if request.url.path.endswith("/rate-limit"):
                return httpx.Response(200, json={"success": True, "data": {"remaining": next(sequence)}})
            count += 1
            return httpx.Response(429) if count == 1 else httpx.Response(200, json={"success": True, "data": {"server_id": 30}})
        provider = await self.make_provider(handler)
        with patch.object(provider, "_wait", AsyncMock()) as wait:
            result = await provider.get("/me")
        self.assertEqual(result["data"]["server_id"], 30)
        self.assertEqual(wait.await_count, 2)

    async def test_network_and_pagination_mismatch_are_errors(self):
        def handler(request):
            raise httpx.ConnectError(CANARY)
        provider = await self.make_provider(handler)
        with self.assertRaises(upstream.ProviderError) as error:
            await provider.get("/me")
        self.assertEqual(error.exception.kind, "connection")
        self.assertNotIn(CANARY, str(error.exception))

    async def test_local_rolling_limit_is_eight_counted_requests(self):
        clock = [100.0]
        upstream._requests.extend([100.0]*8)
        def handler(request):
            return httpx.Response(200, json={"success": True, "data": {"remaining": 8} if request.url.path.endswith('/rate-limit') else {"server_id": 30}})
        provider = await self.make_provider(handler)
        async def wait(seconds):
            self.assertGreaterEqual(seconds, 60)
            clock[0] += seconds
        with patch.object(upstream, 'clock', side_effect=lambda: clock[0]), patch.object(provider, '_wait', side_effect=wait):
            await provider.get('/me')
        self.assertEqual(len(upstream._requests), 1)


class MigrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root/'panel.sqlite3'
        self.url = 'sqlite://'+str(self.path)
        await Tortoise.init(config={"connections": {"default": self.url}, "apps": {"models": {"models": ["app.models.panel"], "default_connection": "default"}}})
        self.addAsyncCleanup(Tortoise.close_connections)
        await Tortoise.get_connection('default').execute_query('CREATE TABLE legacy_data (id INTEGER PRIMARY KEY, value TEXT)')

    async def test_backup_precedes_schema_and_migration_runs_once(self):
        from app.services import forum_list_migration as migration
        with patch('app.config.PANEL_DATABASE_URL', self.url), patch('app.config.BASE_DIR', self.root):
            await migration.prepare()
            backup = next((self.root/'data/backups/forum-list').glob('*.sqlite3'))
            with closing(sqlite3.connect(backup)) as db:
                names = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            self.assertIn('legacy_data', names)
            self.assertNotIn('forum_list_settings', names)
            await Tortoise.generate_schemas()
            await migration.finish()
            with patch.object(migration, 'backup_panel', side_effect=AssertionError('Backup repeated')):
                await migration.prepare()

    async def test_backup_failure_prevents_new_tables(self):
        from app.services import forum_list_migration as migration
        with patch('app.config.PANEL_DATABASE_URL', self.url), patch('app.config.BASE_DIR', self.root), patch.object(migration, 'backup_panel', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                await migration.prepare()
        names = {r['name'] for r in await Tortoise.get_connection('default').execute_query_dict("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertNotIn('forum_list_settings', names)


if __name__ == "__main__":
    unittest.main()
