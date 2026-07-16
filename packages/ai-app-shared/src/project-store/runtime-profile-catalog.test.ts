import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { LocalAgentTargetStatus } from "../types/index.js";
import { RuntimeProfileStore } from "./index.js";

test("runtime profile catalog persists last-known-good, selection, and model fallback", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE runtime_profiles (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      agent_target_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      capabilities TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  const store = new RuntimeProfileStore(() => database, { defaultProfiles: [] });
  const first = target(["gpt-5", "gpt-5-mini"]);
  const persisted = store.persistLocalAgentCatalog({
    agents: [first],
    observedAt: "2026-07-16T00:00:00.000Z",
  });
  assert.equal(persisted.selectedRuntimeProfileId, "local-agent:target-codex");
  assert.equal(store.list()[0]?.model, "codex:gpt-5");

  database.prepare("UPDATE runtime_profiles SET model = ? WHERE id = ?")
    .run("codex:gpt-5-mini", "local-agent:target-codex");
  store.persistLocalAgentCatalog({
    agents: [target(["gpt-5-next"])],
    selectedRuntimeProfileId: "local-agent:target-codex",
    observedAt: "2026-07-16T01:00:00.000Z",
  });
  assert.equal(store.list()[0]?.model, "codex:gpt-5-next");
  assert.equal(store.readLocalAgentCatalogSnapshot().agents[0]?.models[0]?.id, "gpt-5-next");

  assert.throws(() => store.persistLocalAgentCatalog({
    agents: [{ ...target([]), supported: false }],
    observedAt: "2026-07-16T02:00:00.000Z",
  }), /does not contain a supported target/);
  assert.equal(store.readLocalAgentCatalogSnapshot().observedAt, "2026-07-16T01:00:00.000Z");
});

function target(models: string[]): LocalAgentTargetStatus {
  return {
    agentTargetId: "target-codex",
    providerId: "codex",
    provider: "codex",
    displayName: "Codex",
    supported: true,
    authState: "ok",
    models: models.map((id) => ({ id, label: id })),
    ...(models[0] ? { defaultModelId: models[0] } : {}),
    isDefault: true,
  };
}
