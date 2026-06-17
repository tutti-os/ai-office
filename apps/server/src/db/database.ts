import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { appPaths, ensureBaseDirs } from "../local/paths.js";

let db: DatabaseSync | null = null;

export function getDb() {
  if (db) return db;
  ensureBaseDirs();
  mkdirSync(dirname(appPaths.dbPath), { recursive: true });
  db = new DatabaseSync(appPaths.dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(database: DatabaseSync) {
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

    CREATE TABLE IF NOT EXISTS runtime_profiles (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      capabilities TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_runs (
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
}

export function json<T>(value: T) {
  return JSON.stringify(value);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
