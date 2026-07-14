import assert from "node:assert/strict";
import test from "node:test";
import { agentLabelForRun } from "./index.js";

test("run labels distinguish same-provider Agent Targets", () => {
  const targets = [
    target("writer", "Writing Agent"),
    target("reviewer", "Review Agent"),
  ];
  assert.equal(agentLabelForRun({ agentTargetId: "writer", provider: "codex" }, targets), "Writing Agent");
  assert.equal(agentLabelForRun({ agentTargetId: "reviewer", provider: "codex" }, targets), "Review Agent");
  assert.equal(agentLabelForRun({ agentTargetId: "missing", provider: "codex" }, targets), "missing");
  assert.equal(agentLabelForRun({ agentTargetId: null, provider: "codex" }, targets), "codex");
});

function target(agentTargetId: string, displayName: string) {
  return {
    agentTargetId,
    providerId: "codex",
    provider: "codex",
    displayName,
    supported: true,
    authState: "ok" as const,
    models: [],
  };
}
