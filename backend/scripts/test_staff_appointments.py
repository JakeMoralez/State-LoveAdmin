"""Regression checks using two disposable in-memory databases only."""

import asyncio
import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tortoise import Tortoise
from app.models.bot import Chat, ChatPeerSettings, RoleChat, User, UserServerAccess
from app.models.panel import PanelAuditLog, StaffAppointmentArchive, StaffNote
from app.services import bot_users, staff
from app.services.activity_log import list_activity
from app.services.appointments import appointment_snapshot
from app.services.bot_appointments import set_nickname
from app.services.role_assign import assign_leadership
from app.services.audit import log_audit


class AppointmentsTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await Tortoise.init(config={
            "connections": {"default": "sqlite://:memory:", "bot": "sqlite://:memory:"},
            "apps": {
                "bot": {"models": ["app.models.bot"], "default_connection": "bot"},
                "models": {"models": ["app.models.panel"], "default_connection": "default"},
            },
        })
        # Mirror schemas may be generated ONLY in these disposable test databases.
        await Tortoise.generate_schemas()
        bot_users._USA_SENIOR_READY = True
        bot_users._USA_PROMOTED_READY = True
        self.members = patch.object(staff, "collect_office_members", AsyncMock(return_value=({200}, None, True)))
        self.members.start()
        for vk_id, level in [(100, 11), (200, 0), (300, 0)]:
            await User.create(vk_id=vk_id, username=str(vk_id), added_at=datetime.now(UTC))
            await UserServerAccess.create(user_id=vk_id, server_id=30, access_level=level,
                nickname="Alex_Novak" if vk_id == 100 else "Ivan_Volkov", granted_at=datetime.now(UTC))

    async def asyncTearDown(self):
        self.members.stop()
        await Tortoise.close_connections()

    async def test_profile_conversations_show_saved_titles_and_preserve_status(self):
        from app.routers.staff import get_profile_chats

        await RoleChat.create(role="leader", server_id=30, peer_id=2_000_000_101)
        await ChatPeerSettings.create(chat_kind="leader", server_id=30, peer_id=2_000_000_101)
        await RoleChat.create(role="leader", server_id=30, peer_id=2_000_000_102)
        await RoleChat.create(role="judge", server_id=30, peer_id=2_000_000_103)
        await RoleChat.create(role="staff", server_id=30, peer_id=2_000_000_104)
        await Chat.create(server_id=30, peer_id=2_000_000_101, title="  Руководители | LSPD  ")
        await Chat.create(server_id=30, peer_id=2_000_000_102, title="", alias="Суды Love")
        await Chat.create(server_id=31, peer_id=2_000_000_103, title="Чужой сервер")
        async def members(peer):
            return ([200], None) if peer == 2_000_000_101 else ([], "unavailable")
        with patch("app.services.sled_client.fetch_chat_members", members):
            rows = (await get_profile_chats(200, 30, {"vk_id": 100}))["chats"]
        self.assertEqual(len(rows), 4)
        self.assertEqual([r["title"] for r in rows], ["Руководители | LSPD", "Суды Love", "Беседа №103", "Беседа №104"])
        self.assertTrue(rows[0]["present"])
        self.assertIsNone(rows[1]["present"])
        self.assertEqual(rows[0]["label"], "Руководители")

    async def test_partial_membership_warning_names_only_failed_chats(self):
        await Chat.create(server_id=30, peer_id=2_000_000_101, title="Рабочая беседа")
        await Chat.create(server_id=30, peer_id=2_000_000_102, title="Старая беседа")
        fetch = AsyncMock(side_effect=[([200], None), ([], "VK: 917"), ([], "VK: 5")])
        with patch("app.services.sled_client.fetch_chat_members", fetch):
            ids, warning = await staff.collect_peer_members([2_000_000_101, 2_000_000_102, 2_000_000_103, 2_000_000_101])
        self.assertEqual(ids, {200})
        self.assertEqual(fetch.await_count, 3)
        self.assertIn("загружен частично", warning)
        self.assertIn("Старая беседа", warning)
        self.assertIn("2000000102", warning)
        self.assertIn("№103", warning)
        self.assertNotIn("Рабочая беседа", warning)

    async def test_empty_success_is_not_a_membership_failure(self):
        with patch("app.services.sled_client.fetch_chat_members", AsyncMock(return_value=([], None))):
            self.assertEqual(await staff.collect_peer_members([2_000_000_101]), (set(), None))

    async def test_inaccessible_chats_do_not_affect_available_members(self):
        with patch("app.services.sled_client.fetch_chat_members", AsyncMock(side_effect=[([200], None), (None, None)])):
            self.assertEqual(await staff.collect_peer_members([2_000_000_101, 2_000_000_102]), ({200}, None))
        with patch("app.services.sled_client.fetch_chat_members", AsyncMock(return_value=(None, None))):
            self.assertEqual(await staff.collect_peer_members([2_000_000_101]), (set(), None))

    async def test_profile_omits_inaccessible_chat_without_false_absence(self):
        from app.routers.staff import get_profile_chats
        await RoleChat.create(role="leader", server_id=30, peer_id=2_000_000_101)
        await RoleChat.create(role="leader", server_id=30, peer_id=2_000_000_102)
        with patch("app.services.sled_client.fetch_chat_members", AsyncMock(side_effect=[([200], None), (None, None)])):
            rows = (await get_profile_chats(200, 30, {"vk_id": 100}))["chats"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["peer_id"], 2_000_000_101)
        self.assertTrue(rows[0]["present"])

    async def test_chat_member_is_unassigned_and_reads_do_not_write(self):
        before = await UserServerAccess.all().values()
        active, _ = await staff.list_ca_leaders(30)
        unassigned, _ = await staff.list_ca_leaders(30, unassigned=True)
        self.assertEqual(active, [])
        self.assertEqual([r["vk_id"] for r in unassigned], [200])
        self.assertEqual(before, await UserServerAccess.all().values())
        self.assertEqual(await StaffNote.all().count(), 0)

    async def test_active_staff_in_leader_chat_is_not_unassigned(self):
        await UserServerAccess.filter(user_id=200).update(access_level=7, nickname="[ГС ГОС] Ivan_Volkov")
        before = await UserServerAccess.all().values()
        self.assertEqual((await staff.list_ca_leaders(30, unassigned=True))[0], [])
        self.assertEqual((await staff.list_ca_leaders(30))[0], [])
        self.assertEqual(before, await UserServerAccess.all().values())

    async def test_active_office_is_excluded_from_staff_unassigned(self):
        from app.services.appointments import active_appointment_ids
        await UserServerAccess.filter(user_id=200).update(is_leader=True, nickname="[LSPD][9] Ivan_Volkov")
        self.assertEqual(await active_appointment_ids(30), {100, 200})
        self.assertEqual(await active_appointment_ids(31), set())

    async def test_explicit_nickname_appoints_and_revoke_does_not_resurrect(self):
        await set_nickname(actor=100, vk_id=200, server_id=30, nickname="[LSPD][9] Ivan_Volkov")
        self.assertEqual((await appointment_snapshot(30, 200))["position"], "Заместитель")
        self.assertEqual(len((await staff.list_ca_leaders(30))[0]), 1)
        await staff.revoke_ca_leader_full(30, 200, updated_by=100)
        access = await UserServerAccess.get(user_id=200, server_id=30)
        self.assertEqual(access.nickname, "Ivan_Volkov")
        # Even a stale tagged nickname cannot appoint on a read.
        await UserServerAccess.filter(id=access.id).update(nickname="[LSPD][9] Ivan_Volkov")
        self.assertEqual((await staff.list_ca_leaders(30))[0], [])
        self.assertEqual(await StaffAppointmentArchive.all().count(), 1)

    async def test_transfer_preserves_single_profile_and_closes_previous_role(self):
        await assign_leadership(30, 200, role_type="deputy", nickname="Ivan_Volkov", org_tag="LSPD", granted_by=100)
        await staff.assign_staff_member(30, 200, nickname="Ivan_Volkov", access_level=2,
            spheres=["health", "defense"], is_senior=True, senior_spheres=["health"], granted_by=100)
        access = await UserServerAccess.get(user_id=200, server_id=30)
        self.assertFalse(access.is_leader)
        self.assertEqual((await staff.get_staff_member(30, 200))["senior_spheres"], ["health"])
        self.assertEqual((await staff.list_ca_leaders(30))[0], [])
        self.assertEqual(await StaffAppointmentArchive.filter(vk_id=200, kind="leader").count(), 1)
        await assign_leadership(30, 200, role_type="leader", nickname="Ivan_Volkov", org_tag="LSPD", granted_by=100)
        access = await UserServerAccess.get(id=access.id)
        self.assertEqual(access.access_level, 0)
        self.assertEqual(access.senior_spheres, [])
        self.assertEqual((await StaffNote.get(vk_id=200, server_id=30)).spheres, [])

    async def test_seniority_changes_only_selected_scope(self):
        await staff.assign_staff_member(30, 200, nickname="Ivan_Volkov", access_level=2,
            spheres=["health", "defense"], is_senior=True, senior_spheres=["health"], granted_by=100)
        await staff.update_staff_member(30, 200, is_senior=False, senior_spheres=[], granted_by=100)
        row = await staff.get_staff_member(30, 200)
        self.assertEqual(set(row["spheres"]), {"health", "defense"})
        self.assertFalse(row["is_senior"])
        self.assertEqual(row["access_level"], 2)

    async def test_promotion_does_not_convert_seniority_to_extra_duties(self):
        await staff.assign_staff_member(30, 200, nickname="Ivan_Volkov", access_level=2,
            spheres=["health", "defense"], is_senior=True, senior_spheres=["health"], granted_by=100)
        await staff.update_staff_member(30, 200, access_level=3, granted_by=100)
        row = await staff.get_staff_member(30, 200)
        self.assertEqual(row["senior_spheres"], [])
        self.assertFalse(row["is_senior"])

    async def test_invalid_seniority_does_not_mutate_access(self):
        before = await UserServerAccess.get(user_id=200, server_id=30)
        with self.assertRaises(ValueError):
            await staff.assign_staff_member(30, 200, nickname="Ivan_Volkov", access_level=2,
                spheres=["defense"], is_senior=True, senior_spheres=["health"], granted_by=100)
        self.assertEqual((await UserServerAccess.get(id=before.id)).access_level, 0)
        self.assertEqual(await StaffAppointmentArchive.all().count(), 0)

    async def test_staff_with_additional_roles_remains_editable(self):
        await UserServerAccess.filter(user_id=200).update(access_level=2, is_judge=True, is_leader=True)
        self.assertIsNotNone(await staff.get_staff_member(30, 200))
        self.assertIn(200, [r["vk_id"] for r in await staff.list_staff(30)])

    async def test_bot_command_cannot_edit_equal_or_higher_access(self):
        await UserServerAccess.filter(user_id=300).update(access_level=3)
        with self.assertRaises(ValueError):
            await set_nickname(actor=300, vk_id=100, server_id=30, nickname="[LSPD][9] Alex_Novak")
        self.assertEqual((await UserServerAccess.get(user_id=100)).access_level, 11)
        self.assertEqual(await StaffAppointmentArchive.all().count(), 0)

    async def test_invalid_leadership_nickname_keeps_old_assignment(self):
        await staff.assign_staff_member(30, 200, nickname="Ivan_Volkov", access_level=2, spheres=["health"], granted_by=100)
        with self.assertRaises(ValueError):
            await set_nickname(actor=100, vk_id=200, server_id=30, nickname="[LSPD][9] invalid_name")
        self.assertEqual((await UserServerAccess.get(user_id=200)).access_level, 2)
        self.assertEqual(await StaffAppointmentArchive.all().count(), 0)

    async def test_partial_removal_preserves_other_scope_and_full_removal_archives(self):
        await staff.assign_staff_member(30, 200, nickname="Ivan_Volkov", access_level=2,
            spheres=["health", "defense"], is_senior=True, senior_spheres=["health"], granted_by=100)
        result = await staff.remove_staff_sphere_on_poolkick(30, 200, sphere="health", actor_vk_id=100)
        self.assertFalse(result["full_revoke"])
        row = await staff.get_staff_member(30, 200)
        self.assertEqual(row["spheres"], ["defense"])
        self.assertFalse(row["is_senior"])
        self.assertEqual(await StaffAppointmentArchive.all().count(), 0)
        result = await staff.remove_staff_sphere_on_poolkick(30, 200, sphere="defense", actor_vk_id=100)
        self.assertTrue(result["full_revoke"])
        self.assertEqual((await UserServerAccess.get(user_id=200)).nickname, "Ivan_Volkov")
        self.assertEqual(await StaffAppointmentArchive.all().count(), 1)

    async def test_higher_level_extra_duties_do_not_expand_primary_spheres(self):
        await staff.assign_staff_member(30, 200, nickname="Ivan_Volkov", access_level=6,
            spheres=["gov_structures"], is_senior=True, senior_spheres=["health"], granted_by=100)
        row = await staff.get_staff_member(30, 200)
        self.assertEqual(row["spheres"], ["gov_structures"])
        self.assertEqual(row["senior_spheres"], ["health"])
        self.assertNotEqual(row["access_role_title"], "Старший следящий")

    async def test_revoke_staff_does_not_turn_additional_judge_role_into_primary(self):
        await staff.assign_staff_member(30, 200, nickname="Ivan_Volkov", access_level=2, spheres=["health"], granted_by=100)
        await UserServerAccess.filter(user_id=200).update(is_judge=True)
        await staff.revoke_staff_access(30, 200, updated_by=100)
        self.assertEqual(await appointment_snapshot(30, 200), {})
        self.assertTrue((await UserServerAccess.get(user_id=200)).is_judge)

    async def test_confirmed_leave_is_idempotent_and_keeps_additional_role(self):
        from app.services.bot_appointments import revoke_on_leave
        await assign_leadership(30, 200, role_type="deputy", nickname="Ivan_Volkov", org_tag="LSPD", granted_by=100)
        await UserServerAccess.filter(user_id=200).update(is_judge=True)
        await revoke_on_leave(server_id=30, vk_id=200, kind="leader")
        await revoke_on_leave(server_id=30, vk_id=200, kind="leader")
        self.assertEqual(await StaffAppointmentArchive.all().count(), 1)
        self.assertEqual(await PanelAuditLog.all().count(), 1)
        self.assertTrue((await UserServerAccess.get(user_id=200)).is_judge)
        self.assertEqual(await appointment_snapshot(30, 200), {})

    async def test_assignment_api_checks_existing_target_level(self):
        from app.routers.assign import post_assign, AssignBody
        from fastapi import HTTPException
        await UserServerAccess.filter(user_id=200).update(access_level=1)
        actor = {"vk_id": 300, "access_level": 2, "panel_role": "member", "spheres": ["health"]}
        with self.assertRaises(HTTPException) as failure:
            await post_assign(AssignBody(vk_id="200", role_type="deputy", nickname="Ivan_Volkov", org_tag="LSPD"), 30, actor)
        self.assertEqual(failure.exception.status_code, 403)
        self.assertEqual((await UserServerAccess.get(user_id=200)).access_level, 1)
        self.assertEqual(await StaffAppointmentArchive.all().count(), 0)

    async def test_repeating_assignment_and_renaming_do_not_close_same_role(self):
        await assign_leadership(30, 200, role_type="deputy", nickname="Ivan_Volkov", org_tag="LSPD", granted_by=100, granted_at=staff.parse_appointment_date("2026-10-26"))
        await assign_leadership(30, 200, role_type="deputy", nickname="Ivan_Volkov", org_tag="LSPD", granted_by=100, granted_at=staff.parse_appointment_date("2026-10-26"))
        await set_nickname(actor=100, vk_id=200, server_id=30, nickname="[LSPD][9] Ivan_Novikov")
        self.assertEqual(await StaffAppointmentArchive.all().count(), 0)
        self.assertEqual((await appointment_snapshot(30, 200))["position"], "Заместитель")

    async def test_self_preferences_noop_does_not_create_general_activity(self):
        from app.routers.profile import patch_profile, ProfileUpdate
        payload = {"vk_id": 100, "bot_nickname": "Alex_Novak"}
        with patch("app.services.access.get_user_profile", AsyncMock(return_value=payload)):
            await patch_profile(ProfileUpdate(notify_tasks=True), {"vk_id": 100, "server_id": 30})
            self.assertEqual(await PanelAuditLog.all().count(), 0)
            await patch_profile(ProfileUpdate(notify_tasks=False), {"vk_id": 100, "server_id": 30})
            await patch_profile(ProfileUpdate(notify_tasks=False), {"vk_id": 100, "server_id": 30})
            self.assertEqual(await PanelAuditLog.all().count(), 1)
            self.assertEqual((await PanelAuditLog.first()).action, "settings_profile_update")

    async def test_api_noop_and_seniority_have_single_audit_event(self):
        from app.routers.staff import patch_staff_member, StaffMemberUpdate
        await staff.assign_staff_member(30, 200, nickname="Ivan_Volkov", access_level=2,
            spheres=["health", "defense"], is_senior=True, senior_spheres=["health"], granted_by=100)
        actor = {"vk_id": 100, "access_level": 11, "panel_role": "owner", "spheres": ["server"]}
        with patch("app.routers.staff.resolve_vk_photos", AsyncMock(return_value={})):
            await patch_staff_member(200, StaffMemberUpdate(nickname="Ivan_Volkov"), 30, actor)
            self.assertEqual(await PanelAuditLog.all().count(), 0)
            await patch_staff_member(200, StaffMemberUpdate(is_senior=False, senior_spheres=[], reason="Снять старшинство МЗ"), 30, actor)
            self.assertEqual(await PanelAuditLog.all().count(), 1)
            event = await PanelAuditLog.first()
            self.assertEqual(event.detail["senior_spheres"], {"from": ["health"], "to": []})
            self.assertNotIn("access_level", event.detail)

    async def test_search_person_matching_privacy_and_actor_snapshot(self):
        # Return actual dicts from the resolver without any network.
        async def resolve(ids, *args):
            return {i: f"User_{i}" for i in ids}
        with patch("app.services.display_names.resolve_display_names", resolve):
            for i in range(4):
                await log_audit(100, "staff_update", "staff", 200, {"target_vk_id": 200, "reason": "перевод" if i == 0 else "правка", "nickname": {"from": "Old_Name", "to": "New_Name"}})
            await log_audit(100, "qb_item_updated", "question", 200, {"correct_answer": "PRIVATE_ANSWER", "changes": {"correct_answer": "PRIVATE_ANSWER"}})
        with patch("app.services.activity_log.resolve_display_names", resolve):
            result = await list_activity(q="перевод", limit=1)
            self.assertEqual(result["total"], 1)
            self.assertEqual(len(result["items"]), 1)
            result = await list_activity(vk_id=200, about=True)
            self.assertEqual(result["total"], 4)  # question ID 200 is not a person
            result = await list_activity(group="banks")
            self.assertNotIn("PRIVATE_ANSWER", str(result))
            result = await list_activity(vk_id=100, about=False)
            self.assertEqual(result["items"][0]["actor_name"], "User_100")


if __name__ == "__main__":
    unittest.main()
