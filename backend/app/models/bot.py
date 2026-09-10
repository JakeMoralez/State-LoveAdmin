"""Mirror of State-LoveBot user models (connection \"bot\").

Схему bot.db не генерируем из панели (см. main.py). Запись в bot-таблицы —
осознанно: staff assign / level / roles (см. AGENTS.md §4 матрица владения).
AccessLevel — из app.domain.access_levels.
"""

from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from app.domain import access_levels as _al


class AccessLevel:
    PGS = _al.PGS
    SUPERVISOR = _al.SUPERVISOR
    ZGS = _al.ZGS
    GS = _al.GS
    STRUCTURE_SUPERVISOR = _al.STRUCTURE_SUPERVISOR
    ZGS_GOS = _al.ZGS_GOS
    GS_GOS = _al.GS_GOS
    CURATOR = _al.CURATOR
    ZGA = _al.ZGA
    GA = _al.GA
    DEVELOPER = _al.DEVELOPER

    NAMES: dict[int, str] = dict(_al.SHORT_NAMES)

    @classmethod
    def title(cls, level: int) -> str:
        return _al.short_name(level)


class User(Model):
    vk_id = fields.BigIntField(pk=True)
    username = fields.CharField(max_length=128, null=True)
    note = fields.TextField(null=True)
    added_at = fields.DatetimeField()  # NOT NULL в bot.db
    last_used = fields.DatetimeField(null=True)
    is_admin = fields.BooleanField(default=False)

    server_accesses: fields.ReverseRelation["UserServerAccess"]

    class Meta:
        table = "users"
        app = "bot"


class Server(Model):
    id = fields.IntField(pk=True)
    slug = fields.CharField(max_length=64)
    name = fields.CharField(max_length=128)
    tag = fields.CharField(max_length=64, null=True)
    judge_forum_id = fields.IntField(null=True)
    is_active = fields.BooleanField(default=True)

    class Meta:
        table = "servers"
        app = "bot"


class JudgeForumListSettings(Model):
    server_id = fields.IntField(pk=True)
    thread_id = fields.IntField(null=True)
    enabled = fields.BooleanField(default=True)
    body_template = fields.TextField(default="")
    line_template = fields.TextField(default="")
    empty_text = fields.TextField(default="")
    updated_by_vk_id = fields.BigIntField(null=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "judge_forum_list_settings"
        app = "bot"


class UserServerAccess(Model):
    id = fields.IntField(pk=True)
    user = fields.ForeignKeyField("bot.User", related_name="server_accesses")
    server_id = fields.IntField()
    access_level = fields.IntField(default=1)
    nickname = fields.CharField(max_length=64, null=True)
    is_judge = fields.BooleanField(default=False)
    is_attorney = fields.BooleanField(default=False)
    is_leader = fields.BooleanField(default=False)
    is_congress_speaker = fields.BooleanField(default=False)
    is_congress_vice = fields.BooleanField(default=False)
    granted_by = fields.BigIntField(null=True)
    granted_at = fields.DatetimeField()  # NOT NULL в bot.db
    has_ca_access = fields.BooleanField(default=False)
    ca_auto_peer_id = fields.BigIntField(null=True)
    # Старший следящий: флаг и выбранные сферы (JSON list of sphere keys)
    is_senior = fields.BooleanField(default=False)
    senior_spheres = fields.JSONField(default=list)
    promoted_at = fields.DatetimeField(null=True)

    class Meta:
        table = "user_server_access"
        app = "bot"


class RoleChat(Model):
    id = fields.IntField(pk=True)
    role = fields.CharField(max_length=32)
    server_id = fields.IntField()
    peer_id = fields.BigIntField()
    registered_by = fields.BigIntField(null=True)

    class Meta:
        table = "role_chats"
        app = "bot"


class ChatPeerSettings(Model):
    peer_id = fields.BigIntField(pk=True)
    chat_kind = fields.CharField(max_length=32, default="general")
    sphere = fields.CharField(max_length=64, null=True)
    server_id = fields.IntField(null=True)

    class Meta:
        table = "chat_peer_settings"
        app = "bot"
