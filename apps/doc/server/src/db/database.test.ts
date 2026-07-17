import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./database.js";

test("migration backfills durable preparation for existing projects", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      template_id TEXT,
      template_name TEXT,
      updated_by TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO projects (id, title, type, content, created_at, updated_at)
    VALUES ('existing-doc', 'Existing', 'html', '<p>ready</p>', '2026-07-16T00:00:00.000Z', '2026-07-17T00:00:00.000Z');
  `);

  migrate(db);

  assert.deepEqual(
    { ...db.prepare(`SELECT core_state, agent_context_state, updated_at FROM project_preparation WHERE project_id = ?`).get("existing-doc") },
    { core_state: "ready", agent_context_state: "pending", updated_at: "2026-07-17T00:00:00.000Z" },
  );
});
