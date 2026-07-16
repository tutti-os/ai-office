import type { DatabaseSync } from "node:sqlite";
import {
  isAvailableLocalAgentRuntimeProfileId,
  resolvePreferredLocalAgentRuntimeProfileId,
} from "../agent-providers/index.js";
import type {
  LocalAgentCatalogSnapshot,
  LocalAgentTargetStatus,
  RuntimeProfile,
} from "../types/index.js";

export function ensureLocalAgentCatalogStateTable(database: DatabaseSync, tableName: string) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${catalogStateTableName(tableName)} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      agents_json TEXT NOT NULL,
      selected_profile_id TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export function readLocalAgentCatalogSnapshot(
  database: DatabaseSync,
  tableName: string,
): LocalAgentCatalogSnapshot {
  const row = database
    .prepare(`SELECT * FROM ${catalogStateTableName(tableName)} WHERE id = 1`)
    .get() as LocalAgentCatalogStateRow | undefined;
  if (!row) return emptySnapshot();
  return {
    agents: parseLocalAgentCatalog(row.agents_json),
    selectedRuntimeProfileId: row.selected_profile_id,
    observedAt: row.observed_at,
    source: "persisted",
    stale: true,
    error: null,
  };
}

export function persistLocalAgentCatalog(input: {
  database: DatabaseSync;
  tableName: string;
  agents: LocalAgentTargetStatus[];
  selectedRuntimeProfileId?: string;
  observedAt: string;
  syncProfiles: (agents: LocalAgentTargetStatus[]) => void;
  listProfiles: () => RuntimeProfile[];
}): LocalAgentCatalogSnapshot {
  const agents = cloneLocalAgentCatalog(input.agents);
  if (!agents.some((agent) => agent.supported)) {
    throw new Error("Local Agent catalog does not contain a supported target");
  }
  input.database.exec("BEGIN IMMEDIATE");
  try {
    input.syncProfiles(agents);
    const profiles = input.listProfiles();
    const requested = input.selectedRuntimeProfileId?.trim() ?? "";
    const selectedRuntimeProfileId = isAvailableLocalAgentRuntimeProfileId(
      requested,
      profiles,
      agents,
    )
      ? requested
      : resolvePreferredLocalAgentRuntimeProfileId({ profiles, agents });
    input.database.prepare(
      `INSERT INTO ${catalogStateTableName(input.tableName)}
        (id, agents_json, selected_profile_id, observed_at, source, updated_at)
       VALUES (1, ?, ?, ?, 'live', ?)
       ON CONFLICT(id) DO UPDATE SET
        agents_json = excluded.agents_json,
        selected_profile_id = excluded.selected_profile_id,
        observed_at = excluded.observed_at,
        source = excluded.source,
        updated_at = excluded.updated_at`,
    ).run(JSON.stringify(agents), selectedRuntimeProfileId, input.observedAt, new Date().toISOString());
    input.database.exec("COMMIT");
    return {
      agents,
      selectedRuntimeProfileId,
      observedAt: input.observedAt,
      source: "live",
      stale: false,
      error: null,
    };
  } catch (error) {
    input.database.exec("ROLLBACK");
    throw error;
  }
}

export function persistSelectedLocalAgentRuntimeProfile(input: {
  database: DatabaseSync;
  tableName: string;
  profileId: string;
  profiles: RuntimeProfile[];
  snapshot: LocalAgentCatalogSnapshot;
}) {
  const selectedRuntimeProfileId = input.profileId.trim();
  if (!isAvailableLocalAgentRuntimeProfileId(selectedRuntimeProfileId, input.profiles, input.snapshot.agents)) {
    throw new Error(`Local Agent runtime profile is unavailable: ${selectedRuntimeProfileId}`);
  }
  input.database
    .prepare(`UPDATE ${catalogStateTableName(input.tableName)} SET selected_profile_id = ?, updated_at = ? WHERE id = 1`)
    .run(selectedRuntimeProfileId, new Date().toISOString());
  return { ...input.snapshot, selectedRuntimeProfileId };
}

function catalogStateTableName(tableName: string) {
  return `${tableName}_catalog_state`;
}

function emptySnapshot(): LocalAgentCatalogSnapshot {
  return {
    agents: [],
    selectedRuntimeProfileId: "",
    observedAt: null,
    source: "seed",
    stale: true,
    error: null,
  };
}

function parseLocalAgentCatalog(value: string): LocalAgentTargetStatus[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const target = candidate as Partial<LocalAgentTargetStatus>;
    if (
      typeof target.agentTargetId !== "string" ||
      typeof target.providerId !== "string" ||
      typeof target.provider !== "string" ||
      typeof target.displayName !== "string" ||
      typeof target.supported !== "boolean" ||
      !Array.isArray(target.models)
    ) return [];
    return [projectLocalAgentTarget(target as LocalAgentTargetStatus)];
  });
}

function cloneLocalAgentCatalog(agents: LocalAgentTargetStatus[]) {
  return agents.map(projectLocalAgentTarget);
}

function projectLocalAgentTarget(agent: LocalAgentTargetStatus): LocalAgentTargetStatus {
  return {
    agentTargetId: agent.agentTargetId,
    providerId: agent.providerId,
    provider: agent.provider,
    displayName: agent.displayName,
    supported: agent.supported,
    authState: agent.authState,
    models: agent.models.flatMap((model) => (
      model && typeof model.id === "string" && typeof model.label === "string"
        ? [{ id: model.id, label: model.label }]
        : []
    )),
    ...(agent.defaultModelId ? { defaultModelId: agent.defaultModelId } : {}),
    ...(agent.isDefault ? { isDefault: true as const } : {}),
    ...(agent.reason ? { reason: agent.reason } : {}),
  };
}

interface LocalAgentCatalogStateRow {
  agents_json: string;
  selected_profile_id: string;
  observed_at: string;
}
