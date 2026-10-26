"""Exercise the destructive migration against an isolated SQLite fixture."""
import json
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("retire_projects.py")


class ProjectRetirementTests(unittest.TestCase):
    def test_backup_preservation_scope_and_idempotence(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            database = root / "panel.sqlite3"
            with closing(sqlite3.connect(database)) as conn:
                conn.executescript("""
                    CREATE TABLE projects(id INTEGER PRIMARY KEY, title TEXT, sphere TEXT);
                    CREATE TABLE project_members(id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects(id), vk_id INTEGER);
                    CREATE TABLE tasks(id INTEGER PRIMARY KEY, project_id INTEGER, sphere TEXT, server_id INTEGER, audience TEXT, title TEXT);
                    CREATE INDEX tasks_project ON tasks(project_id);
                    CREATE TABLE task_recurrences(id INTEGER PRIMARY KEY, project_id INTEGER, sphere TEXT, server_id INTEGER, audience TEXT);
                    CREATE INDEX rec_project ON task_recurrences(project_id);
                    CREATE TABLE task_comments(id INTEGER PRIMARY KEY, task_id INTEGER, body TEXT);
                    CREATE TABLE task_attachments(id INTEGER PRIMARY KEY, task_id INTEGER, url TEXT);
                    CREATE TABLE task_notification_log(id INTEGER PRIMARY KEY, task_id INTEGER);
                    CREATE TABLE checklist_cells(id INTEGER PRIMARY KEY, proof_urls TEXT);
                    INSERT INTO projects VALUES(4, 'Legacy', 'health');
                    INSERT INTO project_members VALUES(1,4,99);
                    INSERT INTO tasks VALUES(18,4,'defense',30,'supervisors','Keep this task');
                    INSERT INTO task_recurrences VALUES(9,4,'health',30,'gs_zgs');
                    INSERT INTO task_comments VALUES(1,18,'Keep comment');
                    INSERT INTO task_attachments VALUES(1,18,'/uploads/keep');
                    INSERT INTO task_notification_log VALUES(1,18);
                    INSERT INTO checklist_cells VALUES(1,'["/uploads/proof"]');
                """)
            env = {**os.environ, "PANEL_DATABASE_URL": "sqlite://" + str(database), "DEV_MODE": "true"}
            def run(*args):
                result = subprocess.run([sys.executable, str(SCRIPT), "--backup-dir", str(root / "backups"), *args], env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)
                return json.loads(result.stdout)
            dry = run()
            self.assertEqual(dry["sphere_mismatches"]["tasks"], 1)
            self.assertFalse((root / "backups").exists())
            result = run("--apply")
            self.assertTrue(result["completed"])
            with closing(sqlite3.connect(result["backup"])) as original:
                self.assertEqual(original.execute("SELECT project_id FROM tasks").fetchone()[0], 4)
            with closing(sqlite3.connect(database)) as current:
                self.assertEqual(current.execute("SELECT id,sphere,server_id,audience,title FROM tasks").fetchone(), (18,"defense",30,"supervisors","Keep this task"))
                self.assertEqual(current.execute("SELECT id,sphere,audience FROM task_recurrences").fetchone(), (9,"health","gs_zgs"))
                self.assertEqual(current.execute("SELECT body FROM task_comments").fetchone()[0], "Keep comment")
                self.assertEqual(current.execute("SELECT proof_urls FROM checklist_cells").fetchone()[0], '["/uploads/proof"]')
                self.assertNotIn("project_id", [row[1] for row in current.execute("PRAGMA table_info(tasks)")])
                self.assertFalse(current.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").fetchall())
            again = run("--apply")
            self.assertFalse(again.get("completed", False))
            self.assertEqual(len(list((root / "backups").glob("*.sqlite3"))), 1)


if __name__ == "__main__":
    unittest.main()
