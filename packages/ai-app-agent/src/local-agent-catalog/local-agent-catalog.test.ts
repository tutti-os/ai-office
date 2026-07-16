import assert from "node:assert/strict";
import test from "node:test";
import type {
  LocalAgentCatalogSnapshot,
  LocalAgentTargetStatus,
  RuntimeProfile,
} from "@ai-app/shared/types";
import { applyLocalAgentCatalogResponse, LocalAgentCatalogService } from "./index.js";

const codex = target("target-codex", "codex", ["gpt-5", "gpt-5-mini"]);
const codexProfile = profile("target-codex", "codex", "gpt-5");

test("bootstrap is immediate and concurrent ensureLoaded requests share one load", async () => {
  let resolveLoad!: (agents: LocalAgentTargetStatus[]) => void;
  let loadCount = 0;
  const service = new LocalAgentCatalogService({
    load: () => {
      loadCount += 1;
      return new Promise((resolve) => { resolveLoad = resolve; });
    },
    commit: ({ agents, selectedRuntimeProfileId, observedAt }) => snapshot({
      agents,
      selectedRuntimeProfileId: selectedRuntimeProfileId || codexProfile.id,
      observedAt,
      source: "live",
      stale: false,
    }),
  });
  service.bootstrap(snapshot({ agents: [codex], selectedRuntimeProfileId: codexProfile.id }));
  assert.equal(service.getSnapshot().agents[0]?.agentTargetId, "target-codex");

  const first = service.ensureLoaded();
  const second = service.ensureLoaded();
  assert.equal(loadCount, 1);
  resolveLoad([codex]);
  assert.deepEqual(await first, await second);
});

test("explicit refresh keeps last-known-good when the load fails", async () => {
  let shouldFail = false;
  const refreshFlags: boolean[] = [];
  const service = new LocalAgentCatalogService({
    load: async (refresh) => {
      refreshFlags.push(refresh);
      if (shouldFail) throw new Error("temporary provider timeout");
      return [codex];
    },
    commit: ({ agents, observedAt }) => snapshot({
      agents,
      selectedRuntimeProfileId: codexProfile.id,
      observedAt,
      source: "live",
      stale: false,
    }),
  });
  service.bootstrap(snapshot({ agents: [codex], selectedRuntimeProfileId: codexProfile.id }));
  await service.ensureLoaded();
  shouldFail = true;
  const stale = await service.refresh();
  assert.deepEqual(refreshFlags, [false, true]);
  assert.equal(stale.agents[0]?.agentTargetId, "target-codex");
  assert.equal(stale.stale, true);
  assert.equal(stale.error, "temporary provider timeout");
});

test("explicit refresh bypasses the loaded snapshot and publishes new models", async () => {
  const refreshed = target("target-codex", "codex", ["gpt-5.1"]);
  const refreshFlags: boolean[] = [];
  const service = new LocalAgentCatalogService({
    load: async (refresh) => {
      refreshFlags.push(refresh);
      return refresh ? [refreshed] : [codex];
    },
    commit: ({ agents, observedAt }) => snapshot({
      agents,
      selectedRuntimeProfileId: codexProfile.id,
      observedAt,
      source: "live",
      stale: false,
    }),
  });
  service.bootstrap(snapshot({ agents: [codex], selectedRuntimeProfileId: codexProfile.id }));

  await service.ensureLoaded();
  const result = await service.refresh();

  assert.deepEqual(refreshFlags, [false, true]);
  assert.deepEqual(result.agents[0]?.models.map((model) => model.id), ["gpt-5.1"]);
  assert.equal(result.stale, false);
});

test("an empty bootstrap remains retryable after the initial load fails", async () => {
  let loadCount = 0;
  const service = new LocalAgentCatalogService({
    load: async () => {
      loadCount += 1;
      throw new Error("catalog unavailable");
    },
    commit: () => {
      throw new Error("commit must not run");
    },
  });
  service.bootstrap(snapshot({ agents: [], observedAt: null, source: "seed" }));

  await assert.rejects(service.ensureLoaded(), /catalog unavailable/);
  await assert.rejects(service.ensureLoaded(), /catalog unavailable/);

  assert.equal(loadCount, 2);
  assert.deepEqual(service.getSnapshot().agents, []);
  assert.equal(service.getSnapshot().stale, true);
});

for (const app of ["doc", "slide", "sheet"] as const) {
  test(`${app} client renders bootstrap and deterministically migrates a removed model`, () => {
    const oldProfile = profile("target-codex", "codex", "removed-model");
    const nextProfile = profile("target-codex", "codex", "gpt-5");
    const result = applyLocalAgentCatalogResponse({
      currentProfiles: [oldProfile],
      currentSelectedRuntimeProfileId: oldProfile.id,
      response: {
        ...snapshot({ agents: [codex], selectedRuntimeProfileId: nextProfile.id }),
        runtimeProfiles: [nextProfile],
      },
    });
    assert.equal(result.selectedRuntimeProfileId, nextProfile.id);
    assert.equal(result.runtimeProfiles[0]?.model, "codex:gpt-5");
    assert.match(result.notice ?? "", /selected model is unavailable/i);
  });

  test(`${app} client keeps the bootstrap selection when live refresh fails`, () => {
    const result = applyLocalAgentCatalogResponse({
      currentProfiles: [codexProfile],
      currentSelectedRuntimeProfileId: codexProfile.id,
      response: {
        ...snapshot({
          agents: [codex],
          selectedRuntimeProfileId: codexProfile.id,
          source: "stale",
          stale: true,
          error: "temporary provider timeout",
        }),
        runtimeProfiles: [codexProfile],
      },
    });
    assert.equal(result.selectedRuntimeProfileId, codexProfile.id);
    assert.equal(result.agents[0]?.agentTargetId, codex.agentTargetId);
  });

  test(`${app} client falls back to the next supported provider when the selected target disappears`, () => {
    const claude = target("target-claude", "claude-code", ["sonnet"]);
    const claudeProfile = profile("target-claude", "claude-code", "sonnet");
    const result = applyLocalAgentCatalogResponse({
      currentProfiles: [codexProfile],
      currentSelectedRuntimeProfileId: codexProfile.id,
      response: {
        ...snapshot({ agents: [claude], selectedRuntimeProfileId: claudeProfile.id }),
        runtimeProfiles: [claudeProfile],
      },
    });
    assert.equal(result.selectedRuntimeProfileId, claudeProfile.id);
    assert.match(result.notice ?? "", /selected Agent is unavailable/i);
  });
}

function target(agentTargetId: string, providerId: string, models: string[]): LocalAgentTargetStatus {
  return {
    agentTargetId,
    providerId,
    provider: providerId,
    displayName: providerId === "codex" ? "Codex" : providerId,
    supported: true,
    authState: "ok",
    models: models.map((id) => ({ id, label: id })),
    defaultModelId: models[0],
    isDefault: true,
  };
}

function profile(agentTargetId: string, provider: string, model: string): RuntimeProfile {
  return {
    id: `local-agent:${agentTargetId}`,
    kind: "local-agent",
    agentTargetId,
    provider,
    model: `${provider}:${model}`,
    displayName: provider === "codex" ? "Codex" : provider,
    enabled: true,
    capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

function snapshot(input: Partial<LocalAgentCatalogSnapshot>): LocalAgentCatalogSnapshot {
  return {
    agents: [],
    selectedRuntimeProfileId: "",
    observedAt: "2026-07-16T00:00:00.000Z",
    source: "persisted",
    stale: true,
    error: null,
    ...input,
  };
}
