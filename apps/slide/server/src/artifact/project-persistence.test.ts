import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { insertProjectWithArtifact } from "./project-persistence.js";

test("project and artifact inserts roll back atomically", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT, active_artifact_id TEXT, template_id TEXT, template_name TEXT, workspace_root TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE artifacts (id TEXT PRIMARY KEY, project_id TEXT, type TEXT CHECK(type = 'deck'), file_ref TEXT, mime_type TEXT, revision INTEGER, updated_by TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE project_preparation (project_id TEXT PRIMARY KEY, core_state TEXT, agent_context_state TEXT, updated_at TEXT);
  `);
  assert.throws(() => insertProjectWithArtifact(db, {
    project: { id: "p1", title: "Title", activeArtifactId: "a1", templateId: null, templateName: null },
    artifact: { id: "a1", type: "invalid", fileRef: "deck.slides", mimeType: "text/html" },
    now: "2026-07-17T00:00:00.000Z",
  }));
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number }).count, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM artifacts").get() as { count: number }).count, 0);
});
