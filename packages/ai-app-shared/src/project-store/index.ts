import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { BaseRun, BaseRunEvent, RuntimeProfile } from "@ai-app/shared/types";

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

export type RuntimeProfileSeed = Omit<RuntimeProfile, "createdAt" | "updatedAt">;

export class RuntimeProfileStore {
  constructor(
    private readonly getDb: () => DatabaseSync,
    private readonly options: {
      tableName?: string;
      defaultProfiles: RuntimeProfileSeed[];
      normalize?: (database: DatabaseSync) => void;
    },
  ) {}

  ensureSeedData() {
    const database = this.getDb();
    const count = (database.prepare(`SELECT COUNT(*) AS count FROM ${this.tableName}`).get() as { count: number }).count;
    if (count === 0) this.insertDefaultProfiles(database);
    this.options.normalize?.(database);
  }

  list() {
    return rows<RuntimeProfileRow>(
      this.getDb().prepare(`SELECT * FROM ${this.tableName} ORDER BY created_at ASC`).all(),
    ).map(rowToRuntimeProfile);
  }

  get(profileId: string | null | undefined) {
    if (!profileId) return this.getDefault();
    const row = rowOrNull<RuntimeProfileRow>(
      this.getDb().prepare(`SELECT * FROM ${this.tableName} WHERE id = ? AND enabled = 1`).get(profileId),
    );
    return row ? rowToRuntimeProfile(row) : this.getDefault();
  }

  getForRun(run: Pick<RuntimeProfile, "provider" | "model"> & { runtime: string }) {
    const row = rowOrNull<RuntimeProfileRow>(
      this.getDb()
        .prepare(`SELECT * FROM ${this.tableName} WHERE kind = ? AND provider = ? AND model = ? AND enabled = 1 LIMIT 1`)
        .get(run.runtime, run.provider, run.model),
    );
    if (row) return rowToRuntimeProfile(row);
    const fallback = rowOrNull<RuntimeProfileRow>(
      this.getDb()
        .prepare(`SELECT * FROM ${this.tableName} WHERE kind = ? AND provider = ? AND enabled = 1 ORDER BY created_at ASC LIMIT 1`)
        .get(run.runtime, run.provider),
    );
    return fallback ? rowToRuntimeProfile(fallback) : this.getDefault();
  }

  getDefault() {
    const row = rowOrNull<RuntimeProfileRow>(
      this.getDb()
        .prepare(`SELECT * FROM ${this.tableName} WHERE enabled = 1 ORDER BY kind = 'local-agent' DESC, created_at ASC LIMIT 1`)
        .get(),
    );
    if (!row) throw new Error("No runtime profile configured");
    return rowToRuntimeProfile(row);
  }

  private get tableName() {
    return this.options.tableName ?? "runtime_profiles";
  }

