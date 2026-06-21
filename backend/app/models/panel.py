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


class ChecklistCell(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
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
        unique_together = (("server_id", "week_start", "day_offset", "task_slug", "member_vk_id"),)


class ChecklistTaskDef(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    slug = fields.CharField(max_length=64)
    title = fields.CharField(max_length=256)
    is_header = fields.BooleanField(default=False)
    sort_order = fields.IntField(default=0)
    days_of_week = fields.CharField(max_length=32, default="0,1,2,3,4,5,6")

    class Meta:
        table = "checklist_tasks"
        unique_together = (("server_id", "slug"),)


class ChecklistWeekTask(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    week_start = fields.DateField(index=True)
    slug = fields.CharField(max_length=64)
    title = fields.CharField(max_length=256)
    is_header = fields.BooleanField(default=False)
    sort_order = fields.IntField(default=0)
    days_of_week = fields.CharField(max_length=32, default="0,1,2,3,4,5,6")

    class Meta:
        table = "checklist_week_tasks"
        unique_together = (("server_id", "week_start", "slug"),)


class ChecklistWeekMember(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    week_start = fields.DateField(index=True)
    vk_id = fields.BigIntField(index=True)
    sort_order = fields.IntField(default=0)

    class Meta:
        table = "checklist_week_members"
        unique_together = (("server_id", "week_start", "vk_id"),)


class ChecklistMember(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    vk_id = fields.BigIntField(index=True)
    sort_order = fields.IntField(default=0)

    class Meta:
        table = "checklist_members"
        unique_together = (("server_id", "vk_id"),)


class QuestionBank(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    title = fields.CharField(max_length=256)
    description = fields.TextField(default="")
    emoji = fields.CharField(max_length=16, default="")
    min_submit_level = fields.IntField(default=1)
    min_approve_level = fields.IntField(default=3)
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

