Quick manual migration instructions for adding senior fields to bot.user_server_access

Files:
- backend/0002_add_senior_fields_user_server_access.sql  -- SQL to apply to Postgres

Recommended steps:
1) Make a DB backup of your production/staging DB.
2) Run the SQL on the target DB (Postgres). Example:
   PGPASSWORD=<DB_PASSWORD> psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -f backend/0002_add_senior_fields_user_server_access.sql
3) Restart backend services and workers.
4) Verify by querying the table:
   SELECT is_senior, senior_spheres FROM bot_user_server_access LIMIT 5;

If you use aerich/alembic/other migration tooling:
- Prefer generating an automated migration via that tool and include the commands above as reference.

If something goes wrong:
- Rollback using the SQL in the SQL file comment (or restore from backup).


## Case duration: 14 seconds (2026-10-26)

On startup, `services/case_duration_migration.py` records `case_duration_14_seconds_v1`
in the existing `panel_migrations` ledger. It first creates a complete panel backup
in `data/backups/before-case-duration-*` (SQLite online backup or PostgreSQL custom
`pg_dump`). If backup fails, no durations change and the migration is not marked.
Only saved `28000` values become `14000`; custom values, including `12000` and
`20000`, remain unchanged. The bot database is never migrated here.
PostgreSQL deployments must have `pg_dump` available to the backend process.
Subsequent starts do not repeat the update. Regression checks:
`backend/venv/Scripts/python.exe backend/scripts/test_interface_updates.py`.


## Granted cases (2026-10-26)

`case_inventory_v1` backs up the complete panel database in
`data/backups/case-inventory/` before creating `loot_case_grants` and
`loot_case_rewards`. ORM generation remains restricted to the panel connection.
The ledger is marked only after successful schema creation. Restarting does not
repeat the backup. Existing templates/prizes and AZ/virts requests are unchanged.
See `docs/case-inventory.md` for access rules and regression checks.