  private insertDefaultProfiles(database: DatabaseSync) {
    const now = new Date().toISOString();
    for (const profile of this.options.defaultProfiles) {
      database
        .prepare(
          `INSERT INTO ${this.tableName} (id, kind, provider, model, display_name, enabled, capabilities, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(profile.id, profile.kind, profile.provider, profile.model, profile.displayName, profile.enabled ? 1 : 0, json(profile.capabilities), now, now);
    }
  }
}

export type RunSeedInput = {
  projectId: string;
  runtime: string;
  provider: string;
  model: string;
  mode: string;
  instruction: string;
  selectionType: string;
  selectionPath: string;
  selectedText: string;
  selectedHtml: string;
};

export type RunEventSeedInput<TEvent extends BaseRunEvent> = {
  runId: string;
  projectId: string;
  type: TEvent["type"];
  content?: string;
  status?: TEvent["status"];
  metadata?: Record<string, unknown> | null;
  sortOrder: number;
};

export class SqliteRunStore<TRun extends BaseRun, TEvent extends BaseRunEvent> {
  constructor(
    private readonly getDb: () => DatabaseSync,
    private readonly options: {
      runsTable: string;
      eventsTable: string;
      createRunId: () => string;
      createEventId: () => string;
    },
  ) {}

  interruptActiveRuns(reason: string) {
    const activeRuns = rows<RunRow>(
      this.getDb().prepare(`SELECT * FROM ${this.options.runsTable} WHERE status IN ('accepted', 'running') ORDER BY created_at ASC`).all(),
    ).map(rowToRun<TRun>);
    for (const run of activeRuns) this.updateRun(run.id, { status: "failed", error: reason } as Partial<Pick<TRun, "status" | "error" | "resultPreview">>);
    return activeRuns;
  }

  listActiveRuns() {
    return rows<RunRow>(
      this.getDb().prepare(`SELECT * FROM ${this.options.runsTable} WHERE status IN ('accepted', 'running') ORDER BY created_at ASC`).all(),
    ).map(rowToRun<TRun>);
  }

  listRecentRunEvents(limit = 300) {
    return rows<RunEventRow>(
      this.getDb().prepare(`SELECT * FROM ${this.options.eventsTable} ORDER BY created_at ASC LIMIT ?`).all(limit),
    ).map(rowToRunEvent<TEvent>);
  }

  createRun(input: RunSeedInput) {
    const id = this.options.createRunId();
    const now = new Date().toISOString();
    this.getDb()
      .prepare(
        `INSERT INTO ${this.options.runsTable}
         (id, project_id, runtime, provider, model, status, mode, instruction, selection_type, selection_path, selected_text, selected_html, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.runtime,
        input.provider,
        input.model,
        input.mode,
        input.instruction,
        input.selectionType,
        input.selectionPath,
        input.selectedText,
        input.selectedHtml,
        now,
        now,
      );
    const run = this.getRun(id);
    if (!run) throw new Error("Unable to create run");
    return run;
  }

  getRun(runId: string) {
    const row = rowOrNull<RunRow>(this.getDb().prepare(`SELECT * FROM ${this.options.runsTable} WHERE id = ?`).get(runId));
    return row ? rowToRun<TRun>(row) : null;
  }

  listProjectRuns(projectId: string) {
    return rows<RunRow>(
      this.getDb()
        .prepare(`SELECT * FROM ${this.options.runsTable} WHERE project_id = ? ORDER BY created_at ASC, id ASC`)
        .all(projectId),
    ).map(rowToRun<TRun>);
  }

  updateRun(runId: string, input: Partial<Pick<TRun, "status" | "error" | "resultPreview">>) {
    const current = this.getRun(runId);
    if (!current) return null;
    const now = new Date().toISOString();
    const completedAt = input.status && ["completed", "failed", "cancelled"].includes(input.status) ? now : current.completedAt;
    this.getDb()
      .prepare(
        `UPDATE ${this.options.runsTable}
         SET status = ?, error = ?, result_preview = ?, updated_at = ?, completed_at = ?
         WHERE id = ?`,
      )
      .run(input.status ?? current.status, input.error ?? current.error, input.resultPreview ?? current.resultPreview, now, completedAt, runId);
    return this.getRun(runId);
  }

  createRunEvent(input: RunEventSeedInput<TEvent>) {
    const id = this.options.createEventId();
    const now = new Date().toISOString();
    this.getDb()
      .prepare(
        `INSERT INTO ${this.options.eventsTable} (id, run_id, project_id, type, content, status, metadata, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId,
        input.projectId,
        input.type,
        input.content ?? "",
        input.status ?? "success",
        input.metadata ? json(input.metadata) : null,
        input.sortOrder,
        now,
      );
    const row = rowOrNull<RunEventRow>(this.getDb().prepare(`SELECT * FROM ${this.options.eventsTable} WHERE id = ?`).get(id));
    if (!row) throw new Error("Unable to create run event");
    return rowToRunEvent<TEvent>(row);
  }

  listRunEvents(runId: string) {
    return rows<RunEventRow>(
      this.getDb()
        .prepare(`SELECT * FROM ${this.options.eventsTable} WHERE run_id = ? ORDER BY sort_order ASC, created_at ASC`)
        .all(runId),
    ).map(rowToRunEvent<TEvent>);
  }
}

export function defaultRuntimeProfiles(input: { demoModel: string; demoDisplayName: string }): RuntimeProfileSeed[] {
  return [
    {
      id: "local-agent:codex",
      kind: "local-agent",
      provider: "codex",
      model: "codex:default",
      displayName: "Codex",
      enabled: true,
      capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
    },
    {
      id: "local-agent:claude",
      kind: "local-agent",
      provider: "claude",
      model: "claude:default",
      displayName: "Claude Code",
      enabled: true,
      capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
    },
    {
      id: "server-demo",
      kind: "server-demo",
      provider: "demo",
      model: input.demoModel,
      displayName: input.demoDisplayName,
      enabled: true,
      capabilities: { streaming: false, toolUse: false, reasoning: false, resume: false },
    },
  ];
}

interface RuntimeProfileRow {
  id: string;
  kind: RuntimeProfile["kind"];
  provider: string;
  model: string;
  display_name: string;
  enabled: number;
  capabilities: string;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  project_id: string;
  runtime: string;
  provider: string;
  model: string;
  status: BaseRun["status"];
  mode: BaseRun["mode"];
  instruction: string;
  selection_type: string;
  selection_path: string;
  selected_text: string;
  selected_html: string;
  result_preview: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
}

interface RunEventRow {
  id: string;
  run_id: string;
  project_id: string;
  type: BaseRunEvent["type"];
  content: string;
  status: BaseRunEvent["status"];
  metadata: string | null;
  sort_order: number;
  created_at: string;
}

function rowToRuntimeProfile(row: RuntimeProfileRow): RuntimeProfile {
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    capabilities: parseJson(row.capabilities, { streaming: false, toolUse: false, reasoning: false, resume: false }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRun<TRun extends BaseRun>(row: RunRow): TRun {
  return {
    id: row.id,
    projectId: row.project_id,
    runtime: row.runtime,
    provider: row.provider,
    model: row.model,
    status: row.status,
    mode: row.mode,
    instruction: row.instruction,
    selectionType: row.selection_type,
    selectionPath: row.selection_path,
    selectedText: row.selected_text,
    selectedHtml: row.selected_html,
    resultPreview: row.result_preview,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    error: row.error,
  } as TRun;
}

function rowToRunEvent<TEvent extends BaseRunEvent>(row: RunEventRow): TEvent {
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    type: row.type,
    content: row.content,
    status: row.status,
    metadata: row.metadata ? parseJson(row.metadata, null) : null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  } as TEvent;
}
