import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DatabaseMigrator = (database: DatabaseSync) => void;

export function createDatabaseProvider(input: {
  dbPath: string;
  ensureBaseDirs: () => void;
  migrate: DatabaseMigrator;
}) {
  let db: DatabaseSync | null = null;
  return function getDb() {
    if (db) return db;
    input.ensureBaseDirs();
    mkdirSync(dirname(input.dbPath), { recursive: true });
    db = new DatabaseSync(input.dbPath);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA journal_mode = WAL");
    input.migrate(db);
    return db;
  };
}

export function rows<TRow>(value: unknown): TRow[] {
  return value as TRow[];
}

export function rowOrNull<TRow>(value: unknown): TRow | null {
  return (value ?? null) as TRow | null;
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
