"""Panel-owned tables (tasks, projects, checklist)."""

from __future__ import annotations

from tortoise import fields
from tortoise.models import Model


class PanelSession(Model):
    id = fields.UUIDField(pk=True)
    vk_id = fields.BigIntField(index=True)
    expires_at = fields.DatetimeField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "panel_sessions"


class PanelLoginToken(Model):
    jti = fields.CharField(max_length=64, pk=True)
    vk_id = fields.BigIntField()
    used_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "panel_login_tokens"


class PanelAuditLog(Model):
    id = fields.IntField(pk=True)
    actor_vk_id = fields.BigIntField()
    action = fields.CharField(max_length=64)
    entity_type = fields.CharField(max_length=32)
    entity_id = fields.CharField(max_length=64)
    detail = fields.JSONField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "panel_audit_log"


class DiscordLink(Model):
    vk_id = fields.BigIntField(pk=True)
    discord_id = fields.CharField(max_length=32, unique=True)
    discord_username = fields.CharField(max_length=128, null=True)
    discord_display_name = fields.CharField(max_length=128, null=True)
    linked_by = fields.BigIntField(null=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "discord_links"


class StaffNote(Model):
    id = fields.IntField(pk=True)
    vk_id = fields.BigIntField(index=True)
    server_id = fields.IntField(index=True)
    note = fields.TextField(default="")
    spheres = fields.JSONField(default=list)
    leader_position = fields.TextField(default="")
    leader_note = fields.TextField(default="")
    updated_by = fields.BigIntField(null=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "staff_notes"
        unique_together = (("vk_id", "server_id"),)


class DevErrorLog(Model):
    id = fields.IntField(pk=True)
    level = fields.CharField(max_length=16, default="error", index=True)
    source = fields.CharField(max_length=32, default="client", index=True)
    message = fields.TextField()
    stack = fields.TextField(default="")
    url = fields.CharField(max_length=2048, default="")
    method = fields.CharField(max_length=16, default="")
    user_agent = fields.CharField(max_length=512, default="")
    user_vk_id = fields.BigIntField(null=True, index=True)
    context = fields.JSONField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True, index=True)

    class Meta:
        table = "dev_error_logs"


class Project(Model):
    id = fields.IntField(pk=True)
    title = fields.CharField(max_length=256)
    description = fields.TextField(default="")
    status = fields.CharField(max_length=32, default="active")
    owner_vk_id = fields.BigIntField()
    server_id = fields.IntField()
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "projects"


class ProjectMember(Model):
    id = fields.IntField(pk=True)
    project = fields.ForeignKeyField("models.Project", related_name="members")
    vk_id = fields.BigIntField()
    role = fields.CharField(max_length=32, default="member")

    class Meta:
        table = "project_members"
        unique_together = (("project_id", "vk_id"),)


class Task(Model):
    id = fields.IntField(pk=True)
    title = fields.CharField(max_length=512)
    description = fields.TextField(default="")
    status = fields.CharField(max_length=32, default="todo", index=True)
    priority = fields.CharField(max_length=16, default="medium")
    task_type = fields.CharField(max_length=32, default="assignment")
    assignee_vk_id = fields.BigIntField(null=True, index=True)
    assignee_vk_ids = fields.JSONField(default=list)
    reporter_vk_id = fields.BigIntField()
    project_id = fields.IntField(null=True, index=True)
    server_id = fields.IntField()
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    due_date = fields.DateField(null=True)
    due_time = fields.CharField(max_length=5, null=True)
    labels = fields.JSONField(default=list)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "tasks"


class TaskComment(Model):
    id = fields.IntField(pk=True)
    task = fields.ForeignKeyField("models.Task", related_name="comments")
    author_vk_id = fields.BigIntField()
    body = fields.TextField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "task_comments"


class TaskAttachment(Model):
    id = fields.IntField(pk=True)
    task = fields.ForeignKeyField("models.Task", related_name="attachments")
    url = fields.CharField(max_length=1024)
    title = fields.CharField(max_length=256, default="")
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "task_attachments"


class TaskNotificationLog(Model):
    """Дедупликация VK-уведомлений по задачам."""

    id = fields.IntField(pk=True)
    task_id = fields.IntField(index=True)
    vk_id = fields.BigIntField(index=True)
    kind = fields.CharField(max_length=32, index=True)
    sent_on = fields.DateField(index=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "task_notification_log"
        unique_together = (("task_id", "vk_id", "kind", "sent_on"),)


class ChecklistCell(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    week_start = fields.DateField(index=True)
    day_offset = fields.IntField()
    task_slug = fields.CharField(max_length=64)
    member_vk_id = fields.BigIntField(index=True)
    proof_url = fields.CharField(max_length=1024, null=True)
    proof_urls = fields.JSONField(default=list)
    proof_note = fields.TextField(default="")
    proof_video_url = fields.CharField(max_length=1024, null=True)
    updated_by = fields.BigIntField(null=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "checklist_cells"
        unique_together = (("server_id", "sphere", "week_start", "day_offset", "task_slug", "member_vk_id"),)


class ChecklistTaskDef(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    slug = fields.CharField(max_length=64)
    title = fields.CharField(max_length=256)
    is_header = fields.BooleanField(default=False)
    sort_order = fields.IntField(default=0)
    days_of_week = fields.CharField(max_length=32, default="0,1,2,3,4,5,6")

    class Meta:
        table = "checklist_tasks"
        unique_together = (("server_id", "sphere", "slug"),)


class ChecklistWeekTask(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    week_start = fields.DateField(index=True)
    slug = fields.CharField(max_length=64)
    title = fields.CharField(max_length=256)
    is_header = fields.BooleanField(default=False)
    sort_order = fields.IntField(default=0)
    days_of_week = fields.CharField(max_length=32, default="0,1,2,3,4,5,6")

    class Meta:
        table = "checklist_week_tasks"
        unique_together = (("server_id", "sphere", "week_start", "slug"),)


class ChecklistWeekMember(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    week_start = fields.DateField(index=True)
    vk_id = fields.BigIntField(index=True)
    sort_order = fields.IntField(default=0)

    class Meta:
        table = "checklist_week_members"
        unique_together = (("server_id", "sphere", "week_start", "vk_id"),)


class ChecklistMember(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    vk_id = fields.BigIntField(index=True)
    sort_order = fields.IntField(default=0)

    class Meta:
        table = "checklist_members"
        unique_together = (("server_id", "sphere", "vk_id"),)


class QuestionBank(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    title = fields.CharField(max_length=256)
    description = fields.TextField(default="")
    emoji = fields.CharField(max_length=16, default="")
    min_submit_level = fields.IntField(default=1)
    min_approve_level = fields.IntField(default=3)
    contributor_visibility = fields.CharField(max_length=32, default="own_workflow")
    created_by_vk_id = fields.BigIntField(index=True)
    sort_order = fields.IntField(default=0)
    is_active = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "question_banks"


class QuestionBankItem(Model):
    id = fields.IntField(pk=True)
    bank = fields.ForeignKeyField("models.QuestionBank", related_name="items")
    server_id = fields.IntField(index=True)
    question_type = fields.CharField(max_length=64, default="")
    text = fields.TextField()
    correct_answer = fields.TextField(default="")
    source = fields.TextField(default="")
    answer_comment = fields.TextField(default="")
    tags = fields.JSONField(default=list)
    sort_order = fields.IntField(default=0)
    difficulty = fields.IntField(default=3)
    status = fields.CharField(max_length=32, default="draft", index=True)
    verification_status = fields.CharField(max_length=16, default="pending")
    is_active = fields.BooleanField(default=True)
    created_by_vk_id = fields.BigIntField(index=True)
    verified_by_vk_id = fields.BigIntField(null=True)
    verified_at = fields.DatetimeField(null=True)
    reviewed_by_vk_id = fields.BigIntField(null=True)
    reviewed_at = fields.DatetimeField(null=True)
    review_note = fields.TextField(default="")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "question_bank_items"


class QuestionBankItemEvent(Model):
    id = fields.IntField(pk=True)
    item = fields.ForeignKeyField("models.QuestionBankItem", related_name="events")
    actor_vk_id = fields.BigIntField(index=True)
    action = fields.CharField(max_length=32)
    comment = fields.TextField(default="")
    changes = fields.JSONField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "question_bank_item_events"


class LootCase(Model):
    id = fields.IntField(pk=True)
    title = fields.CharField(max_length=256)
    description = fields.TextField(default="")
    cover_image_url = fields.CharField(max_length=1024, default="")
    is_active = fields.BooleanField(default=True)
    spin_duration_ms = fields.IntField(default=12000)
    created_by_vk_id = fields.BigIntField(index=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "loot_cases"


class UserNotifyPrefs(Model):
    vk_id = fields.BigIntField(pk=True)
    notify_tasks = fields.BooleanField(default=True)
    notify_assign = fields.BooleanField(default=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "user_notify_prefs"


class LootCasePrize(Model):
    id = fields.IntField(pk=True)
    case = fields.ForeignKeyField("models.LootCase", related_name="prizes")
    title = fields.CharField(max_length=256)
    image_url = fields.CharField(max_length=1024, default="")
    weight = fields.IntField(default=1)
    sort_order = fields.IntField(default=0)
    rarity_label = fields.CharField(max_length=64, default="")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "loot_case_prizes"


class PanelCatalog(Model):
    id = fields.IntField(pk=True)
    data = fields.JSONField(default=dict)
    updated_by = fields.BigIntField(null=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "panel_catalog"


class AcademyCadet(Model):
    id = fields.IntField(pk=True)
    vk_id = fields.BigIntField(index=True)
    server_id = fields.IntField(index=True)
    direction = fields.CharField(max_length=64, default="general")
    stage = fields.CharField(max_length=32, default="theory")
    status = fields.CharField(max_length=32, default="active", index=True)
    mentor_vk_id = fields.BigIntField(null=True, index=True)
    enrolled_at = fields.DatetimeField(auto_now_add=True)
    enrolled_by = fields.BigIntField(null=True)
    expected_end_at = fields.DateField(null=True)
    left_at = fields.DatetimeField(null=True)
    attestation_theory = fields.IntField(null=True)
    attestation_practice = fields.IntField(null=True)
    attestation_period = fields.IntField(null=True)
    attestation_mentor = fields.IntField(null=True)
    attestation_total = fields.IntField(null=True)
    recommendation = fields.CharField(max_length=16, default="none")
    points_adjust = fields.IntField(default=0)
    note = fields.TextField(default="")
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "academy_cadets"
        unique_together = (("vk_id", "server_id"),)


class AcademyEvent(Model):
    id = fields.IntField(pk=True)
    cadet = fields.ForeignKeyField("models.AcademyCadet", related_name="events")
    action = fields.CharField(max_length=64, index=True)
    actor_vk_id = fields.BigIntField()
    detail = fields.JSONField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True, index=True)

    class Meta:
        table = "academy_events"


class AcademyWarning(Model):
    id = fields.IntField(pk=True)
    cadet = fields.ForeignKeyField("models.AcademyCadet", related_name="warnings")
    author_vk_id = fields.BigIntField()
    body = fields.TextField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "academy_warnings"


class AcademyAssignmentTemplate(Model):
    id = fields.IntField(pk=True)
    title = fields.CharField(max_length=256)
    category = fields.CharField(max_length=32, default="theory")
    stage = fields.CharField(max_length=32, default="theory")
    max_points = fields.IntField(default=10)
    due_days = fields.IntField(default=3)
    required = fields.BooleanField(default=True)
    description = fields.TextField(default="")
    proof_kinds = fields.JSONField(default=list)
    reviewer_kind = fields.CharField(max_length=32, default="mentor")
    is_active = fields.BooleanField(default=True)
    sort_order = fields.IntField(default=0)
    created_by = fields.BigIntField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "academy_assignment_templates"


class AcademyAssignment(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    template_id = fields.IntField(null=True, index=True)
    title = fields.CharField(max_length=256)
    category = fields.CharField(max_length=32, default="theory")
    stage = fields.CharField(max_length=32, default="theory")
    max_points = fields.IntField(default=10)
    required = fields.BooleanField(default=True)
    description = fields.TextField(default="")
    proof_kinds = fields.JSONField(default=list)
    reviewer_kind = fields.CharField(max_length=32, default="mentor")
    assignee_vk_ids = fields.JSONField(default=list)
    due_at = fields.DatetimeField(null=True)
    created_by = fields.BigIntField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "academy_assignments"


class AcademyReport(Model):
    id = fields.IntField(pk=True)
    assignment = fields.ForeignKeyField("models.AcademyAssignment", related_name="reports")
    vk_id = fields.BigIntField(index=True)
    body = fields.TextField(default="")
    proof_urls = fields.JSONField(default=list)
    status = fields.CharField(max_length=32, default="pending", index=True)
    score = fields.IntField(null=True)
    reviewer_vk_id = fields.BigIntField(null=True)
    review_comment = fields.TextField(default="")
    submitted_at = fields.DatetimeField(auto_now_add=True)
    reviewed_at = fields.DatetimeField(null=True)

    class Meta:
        table = "academy_reports"
        unique_together = (("assignment_id", "vk_id"),)


class AcademySession(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    title = fields.CharField(max_length=256)
    notes = fields.TextField(default="")
    held_at = fields.DatetimeField()
    status = fields.CharField(max_length=32, default="held")
    created_by = fields.BigIntField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "academy_sessions"


class AcademyAttendance(Model):
    id = fields.IntField(pk=True)
    session = fields.ForeignKeyField("models.AcademySession", related_name="attendance")
    vk_id = fields.BigIntField(index=True)
    status = fields.CharField(max_length=16, default="absent")

    class Meta:
        table = "academy_attendance"
        unique_together = (("session_id", "vk_id"),)

