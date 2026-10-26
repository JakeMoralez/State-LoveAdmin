"""Case grants regression checks using disposable panel/bot databases only."""
import asyncio
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from unittest.mock import AsyncMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from tortoise import Tortoise
from app.models.bot import User, UserServerAccess
from app.models.panel import LootCase, LootCasePrize, LootCaseGrant, LootCaseReward, PanelAuditLog
from app.services import case_grants as svc
from app.services.cases import spin_case


class CasesTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await Tortoise.init(config={"connections": {"default": "sqlite://:memory:", "bot": "sqlite://:memory:"}, "apps": {
            "models": {"models": ["app.models.panel"], "default_connection": "default"},
            "bot": {"models": ["app.models.bot"], "default_connection": "bot"}}})
        self.addAsyncCleanup(Tortoise.close_connections)
        await Tortoise.generate_schemas()
        self.names = patch.object(svc, "resolve_display_names", AsyncMock(return_value={100: "Manager", 200: "Recipient"}))
        self.names.start()
        self.enterContext(patch("app.services.display_names.resolve_display_names", AsyncMock(return_value={100: "Manager", 200: "Recipient"})))
        self.manager = {"vk_id": 100, "access_level": 5, "nickname": "Manager"}
        self.recipient = {"vk_id": 200, "access_level": 1, "nickname": "Recipient"}
        for vk, level in [(100, 5), (200, 1), (300, 0)]:
            await User.create(vk_id=vk, username=str(vk), added_at=datetime.now(timezone.utc))
            await UserServerAccess.create(user_id=vk, server_id=30, access_level=level, granted_at=datetime.now(timezone.utc))
        self.case = await LootCase.create(title="Original", created_by_vk_id=100)
        for i in range(2):
            await LootCasePrize.create(case_id=self.case.id, title=f"Prize {i}", weight=i + 1)

    async def asyncTearDown(self):
        self.names.stop()
        await Tortoise.close_connections()

    async def grant(self, recipient=200, key=None):
        return await svc.grant_case(self.manager, self.case.id, recipient, key or str(uuid4()))

    async def test_permissions_and_active_recipient(self):
        for level in range(1, 5):
            with self.assertRaises(HTTPException) as error:
                await svc.grant_case({**self.manager, "access_level": level}, self.case.id, 200, str(uuid4()))
            self.assertEqual(error.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            await self.grant(300)
        grant = await self.grant()
        with self.assertRaises(HTTPException):
            await svc.open_grant(grant["id"], self.manager)

    async def test_grant_retry_and_intentional_repeat(self):
        key = str(uuid4())
        first = await self.grant(key=key)
        self.assertEqual((await self.grant(key=key))["id"], first["id"])
        self.assertNotEqual((await self.grant())["id"], first["id"])
        with self.assertRaises(HTTPException):
            await self.grant(100, key=key)

    async def test_concurrent_grant_retries_create_one_copy(self):
        key = str(uuid4())
        results = await asyncio.gather(*[self.grant(key=key) for _ in range(6)])
        self.assertEqual(len({r["id"] for r in results}), 1)
        self.assertEqual(await LootCaseGrant.all().count(), 1)

    async def test_rarity_policy_is_frozen_with_the_copy(self):
        from app.services.cases import RARITY_DROP_WEIGHT
        grant = await self.grant()
        with patch.dict(RARITY_DROP_WEIGHT, {"": 9999}):
            with patch("app.services.cases.random.choices", side_effect=lambda items, **kwargs: [items[0]]) as choices:
                await svc.open_grant(grant["id"], self.recipient)
        self.assertEqual(choices.call_args_list[0].kwargs["weights"], [50])

    async def test_snapshot_survives_template_deletion(self):
        grant = await self.grant()
        await LootCasePrize.filter(case_id=self.case.id).delete()
        await self.case.delete()
        result = await svc.open_grant(grant["id"], self.recipient)
        self.assertEqual(len(result["prizes"]), 2)
        self.assertEqual((await LootCaseGrant.get(id=grant["id"])).snapshot["title"], "Original")

    async def test_parallel_open_and_repeat_return_one_result(self):
        grant = await self.grant()
        results = await asyncio.gather(*[svc.open_grant(grant["id"], self.recipient) for _ in range(8)])
        self.assertEqual(len({r["spin_token"] for r in results}), 1)
        self.assertEqual(sum(not r["already_opened"] for r in results), 1)
        self.assertEqual(await LootCaseReward.all().count(), 1)
        self.assertEqual(await PanelAuditLog.filter(action="loot_case_spin").count(), 1)
        self.assertEqual((await svc.open_grant(grant["id"], self.recipient))["prize"], results[0]["prize"])

    async def test_failed_audit_rolls_back_reward_and_consumption(self):
        grant = await self.grant()
        with patch.object(PanelAuditLog, "create", AsyncMock(side_effect=RuntimeError("write failed"))):
            with self.assertRaises(RuntimeError):
                await svc.open_grant(grant["id"], self.recipient)
        self.assertEqual((await LootCaseGrant.get(id=grant["id"])).status, "available")
        self.assertEqual(await LootCaseReward.all().count(), 0)

    async def test_revoke_is_final_and_opened_copy_cannot_be_revoked(self):
        grant = await self.grant()
        await svc.revoke_grant(grant["id"], self.manager)
        with self.assertRaises(HTTPException):
            await svc.open_grant(grant["id"], self.recipient)
        second = await self.grant()
        await svc.open_grant(second["id"], self.recipient)
        with self.assertRaises(HTTPException):
            await svc.revoke_grant(second["id"], self.manager)

    async def test_self_grant_and_self_fulfillment_allowed(self):
        grant = await self.grant(100)
        result = await svc.open_grant(grant["id"], self.manager)
        reward = await svc.review_reward(result["reward_id"], self.manager, "issue")
        self.assertEqual(reward["status"], "issued")
        await svc.review_reward(reward["id"], self.manager, "issue")
        self.assertEqual(await PanelAuditLog.filter(action="issuance_case_issue").count(), 1)
        await svc.review_reward(reward["id"], self.manager, "unissue")
        await svc.review_reward(reward["id"], self.manager, "reject")
        self.assertEqual(len((await LootCaseReward.get(id=reward["id"])).history), 3)

    async def test_visibility_does_not_expose_other_rewards(self):
        own = await self.grant()
        other = await self.grant(100)
        result = await svc.open_grant(own["id"], self.recipient)
        await svc.open_grant(other["id"], self.manager)
        self.assertEqual((await svc.list_rewards(self.recipient))["total"], 1)
        self.assertEqual((await svc.list_rewards(self.manager))["total"], 2)
        self.assertEqual((await svc.list_grants(self.recipient))["total"], 1)
        with self.assertRaises(HTTPException):
            await svc.list_grants(self.recipient, all_grants=True)
        with self.assertRaises(HTTPException):
            await svc.review_reward(result["reward_id"], self.recipient, "issue")

    async def test_preview_does_not_create_inventory_or_rewards(self):
        await spin_case(self.case.id)
        self.assertEqual(await LootCaseGrant.all().count(), 0)
        self.assertEqual(await LootCaseReward.all().count(), 0)

    async def test_http_contract_and_money_permissions_are_separate(self):
        from app.routers.case_inventory import router, rewards_router
        from app.routers.issuance import router as money_router
        from app.services.auth import require_ca_user
        app = FastAPI()
        app.include_router(router); app.include_router(rewards_router); app.include_router(money_router)
        actor = self.manager
        app.dependency_overrides[require_ca_user] = lambda: actor
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            key = str(uuid4())
            response = await client.post("/api/cases/grants", json={"case_id": self.case.id, "recipient_vk_id": 200, "request_key": key})
            self.assertEqual(response.status_code, 200)
            grant_id = response.json()["id"]
            actor = self.recipient
            self.assertEqual((await client.get("/api/cases/templates")).status_code, 403)
            self.assertEqual((await client.get("/api/issuance?kind=az")).status_code, 403)
            result = await client.post(f"/api/cases/grants/{grant_id}/open")
            self.assertEqual(result.status_code, 200)
            reward_id = result.json()["reward_id"]
            retry = await client.post(f"/api/cases/grants/{grant_id}/open")
            self.assertEqual(retry.json()["spin_token"], result.json()["spin_token"])
            self.assertEqual((await client.get("/api/issuance/cases")).json()["total"], 1)
            self.assertEqual((await client.post(f"/api/issuance/cases/{reward_id}/issue")).status_code, 403)
            actor = self.manager
            self.assertEqual((await client.post(f"/api/issuance/cases/{reward_id}/issue")).json()["status"], "issued")

    async def test_conflicting_reviews_do_not_overwrite_history(self):
        grant = await self.grant()
        reward = await svc.open_grant(grant["id"], self.recipient)
        results = await asyncio.gather(svc.review_reward(reward["reward_id"], self.manager, "issue"),
                                       svc.review_reward(reward["reward_id"], self.manager, "reject"), return_exceptions=True)
        self.assertEqual(sum(isinstance(r, HTTPException) and r.status_code == 409 for r in results), 1)
        self.assertEqual(len((await LootCaseReward.get(id=reward["reward_id"])).history), 1)

    async def test_existing_money_issuance_is_not_duplicated_by_case_wins(self):
        from app.services import issuance
        from app.models.panel import IssuanceRequest, IssuanceLine
        creator = {**self.manager, "access_level": 3}
        with patch.object(issuance, "_notify_managers", AsyncMock()):
            with patch.object(issuance, "resolve_display_names", AsyncMock(return_value={100: "Manager"})):
                bag = await issuance.create_request(server_id=30, user=creator, kind="az", role_title="Следящий",
                    nickname="Recipient", amount=100, reason="Отчёт", proof_url="")
                self.assertEqual(bag["status"], "pending")
                grant = await self.grant()
                await svc.open_grant(grant["id"], self.recipient)
                issued = await issuance.issue_request(bag["id"], self.manager)
                self.assertEqual(issued["status"], "issued")
        self.assertEqual(await IssuanceRequest.all().count(), 1)
        self.assertEqual(await IssuanceLine.all().count(), 1)
        self.assertEqual(await LootCaseReward.all().count(), 1)


if __name__ == "__main__":
    unittest.main()
