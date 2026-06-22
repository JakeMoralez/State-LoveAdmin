"""One-off patch: wire sphere through checklist router."""
from __future__ import annotations

from pathlib import Path

path = Path(__file__).resolve().parents[1] / "app" / "routers" / "checklist.py"
text = path.read_text(encoding="utf-8")

replacements = [
    (
        "async def _prune_ineligible_members(server_id: int, staff: list[dict]) -> None:",
        "async def _prune_ineligible_members(server_id: int, staff: list[dict], sphere: str) -> None:",
    ),
    (
        "async def _ensure_week_snapshot(server_id: int, week_start: date, staff: list[dict]) -> None:",
        "async def _ensure_week_snapshot(server_id: int, week_start: date, staff: list[dict], sphere: str) -> None:",
    ),
    (
        "async def _replace_week_tasks_from_template(server_id: int, week_start: date) -> None:",
        "async def _replace_week_tasks_from_template(server_id: int, week_start: date, sphere: str) -> None:",
    ),
    (
        "async def _replace_week_members_from_template(server_id: int, week_start: date) -> None:",
        "async def _replace_week_members_from_template(server_id: int, week_start: date, sphere: str) -> None:",
    ),
    (
        "async def _bootstrap_week_members_if_empty(server_id: int, week_start: date) -> None:",
        "async def _bootstrap_week_members_if_empty(server_id: int, week_start: date, sphere: str) -> None:",
    ),
    (
        "async def _sync_members_to_current_and_future_weeks(server_id: int, staff: list[dict]) -> None:",
        "async def _sync_members_to_current_and_future_weeks(server_id: int, staff: list[dict], sphere: str) -> None:",
    ),
    (
        "async def _week_task_defs(server_id: int, week_start: date, staff: list[dict]) -> list[ChecklistWeekTask]:",
        "async def _week_task_defs(server_id: int, week_start: date, staff: list[dict], sphere: str) -> list[ChecklistWeekTask]:",
    ),
    (
        "async def _checklist_members(server_id: int, staff: list[dict]) -> list[dict]:",
        "async def _checklist_members(server_id: int, staff: list[dict], sphere: str) -> list[dict]:",
    ),
    ("rows = await _template_member_rows(server_id)", "rows = await _template_member_rows(server_id, sphere)"),
    ("await _prune_ineligible_members(server_id, staff)", "await _prune_ineligible_members(server_id, staff, sphere)"),
    ("await _ensure_task_defs(server_id)", "await _ensure_task_defs(server_id, sphere)"),
    ("await _checklist_members(server_id, staff)", "await _checklist_members(server_id, staff, sphere)"),
    (
        "await _week_task_defs(server_id, week_start, staff)",
        "await _week_task_defs(server_id, week_start, staff, sphere)",
    ),
    (
        "await _week_checklist_members(server_id, week_start, staff)",
        "await _week_checklist_members(server_id, week_start, staff, sphere)",
    ),
    ("await _sync_tasks_to_current_and_future_weeks(server_id)", "await _sync_tasks_to_current_and_future_weeks(server_id, sphere)"),
    (
        "await _sync_members_to_current_and_future_weeks(server_id, staff)",
        "await _sync_members_to_current_and_future_weeks(server_id, staff, sphere)",
    ),
    ("for week_start in await _mutable_week_starts(server_id):", "for week_start in await _mutable_week_starts(server_id, sphere):"),
    ("await _ensure_week_snapshot(server_id, week_start, staff)", "await _ensure_week_snapshot(server_id, week_start, staff, sphere)"),
    (
        "await _replace_week_members_from_template(server_id, week_start)",
        "await _replace_week_members_from_template(server_id, week_start, sphere)",
    ),
    ("if not await _template_member_rows(server_id):", "if not await _template_member_rows(server_id, sphere):"),
    (
        "async def get_checklist_settings(\n    server_id: int = DEFAULT_SERVER_ID,\n    user: dict = Depends(require_ca_user),\n):",
        "async def get_checklist_settings(\n    server_id: int = DEFAULT_SERVER_ID,\n    sphere: str = Query(DEFAULT_WORK_SPHERE),\n    user: dict = Depends(require_ca_user),\n):",
    ),
    (
        "async def update_checklist_tasks(\n    body: TasksUpdate,\n    server_id: int = DEFAULT_SERVER_ID,\n    user: dict = Depends(require_ca_user),\n):",
        "async def update_checklist_tasks(\n    body: TasksUpdate,\n    server_id: int = DEFAULT_SERVER_ID,\n    sphere: str = Query(DEFAULT_WORK_SPHERE),\n    user: dict = Depends(require_ca_user),\n):",
    ),
    (
        "async def checklist_members_only_me(\n    server_id: int = DEFAULT_SERVER_ID,\n    user: dict = Depends(require_ca_user),\n):",
        "async def checklist_members_only_me(\n    server_id: int = DEFAULT_SERVER_ID,\n    sphere: str = Query(DEFAULT_WORK_SPHERE),\n    user: dict = Depends(require_ca_user),\n):",
    ),
    (
        "async def update_checklist_members(\n    body: MembersUpdate,\n    server_id: int = DEFAULT_SERVER_ID,\n    user: dict = Depends(require_ca_user),\n):",
        "async def update_checklist_members(\n    body: MembersUpdate,\n    server_id: int = DEFAULT_SERVER_ID,\n    sphere: str = Query(DEFAULT_WORK_SPHERE),\n    user: dict = Depends(require_ca_user),\n):",
    ),
    (
        "async def get_checklist(\n    week: str = Query(..., description=\"YYYY-MM-DD любой день недели\"),\n    server_id: int = DEFAULT_SERVER_ID,\n    user: dict = Depends(require_ca_user),\n):",
        "async def get_checklist(\n    week: str = Query(..., description=\"YYYY-MM-DD любой день недели\"),\n    server_id: int = DEFAULT_SERVER_ID,\n    sphere: str = Query(DEFAULT_WORK_SPHERE),\n    user: dict = Depends(require_ca_user),\n):",
    ),
]

