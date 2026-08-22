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
