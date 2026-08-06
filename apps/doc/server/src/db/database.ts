import type { DatabaseSync } from "node:sqlite";
import { agentConversationSchemaSql, createDatabaseProvider, json, parseJson, rowOrNull, rows } from "@ai-app/shared/project-store";
import { appPaths, ensureBaseDirs } from "../local/paths.js";

export const getDb = createDatabaseProvider({
  dbPath: appPaths.dbPath,
  ensureBaseDirs,
  migrate,
});

export function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
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

    CREATE TABLE IF NOT EXISTS workspace_references (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE (project_id, relative_path)
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_references_project ON workspace_references(project_id, mtime_ms DESC);

    CREATE TABLE IF NOT EXISTS runtime_profiles (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      agent_target_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      capabilities TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_preparation (
      project_id TEXT PRIMARY KEY,
      core_state TEXT NOT NULL DEFAULT 'pending',
      agent_context_state TEXT NOT NULL DEFAULT 'pending',
      agent_context_generation INTEGER NOT NULL DEFAULT 0,
      agent_context_version TEXT,
      last_error_phase TEXT,
      last_error_path TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    INSERT OR IGNORE INTO project_preparation
      (project_id, core_state, agent_context_state, agent_context_generation, updated_at)
    SELECT id, 'ready', 'pending', 0, updated_at FROM projects;

    CREATE TABLE IF NOT EXISTS document_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      runtime TEXT NOT NULL,
      agent_target_id TEXT,
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

    CREATE TABLE IF NOT EXISTS document_run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'success',
      metadata TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES document_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_document_run_events_run_order ON document_run_events(run_id, sort_order, created_at);

    CREATE TABLE IF NOT EXISTS stream_events (
      id TEXT NOT NULL UNIQUE,
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      project_id TEXT,
      run_id TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stream_events_seq ON stream_events(seq);
    CREATE INDEX IF NOT EXISTS idx_stream_events_project ON stream_events(project_id, seq);
  `);
  ensureColumn(database, "runtime_profiles", "agent_target_id", "TEXT");
  ensureColumn(database, "document_runs", "agent_target_id", "TEXT");
  ensureColumn(database, "projects", "workspace_root", "TEXT");
  database.exec(agentConversationSchemaSql);
}

function ensureColumn(database: DatabaseSync, table: string, column: string, declaration: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
}

export { json, parseJson, rowOrNull, rows };
