import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  localAgentRuntimeProfileSeed,
  resolveAgentTargetFromCatalog,
  resolvePreferredLocalAgentRuntimeProfileId,
  runtimeProfileIdFromAgentTarget,
} from "../packages/ai-app-shared/src/agent-providers/index.ts";
import { RuntimeProfileStore, defaultRuntimeProfiles } from "../packages/ai-app-shared/src/project-store/index.ts";

const profiles = [
  { id: "local-agent:research", kind: "local-agent", agentTargetId: "research", provider: "codex" },
  { id: "local-agent:writer", kind: "local-agent", agentTargetId: "writer", provider: "codex" },
];
const removedWorkspaceRootContract = /\b(?:TUTTI_WORKSPACE_ROOT|NEXTOP_WORKSPACE_ROOT|AI_(?:DOC|SLIDE|SHEET)_WORKSPACE(?:_ROOT)?)\b/;
const absoluteWorkspaceInstruction = /\/workspace(?:\/|\b)/i;
const agents = [
  target("research", "codex", true),
  { ...target("writer", "codex", true), isDefault: true },
];

assert.equal(resolvePreferredLocalAgentRuntimeProfileId({ profiles, agents }), "local-agent:writer");
assert.deepEqual(runtimeProfileIdFromAgentTarget("writer"), { value: "local-agent:writer" });
assert.equal(resolveAgentTargetFromCatalog({ agents, agentTargetId: "research" }).value?.agentTargetId, "research");
assert.match(resolveAgentTargetFromCatalog({ agents, agentTargetId: "missing" }).error ?? "", /not found/);
assert.match(
  resolveAgentTargetFromCatalog({ agents: [target("offline", "codex", false)], agentTargetId: "offline" }).error ?? "",
  /unavailable/,
);
assert.match(resolveAgentTargetFromCatalog({ agents, legacyProvider: "codex" }).error ?? "", /multiple Agent Targets/);
assert.equal(localAgentRuntimeProfileSeed("writer", "codex", "Writing Agent").displayName, "Writing Agent");
assert.deepEqual(defaultRuntimeProfiles({ demoModel: "demo", demoDisplayName: "Demo" }).map((profile) => profile.id), ["server-demo"]);

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
  );
`);
database.prepare(`
  INSERT INTO runtime_profiles (id, kind, agent_target_id, provider, model, display_name, enabled, capabilities, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "local-agent:legacy-codex",
  "local-agent",
  null,
  "codex",
  "codex:custom",
  "Legacy Agent",
  1,
  "{}",
  "2026-01-01T00:00:00.000Z",
  "2026-01-01T00:00:00.000Z",
);
const profileStore = new RuntimeProfileStore(() => database, {
  defaultProfiles: defaultRuntimeProfiles({ demoModel: "demo", demoDisplayName: "Demo" }),
});
profileStore.syncLocalAgentRuntimeProfiles(agents);
assert.deepEqual(
  profileStore.list().filter((profile) => profile.kind === "local-agent").map((profile) => profile.agentTargetId).sort(),
  ["research", "writer"],
);
assert.ok(profileStore.list().every((profile) => profile.id !== "local-agent:legacy-codex"));
assert.deepEqual(
  profileStore.list().filter((profile) => profile.kind === "local-agent").map((profile) => profile.model),
  ["codex:default", "codex:default"],
);

for (const file of [
  "apps/doc/server/src/tutti/cli-routes.ts",
  "apps/slide/server/src/tutti/cli-routes.ts",
  "apps/sheet/server/src/tutti/cli-routes.ts",
]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /resolveAgentTargetFromCatalog/);
  assert.match(source, /optionalString\(input, "agent-id"\)/);
  assert.match(source, /legacyProvider: provider/);
  assert.doesNotMatch(source, /ManagedAgentHeaders/);
  assert.doesNotMatch(source, /request\.headers/);
}

