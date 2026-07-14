import assert from "node:assert/strict";
import test from "node:test";
import { resolveAgentMenuProfiles } from "@ai-app/shared/agent-providers";

test("AI Doc exposes multiple same-provider targets as separate choices", () => {
  const targets = [target("doc-researcher"), target("doc-writer")];
  assert.deepEqual(resolveAgentMenuProfiles([], targets).map((profile) => profile.agentTargetId), ["doc-researcher", "doc-writer"]);
});

function target(agentTargetId: string) {
  return { agentTargetId, providerId: "codex", provider: "codex", displayName: agentTargetId };
}
