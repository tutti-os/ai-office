import assert from "node:assert/strict";
import test from "node:test";
import type { BaseRun, BaseRunEvent } from "@ai-app/shared/types";
import { timelineToMessages } from "./index.js";

test("hides provider stderr diagnostics while preserving user-visible run output", () => {
  const assistant = assistantMessage([
    runEvent("stderr", "[INFO] acp_adapter.entry: Starting hermes-agent ACP adapter"),
    runEvent("text_delta", "Here are the available tools"),
  ]);

  assert.deepEqual(assistant.blocks, [
    { type: "result", text: "Here are the available tools" },
  ]);
});

test("keeps actual run errors visible", () => {
  const assistant = assistantMessage([runEvent("error", "Agent request failed")]);

  assert.deepEqual(assistant.blocks, [{ type: "error", text: "Agent request failed" }]);
});

function assistantMessage(events: BaseRunEvent[]) {
  const message = timelineToMessages([{ run: completedRun(), events }]).find(
    (candidate) => candidate.role === "assistant",
  );
  assert(message?.role === "assistant");
  return message;
}

function completedRun(): BaseRun {
  return {
    id: "run-1",
    projectId: "project-1",
    runtime: "local-agent",
    agentTargetId: "extension:hermes",
    provider: "hermes",
    model: "default",
    status: "completed",
    mode: "write",
    instruction: "What tools are available?",
    selectionType: "",
    selectionPath: "",
    selectedText: "",
    selectedHtml: "",
    resultPreview: "",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:01.000Z",
    completedAt: "2026-08-18T00:00:01.000Z",
    error: null,
  };
}

function runEvent(type: BaseRunEvent["type"], content: string): BaseRunEvent {
  return {
    id: `event-${type}`,
    runId: "run-1",
    projectId: "project-1",
    type,
    content,
    status: type === "error" ? "error" : "success",
    metadata: null,
    sortOrder: 0,
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}
