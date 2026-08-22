-- Migration: Add is_senior and senior_spheres to bot.user_server_access
-- Target DB: PostgreSQL

BEGIN;

-- Add boolean flag is_senior (default FALSE)
ALTER TABLE bot_user_server_access
  ADD COLUMN IF NOT EXISTS is_senior boolean NOT NULL DEFAULT FALSE;

-- Add JSONB column senior_spheres (default empty array)
ALTER TABLE bot_user_server_access
  ADD COLUMN IF NOT EXISTS senior_spheres jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;

-- Rollback (if needed):
-- ALTER TABLE bot_user_server_access DROP COLUMN IF EXISTS senior_spheres;
-- ALTER TABLE bot_user_server_access DROP COLUMN IF EXISTS is_senior;
