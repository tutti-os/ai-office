import type { DatabaseSync } from "node:sqlite";
import { createDatabaseProvider, json, parseJson, rowOrNull, rows } from "@ai-app/shared/project-store";
import { appPaths, ensureBaseDirs } from "../local/paths.js";

export const getDb = createDatabaseProvider({
  dbPath: appPaths.dbPath,
  ensureBaseDirs,
  migrate,
});

function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      active_artifact_id TEXT NOT NULL DEFAULT '',
      template_id TEXT,
      template_name TEXT,
      updated_by TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      file_ref TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, updated_at);

    CREATE TABLE IF NOT EXISTS slide_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      runtime TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      instruction TEXT NOT NULL,
      selection_type TEXT NOT NULL,
      selection_path TEXT NOT NULL DEFAULT '',
      selected_text TEXT NOT NULL DEFAULT '',
      selected_html TEXT NOT NULL DEFAULT '',
      result_preview TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slide_run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'success',
      metadata TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES slide_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_slide_runs_project ON slide_runs(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_slide_run_events_run_order ON slide_run_events(run_id, sort_order, created_at);
  `);
}

export { json, parseJson, rowOrNull, rows };
