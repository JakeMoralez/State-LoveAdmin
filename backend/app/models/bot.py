"""Read-only mirror of State-LoveBot user models."""

from __future__ import annotations

from tortoise import fields
from tortoise.models import Model


class AccessLevel:
    PGS = 1
    SUPERVISOR = 2
    ZGS = 3
    GS = 4
    STRUCTURE_SUPERVISOR = 5  # Следящий структуры (между ГС сферы и ЗГС структуры)
    ZGS_GOS = 6
    GS_GOS = 7
    CURATOR = 8
    ZGA = 9
    GA = 10
    DEVELOPER = 11

    NAMES: dict[int, str] = {
        1: "ПГС",
        2: "Следящий",
        3: "ЗГС",
        4: "ГС",
        5: "Следящий структуры",
        6: "ЗГС ГОС",
        7: "ГС ГОС",
        8: "Куратор",
        9: "ЗГА",
        10: "ГА",
        11: "Разработчик",
    }

    @classmethod
    def title(cls, level: int) -> str:
        return cls.NAMES.get(level, f"Уровень {level}")


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
