import assert from "node:assert/strict";
import test from "node:test";
import { resolveAgentTargetFromCatalog } from "@ai-app/shared/agent-providers";

test("AI Sheet rejects ambiguous deprecated provider input", () => {
  const result = resolveAgentTargetFromCatalog({
    agents: [target("sheet-author", true), target("sheet-auditor", false)],
    legacyProvider: "cursor",
  });
  assert.match(result.error ?? "", /multiple Agent Targets/);
});

function target(agentTargetId: string, supported: boolean) {
  return { agentTargetId, providerId: "cursor", provider: "cursor", supported };
}
