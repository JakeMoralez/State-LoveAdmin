"""Panel-owned tables (tasks and archived checklist)."""

from __future__ import annotations

from tortoise import fields
from tortoise.models import Model


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


class PanelProfileId(Model):
    """Публичный ID профиля портала (в URL вместо vk_id): 1, 2, 3…"""

    vk_id = fields.BigIntField(pk=True)
    public_id = fields.IntField(unique=True, index=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "panel_profile_ids"


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


class StaffAppointmentArchive(Model):
    """Closed appointments; current access remains owned by the bot database."""

    id = fields.IntField(pk=True)
    vk_id = fields.BigIntField(index=True)
    server_id = fields.IntField(index=True)
    kind = fields.CharField(max_length=16)
    snapshot = fields.JSONField()
    closed_by = fields.BigIntField(null=True)
    closed_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "staff_appointment_archive"


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


class TaskRecurrence(Model):
    """Шаблон повторяющейся задачи (инстансы — обычные Task)."""

    id = fields.IntField(pk=True)
    title = fields.CharField(max_length=512)
    description = fields.TextField(default="")
    priority = fields.CharField(max_length=16, default="medium")
    task_type = fields.CharField(max_length=32, default="assignment")
    labels = fields.JSONField(default=list)
    server_id = fields.IntField(index=True)
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    audience = fields.CharField(max_length=32, null=True, index=True)
    assignee_mode = fields.CharField(max_length=16, default="explicit")  # explicit | cohort
    assignee_vk_ids = fields.JSONField(default=list)
    freq = fields.CharField(max_length=16, default="weekly")  # daily|weekly|monthly|dates
    interval = fields.IntField(default=1)
    by_weekday = fields.JSONField(default=list)  # 0=Mon .. 6=Sun
    by_monthday = fields.JSONField(default=list)  # 1..31
    specific_dates = fields.JSONField(default=list)  # ["YYYY-MM-DD", ...]
    due_time = fields.CharField(max_length=5, null=True)
    due_offset_days = fields.IntField(default=0)
    active = fields.BooleanField(default=True, index=True)
    created_by_vk_id = fields.BigIntField()
    next_run_at = fields.DatetimeField(null=True, index=True)
    last_spawned_at = fields.DatetimeField(null=True)
    ends_on = fields.DateField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "task_recurrences"


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
    server_id = fields.IntField()
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    audience = fields.CharField(max_length=32, null=True, index=True)
    recurrence_id = fields.IntField(null=True, index=True)
    occurrence_date = fields.DateField(null=True)
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
    min_view_level = fields.IntField(default=1)
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
    spin_duration_ms = fields.IntField(default=14000)
    created_by_vk_id = fields.BigIntField(index=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "loot_cases"


class LootCaseGrant(Model):
    """One independently openable copy; no FK to an editable/deletable template."""
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    case_id = fields.IntField(index=True)
    recipient_vk_id = fields.BigIntField(index=True)
    recipient_name = fields.CharField(max_length=128)
    granted_by_vk_id = fields.BigIntField(index=True)
    request_key = fields.CharField(max_length=36, unique=True)
    snapshot = fields.JSONField()
    status = fields.CharField(max_length=16, default="available", index=True)
    revoked_by_vk_id = fields.BigIntField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    opened_at = fields.DatetimeField(null=True)
    revoked_at = fields.DatetimeField(null=True)

    class Meta:
        table = "loot_case_grants"


class LootCaseReward(Model):
    """The unique persisted result and manual fulfillment of a granted copy."""
    id = fields.IntField(pk=True)
    grant = fields.OneToOneField("models.LootCaseGrant", related_name="reward")
    spin_token = fields.CharField(max_length=36, unique=True)
    prize = fields.JSONField()
    status = fields.CharField(max_length=16, default="pending", index=True)
    reviewed_by_vk_id = fields.BigIntField(null=True)
    reviewed_at = fields.DatetimeField(null=True)
    history = fields.JSONField(default=list)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "loot_case_rewards"


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


class PanelSettings(Model):
    """Key-value runtime settings for the panel (reminders, retention, …)."""

    key = fields.CharField(max_length=64, pk=True)
    value = fields.JSONField()
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "panel_settings"


class IssuanceRequest(Model):
    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    kind = fields.CharField(max_length=16, index=True)
    role_title = fields.CharField(max_length=128, default="")
    nickname = fields.CharField(max_length=128)
    nickname_norm = fields.CharField(max_length=128, default="", index=True)
    amount = fields.BigIntField(default=0)
    reason = fields.TextField(default="")
    proof_url = fields.CharField(max_length=1024, default="")
    status = fields.CharField(max_length=16, default="pending", index=True)
    created_by_vk_id = fields.BigIntField(index=True)
    reviewed_by_vk_id = fields.BigIntField(null=True)
    reviewed_at = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "issuance_requests"


class IssuanceLine(Model):
    """Отдельная позиция внутри пакета выдачи (кто/куда/что)."""

    id = fields.IntField(pk=True)
    request = fields.ForeignKeyField("models.IssuanceRequest", related_name="lines")
    role_title = fields.CharField(max_length=128)
    amount = fields.BigIntField()
    reason = fields.TextField(default="")
    proof_url = fields.CharField(max_length=1024, default="")
    created_by_vk_id = fields.BigIntField(index=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "issuance_lines"


class KnowledgeArticle(Model):
    """База знаний: регламенты, правила, инструкции (Markdown)."""

    id = fields.IntField(pk=True)
    server_id = fields.IntField(index=True)
    sphere = fields.CharField(max_length=64, default="central_apparatus", index=True)
    title = fields.CharField(max_length=256)
    category = fields.CharField(max_length=64, default="other", index=True)
    body_md = fields.TextField(default="")
    sort_order = fields.IntField(default=0)
    published = fields.BooleanField(default=True)
    min_view_level = fields.IntField(default=1)
    created_by_vk_id = fields.BigIntField(index=True)
    updated_by_vk_id = fields.BigIntField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "knowledge_articles"