const runExecutorSource = readFileSync("packages/ai-app-agent/src/run-executor/index.ts", "utf8");
assert.doesNotMatch(runExecutorSource, /managedAgent/i);
assert.doesNotMatch(runExecutorSource, /request\.headers/);
const localRuntimeSource = readFileSync("packages/ai-app-agent/src/local-agent-runtime/index.ts", "utf8");
assert.match(localRuntimeSource, /projectDetectContext\(context\.agentDetectContext, runCwd, env\)/);
assert.match(localRuntimeSource, /localAgentRuntime\.detect\(detectContext\)/);
assert.match(localRuntimeSource, /agentTargetId,/);
assert.match(localRuntimeSource, /cwd: runCwd/);
assert.doesNotMatch(localRuntimeSource, removedWorkspaceRootContract);
assert.doesNotMatch(localRuntimeSource, /loadTuttiAgentCatalog/);
assert.doesNotMatch(localRuntimeSource, /loadTuttiAgentComposerOptions/);
assert.doesNotMatch(localRuntimeSource, /managedAgent/i);
for (const file of [
  "apps/doc/server/src/runtimes/local-agent-provider.ts",
  "apps/slide/server/src/runtimes/local-agent-provider.ts",
  "apps/sheet/server/src/runtimes/local-agent-provider.ts",
]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /detectContext: \{ \.\.\.\(context\.agentDetectContext \?\? \{\}\), cwd: projectCwd \}/);
  assert.doesNotMatch(source, removedWorkspaceRootContract);
  assert.doesNotMatch(source, absoluteWorkspaceInstruction);
  assert.doesNotMatch(source, /const (?:target|focused)\w*Path\s*=\s*(?:resolve|join)\(projectWorkspaceRoot/);
  assert.doesNotMatch(source, /resolve\([^,\n]+,\s*asset\.path\)/);
  assert.doesNotMatch(source, /managedAgent/i);
}
for (const [file, relativeGuidance] of [
  ["apps/doc/server/src/runtimes/local-agent-provider.ts", /Current focused file: document\.(?:html|md|docx) \(relative to the current working directory\)/],
  ["apps/slide/server/src/runtimes/local-agent-provider.ts", /Current focused file: slides\.pptx \(relative to the current working directory\)/],
  ["apps/sheet/server/src/runtimes/local-agent-provider.ts", /Current focused file: workbook\.xlsx \(relative to the current working directory\)/],
  ["apps/doc/server/src/artifact/document-preparation.ts", /Current focused file: document\.(?:html|md|docx) \(relative to this project directory\)/],
  ["apps/slide/server/src/artifact/project-materialization.ts", /Current focused (?:file|directory): \$\{artifact\.fileRef\} \(relative to this project directory\)/],
  ["apps/sheet/server/src/artifact/sheet-repository.ts", /Current focused file: \$\{xlsxArtifactFileRef\} \(relative to this project directory\)/],
]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, relativeGuidance);
  assert.doesNotMatch(source, removedWorkspaceRootContract);
  assert.doesNotMatch(source, absoluteWorkspaceInstruction);
  assert.doesNotMatch(source, /const (?:target|focused)\w*Path\s*=\s*(?:resolve|join)\(projectWorkspaceRoot/);
}
for (const file of [
  "apps/doc/bootstrap.sh",
  "apps/slide/bootstrap.sh",
  "apps/sheet/bootstrap.sh",
  "apps/doc/.tutti/dev-app/bootstrap.sh",
  "apps/slide/.tutti/dev-app/bootstrap.sh",
  "tooling/tutti/package-doc-tutti-app.mjs",
  "tooling/tutti/package-slide-tutti-app.mjs",
  "tooling/tutti/package-sheet-tutti-app.mjs",
]) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(source, removedWorkspaceRootContract);
}
const importSource = readFileSync("packages/ai-app-shared/src/import-source/index.ts", "utf8");
assert.match(importSource, /isAbsolute\(trimmed\)/);
assert.doesNotMatch(importSource, /process\.env|process\.cwd|homedir|WORKSPACE_ROOT/);
for (const file of ["apps/doc/tutti.app.json", "apps/slide/tutti.app.json", "apps/sheet/tutti.app.json"]) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  assert.ok(!manifest.hostCompatibility?.requiredTuttiCapabilities?.includes("managed-model-cli-v1"));
}

console.log("Agent Target runtime checks passed.");

function target(agentTargetId, providerId, supported) {
  return {
    agentTargetId,
    providerId,
    provider: providerId,
    displayName: agentTargetId,
    supported,
    authState: supported ? "ok" : "missing",
    models: [],
  };
}
