import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createLocalAgentProviderDetector } from "../packages/ai-app-agent/src/local-agent-runtime/provider-detection.ts";
import {
  localAgentRuntimeProfileSeed,
  resolvePreferredLocalAgentRuntimeProfileId,
  runtimeProfileIdFromProvider,
} from "../packages/ai-app-shared/src/agent-providers/index.ts";
import { RuntimeProfileStore, defaultRuntimeProfiles } from "../packages/ai-app-shared/src/project-store/index.ts";

const profiles = [
  { id: "cursor", kind: "local-agent", provider: "cursor" },
  { id: "codex", kind: "local-agent", provider: "codex" },
  { id: "claude-code", kind: "local-agent", provider: "claude-code" },
];

assert.equal(resolvePreferredLocalAgentRuntimeProfileId({
  profiles,
  providers: [{ provider: "claude-code", supported: true, isDefault: true }],
}), "claude-code");
assert.equal(resolvePreferredLocalAgentRuntimeProfileId({
  profiles,
  providers: [
    { provider: "codex", supported: true },
    { provider: "claude-code", supported: true },
  ],
}), "codex");
assert.equal(resolvePreferredLocalAgentRuntimeProfileId({
  profiles,
  providers: [
    { provider: "codex", supported: false },
    { provider: "claude-code", supported: true },
  ],
}), "claude-code");
assert.equal(resolvePreferredLocalAgentRuntimeProfileId({
  profiles,
  providers: [
    { provider: "codex", supported: false, isDefault: true },
    { provider: "claude-code", supported: false },
  ],
}), "cursor");
assert.equal(resolvePreferredLocalAgentRuntimeProfileId({ profiles, providers: [] }), "cursor");

let calls = 0;
const pending = [];
const runtime = {
  detect() {
    calls += 1;
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  },
};
const detector = createLocalAgentProviderDetector(runtime);
const managedContext = {
  cwd: "/workspace-a",
  managedAgentInvocation: { cwd: "/workspace-a", credential: "secret-a" },
};
const detectedProvider = {
  provider: "codex",
  displayName: "Codex",
  supported: true,
  authState: "ok",
  models: [{ id: "default", label: "Default" }],
  defaultModelId: "default",
  isDefault: true,
};

const first = detector.detect(managedContext);
const joined = detector.detect({
  ...managedContext,
  managedAgentInvocation: { ...managedContext.managedAgentInvocation },
});
assert.equal(first, joined);
assert.equal(calls, 1);
pending.shift().resolve([detectedProvider]);
assert.deepEqual(await first, [{ ...detectedProvider }]);

const separateCredential = detector.detect({
  ...managedContext,
  managedAgentInvocation: { ...managedContext.managedAgentInvocation, credential: "secret-b" },
});
const separateWorkspace = detector.detect({
  cwd: "/workspace-b",
  managedAgentInvocation: { cwd: "/workspace-b", credential: "secret-a" },
});
const refresh = detector.detect({ ...managedContext, refresh: true });
const separateEnvironment = detector.detect({
  ...managedContext,
  env: { PATH: "/opt/alternate/bin" },
});
assert.equal(calls, 5);
for (const operation of pending.splice(0)) operation.resolve([detectedProvider]);
await Promise.all([separateCredential, separateWorkspace, refresh, separateEnvironment]);

const rejected = detector.detect(managedContext);
pending.shift().reject(new Error("expected rejection"));
await assert.rejects(rejected, /expected rejection/);
const retry = detector.detect(managedContext);
assert.equal(calls, 7);
pending.shift().resolve([detectedProvider]);
await retry;

assert.deepEqual(runtimeProfileIdFromProvider("claude"), { value: "local-agent:claude-code" });
assert.deepEqual(runtimeProfileIdFromProvider("claude-code"), { value: "local-agent:claude-code" });
assert.equal(localAgentRuntimeProfileSeed("tutti-agent").provider, "tutti-agent");
assert.equal(defaultRuntimeProfiles({ demoModel: "demo", demoDisplayName: "Demo" })[1]?.id, "local-agent:claude-code");

const database = new DatabaseSync(":memory:");
database.exec(`
  CREATE TABLE runtime_profiles (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    display_name TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    capabilities TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
database.prepare(`
  INSERT INTO runtime_profiles (id, kind, provider, model, display_name, enabled, capabilities, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "local-agent:claude",
  "local-agent",
  "claude",
  "claude:default",
  "Claude Code",
  1,
  "{}",
  "2026-01-01T00:00:00.000Z",
  "2026-01-01T00:00:00.000Z",
);
database.prepare(`
  INSERT INTO runtime_profiles (id, kind, provider, model, display_name, enabled, capabilities, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "local-agent:nexight",
  "local-agent",
  "nexight",
  "nexight:default",
  "Nexight",
  1,
  "{}",
  "2026-01-01T00:00:00.000Z",
  "2026-01-01T00:00:00.000Z",
);
const profileStore = new RuntimeProfileStore(() => database, {
  defaultProfiles: defaultRuntimeProfiles({ demoModel: "demo", demoDisplayName: "Demo" }),
});
profileStore.ensureSeedData();
assert.deepEqual(
  profileStore.list().filter((profile) => profile.kind === "local-agent").map((profile) => ({ id: profile.id, provider: profile.provider, model: profile.model })),
  [{ id: "local-agent:claude-code", provider: "claude-code", model: "claude-code:default" }],
);

for (const file of [
  "apps/doc/server/src/tutti/cli-routes.ts",
  "apps/slide/server/src/tutti/cli-routes.ts",
  "apps/sheet/server/src/tutti/cli-routes.ts",
]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /createProjectCliResponse\(reply, \w+, readCliInputBody\(request\.body\), request\.headers\)/);
  assert.match(source, /agentRunCliResponse\(reply, \w+, readCliInputBody\(request\.body\), request\.headers\)/);
  assert.match(source, /headers: ManagedAgentHeaders/);
}

assert.doesNotMatch(readFileSync("packages/ai-app-agent/src/run-executor/index.ts", "utf8"), /managedAgentProviderId/);
for (const file of ["apps/doc/tutti.app.json", "apps/slide/tutti.app.json", "apps/sheet/tutti.app.json"]) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(manifest.hostCompatibility?.requiredTuttiCapabilities, ["managed-model-cli-v1"]);
}
for (const file of [
  ".github/workflows/publish-doc-tutti-app.yml",
  ".github/workflows/publish-doc-tutti-app-staging.yml",
  ".github/workflows/publish-slide-tutti-app.yml",
  ".github/workflows/publish-slide-tutti-app-staging.yml",
  ".github/workflows/publish-sheet-tutti-app-staging.yml",
]) {
  assert.doesNotMatch(readFileSync(file, "utf8"), /min_tutti_version:/);
}

console.log("Agent runtime detection checks passed.");
