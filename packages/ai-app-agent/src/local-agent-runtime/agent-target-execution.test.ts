import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeProfile } from "@ai-app/shared/types";
import { reconcileAgentTargetExecutionProfile, resolveRegisteredProviderId } from "./index.js";

test("execution profile derives provider from exact target and resets cross-provider model", () => {
  const resolved = reconcileAgentTargetExecutionProfile(profile("writer", "old_provider", "old_provider:custom"), {
    agentTargetId: "writer",
    providerId: "new_provider",
  });
  assert.equal(resolved.provider, "new_provider");
  assert.equal(resolved.model, "new_provider:default");
});

test("execution profile preserves model when exact target provider is unchanged", () => {
  const resolved = reconcileAgentTargetExecutionProfile(profile("writer", "foo_bar", "foo_bar:custom"), {
    agentTargetId: "writer",
    providerId: "foo_bar",
  });
  assert.equal(resolved.model, "foo_bar:custom");
});

test("adapter resolution prefers exact open provider id and rejects loose ambiguity", () => {
  assert.equal(resolveRegisteredProviderId("foo_bar", ["foo-bar", "foo_bar"]), "foo_bar");
  assert.throws(() => resolveRegisteredProviderId("FOO BAR", ["foo-bar", "foo_bar"]), /ambiguous/);
  assert.equal(resolveRegisteredProviderId("claude-code", ["claude"]), "claude");
});

function profile(agentTargetId: string, provider: string, model: string): RuntimeProfile {
  return {
    id: `local-agent:${agentTargetId}`,
    kind: "local-agent",
    agentTargetId,
    provider,
    model,
    displayName: agentTargetId,
    enabled: true,
    capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
