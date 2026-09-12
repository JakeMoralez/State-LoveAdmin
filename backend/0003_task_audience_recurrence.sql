-- Tasks: audience + recurrence columns / table (Postgres)
-- Apply to PANEL database only.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS audience VARCHAR(32) NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_id INTEGER NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS occurrence_date DATE NULL;

CREATE TABLE IF NOT EXISTS task_recurrences (
    id SERIAL PRIMARY KEY,
    title VARCHAR(512) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority VARCHAR(16) NOT NULL DEFAULT 'medium',
    task_type VARCHAR(32) NOT NULL DEFAULT 'assignment',
    labels JSONB NOT NULL DEFAULT '[]',
    project_id INTEGER NULL,
    server_id INTEGER NOT NULL,
    sphere VARCHAR(64) NOT NULL DEFAULT 'central_apparatus',
    audience VARCHAR(32) NULL,
    assignee_mode VARCHAR(16) NOT NULL DEFAULT 'explicit',
    assignee_vk_ids JSONB NOT NULL DEFAULT '[]',
    freq VARCHAR(16) NOT NULL DEFAULT 'weekly',
    interval INTEGER NOT NULL DEFAULT 1,
    by_weekday JSONB NOT NULL DEFAULT '[]',
    by_monthday JSONB NOT NULL DEFAULT '[]',
    specific_dates JSONB NOT NULL DEFAULT '[]',
    due_time VARCHAR(5) NULL,
    due_offset_days INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_vk_id BIGINT NOT NULL,
    next_run_at TIMESTAMP NULL,
    last_spawned_at TIMESTAMP NULL,
    ends_on DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_audience ON tasks (audience);
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_id ON tasks (recurrence_id);
CREATE INDEX IF NOT EXISTS idx_task_recurrences_active ON task_recurrences (active);
CREATE INDEX IF NOT EXISTS idx_task_recurrences_next_run ON task_recurrences (next_run_at);
