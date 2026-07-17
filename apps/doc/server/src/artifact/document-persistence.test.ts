import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { insertDocumentProject } from "./document-persistence.js";

test("document project and preparation inserts roll back atomically", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, title TEXT, type TEXT, content TEXT, template_id TEXT, template_name TEXT,
      updated_by TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE project_preparation (
      project_id TEXT PRIMARY KEY, core_state TEXT CHECK(core_state = 'ready'),
      agent_context_state TEXT, updated_at TEXT
    );
  `);

  assert.throws(() => insertDocumentProject(db, {
    id: "project-1",
    title: "Document",
    type: "html",
    content: "<p>content</p>",
    templateId: null,
    templateName: null,
    now: "2026-07-17T00:00:00.000Z",
  }));
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number }).count, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM project_preparation").get() as { count: number }).count, 0);
});
