import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreferredLocalAgentRuntimeProfileId } from "@ai-app/shared/agent-providers";

test("AI Slide selects the catalog default by exact target id", () => {
  const profiles = [profile("slide-builder"), profile("slide-reviewer")];
  const agents = [target("slide-builder"), { ...target("slide-reviewer"), isDefault: true as const }];
  assert.equal(resolvePreferredLocalAgentRuntimeProfileId({ profiles, agents }), "local-agent:slide-reviewer");
});

function profile(agentTargetId: string) {
  return { id: `local-agent:${agentTargetId}`, kind: "local-agent", agentTargetId, provider: "claude-code" };
}

function target(agentTargetId: string) {
  return { agentTargetId, providerId: "claude-code", provider: "claude-code", supported: true };
}
