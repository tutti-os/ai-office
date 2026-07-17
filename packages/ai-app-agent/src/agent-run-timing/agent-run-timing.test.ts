import assert from "node:assert/strict";
import test from "node:test";
import { createAgentRunTimingLogger, type AgentRunTimingEntry } from "./index.js";

test("agent timing logger emits structured secret-free phases", async () => {
  let now = 1_000;
  const entries: AgentRunTimingEntry[] = [];
  const timing = createAgentRunTimingLogger({
    runId: "run-1",
    provider: "codex",
    agentTargetId: "local:codex",
    scope: "agent.runtime",
  }, {
    now: () => now,
    sink: (entry) => entries.push(entry),
  });

  await timing.measure("prepare", "skill_manifest", async () => {
    now = 1_025;
  });
  timing.emit("agent_execution_started", { model: "gpt-5.4" });

  assert.equal(entries[0]?.event, "agent_stage_done");
  assert.equal(entries[0]?.stage, "skill_manifest");
  assert.equal(entries[0]?.elapsed_ms, 25);
  assert.equal(entries[1]?.provider, "codex");
  assert.equal(entries[1]?.agent_target_id, "local:codex");
  assert.doesNotMatch(JSON.stringify(entries), /cwd|credential|prompt|token/i);
});
