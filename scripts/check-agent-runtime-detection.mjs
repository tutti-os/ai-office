import assert from "node:assert/strict";
import { createLocalAgentProviderDetector } from "../packages/ai-app-agent/src/local-agent-runtime/provider-detection.ts";
import { resolvePreferredLocalAgentRuntimeProfileId } from "../packages/ai-app-shared/src/agent-providers/index.ts";

const profiles = [
  { id: "cursor", kind: "local-agent", provider: "cursor" },
  { id: "codex", kind: "local-agent", provider: "codex" },
  { id: "claude", kind: "local-agent", provider: "claude" },
];

assert.equal(resolvePreferredLocalAgentRuntimeProfileId({
  profiles,
  providers: [{ provider: "claude-code", supported: true, isDefault: true }],
}), "claude");
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
}), "claude");
assert.equal(resolvePreferredLocalAgentRuntimeProfileId({
  profiles,
  providers: [
    { provider: "codex", supported: false, isDefault: true },
    { provider: "claude-code", supported: false },
  ],
}), "cursor");

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
  isDefault: true,
};

const first = detector.detect(managedContext);
const joined = detector.detect(managedContext);
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
assert.equal(calls, 4);
for (const operation of pending.splice(0)) operation.resolve([detectedProvider]);
await Promise.all([separateCredential, separateWorkspace, refresh]);

const rejected = detector.detect(managedContext);
pending.shift().reject(new Error("expected rejection"));
await assert.rejects(rejected, /expected rejection/);
const retry = detector.detect(managedContext);
assert.equal(calls, 6);
pending.shift().resolve([detectedProvider]);
await retry;

console.log("Agent runtime detection checks passed.");