for old, new in replacements:
    if old not in text:
        print("MISSING:", old[:60])
    text = text.replace(old, new)

# assert sphere after each endpoint's opening
endpoints = [
    "async def get_checklist_settings",
    "async def update_checklist_tasks",
    "async def checklist_members_only_me",
    "async def update_checklist_members",
    "async def get_checklist",
]
for fn in endpoints:
    needle = f"{fn}("
    idx = text.find(needle)
    if idx == -1:
        continue
    # find first line after def block that is `    staff =` or `    if not` or `    week_start`
    insert_after = None
    for line in [
        "    staff = await list_staff(server_id)\n",
        "    if not _can_manage_checklist(user):\n",
        '    """Личная колонка',
        "    week_start = _monday(date.fromisoformat(week))\n",
    ]:
        pos = text.find(line, idx)
        if pos != -1 and (insert_after is None or pos < insert_after):
            insert_after = pos
    if insert_after is not None and "assert_sphere_access(user, sphere)" not in text[idx : idx + 400]:
        text = (
            text[:insert_after]
            + "    sphere = assert_sphere_access(user, sphere)\n"
            + text[insert_after:]
        )

# patch/create missing sphere on ChecklistMember.create
text = text.replace(
    "await ChecklistMember.create(\n        server_id=server_id,\n        vk_id=user[\"vk_id\"],",
    "await ChecklistMember.create(\n        server_id=server_id,\n        sphere=sphere,\n        vk_id=user[\"vk_id\"],",
)
text = text.replace(
    "await ChecklistMember.create(server_id=server_id, vk_id=vk_id, sort_order=i)",
    "await ChecklistMember.create(server_id=server_id, sphere=sphere, vk_id=vk_id, sort_order=i)",
)

path.write_text(text, encoding="utf-8")
print("fixed", path)
