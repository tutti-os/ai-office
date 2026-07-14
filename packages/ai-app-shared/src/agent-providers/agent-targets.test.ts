import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  localAgentModelIdForAcp,
  isAvailableLocalAgentRuntimeProfileId,
  resolveAgentMenuProfiles,
  resolveAgentTargetFromCatalog,
  resolvePreferredLocalAgentRuntimeProfileId,
} from "./index.js";
import { RuntimeProfileStore } from "../project-store/index.js";

const agents = [
  target("research", "codex", true),
  { ...target("writer", "codex", true), isDefault: true as const },
];

test("same-provider Agent Targets remain distinct in profiles and selection", () => {
  const profiles = resolveAgentMenuProfiles([], agents);
  assert.deepEqual(profiles.map((profile) => profile.id), ["local-agent:research", "local-agent:writer"]);
  assert.equal(resolvePreferredLocalAgentRuntimeProfileId({ profiles, agents }), "local-agent:writer");
});

test("persisted selection falls back when its exact target is unavailable", () => {
  const profiles = resolveAgentMenuProfiles([], agents);
  const unavailable = agents.map((agent) => agent.agentTargetId === "writer" ? { ...agent, supported: false } : agent);
  assert.equal(isAvailableLocalAgentRuntimeProfileId("local-agent:writer", profiles, unavailable), false);
  assert.equal(resolvePreferredLocalAgentRuntimeProfileId({ profiles, agents: unavailable }), "local-agent:research");
});

test("loaded catalogs with no available target never select stale or disabled profiles", () => {
  const profiles = resolveAgentMenuProfiles([], [target("offline", "codex", false)]);
  assert.equal(resolvePreferredLocalAgentRuntimeProfileId({ profiles, agents: [target("offline", "codex", false)] }), "");
  assert.equal(resolvePreferredLocalAgentRuntimeProfileId({ profiles, agents: [] }), "");
});

test("legacy provider mapping checks the full catalog and fails closed when ambiguous", () => {
  const result = resolveAgentTargetFromCatalog({
    agents: [target("available", "codex", true), target("offline", "codex", false)],
    legacyProvider: "codex",
  });
  assert.match(result.error ?? "", /multiple Agent Targets/);
});

test("provider-specific model adapters remain derived runtime behavior", () => {
  assert.equal(localAgentModelIdForAcp("cursor:default", "cursor"), "default[]");
  assert.equal(localAgentModelIdForAcp("claude:sonnet", "claude-code"), "sonnet");
});

test("open provider ids round-trip without kebab-case rewriting", () => {
  const seed = resolveAgentMenuProfiles([], [target("custom", "foo_bar", true)])[0];
  assert.equal(seed?.provider, "foo_bar");
});

test("legacy provider-only profile migrates only for a unique full-catalog target", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE runtime_profiles (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, agent_target_id TEXT, provider TEXT NOT NULL,
      model TEXT NOT NULL, display_name TEXT NOT NULL, enabled INTEGER NOT NULL,
      capabilities TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO runtime_profiles VALUES (
      'legacy', 'local-agent', NULL, 'foo-bar', 'foo-bar:custom', 'Legacy', 1, '{}',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
  `);
  const store = new RuntimeProfileStore(() => database, { defaultProfiles: [] });
  store.syncLocalAgentRuntimeProfiles([{
    agentTargetId: "unique-custom",
    providerId: "foo_bar",
    displayName: "Custom Agent",
    supported: true,
  }]);
  assert.deepEqual(store.list().map((profile) => ({ id: profile.id, agentTargetId: profile.agentTargetId, model: profile.model })), [{
    id: "local-agent:unique-custom",
    agentTargetId: "unique-custom",
    model: "foo_bar:custom",
  }]);
  assert.equal(localAgentModelIdForAcp(store.list()[0]!.model, store.list()[0]!.provider), "custom");
  assert.throws(() => store.getForRun({
    runtime: "local-agent",
    agentTargetId: "missing-target",
    provider: "foo_bar",
    model: "foo-bar:custom",
  }), /missing-target/);
  store.syncLocalAgentRuntimeProfiles([{
    agentTargetId: "unique-custom",
    providerId: "claude-code",
    displayName: "Renamed Agent",
    supported: true,
  }]);
  assert.deepEqual(store.list().map((profile) => ({ provider: profile.provider, displayName: profile.displayName, model: profile.model })), [{
    provider: "claude-code",
    displayName: "Renamed Agent",
    model: "claude-code:default",
  }]);
});

function target(agentTargetId: string, providerId: string, supported: boolean) {
  return { agentTargetId, providerId, provider: providerId, displayName: agentTargetId, supported };
}
