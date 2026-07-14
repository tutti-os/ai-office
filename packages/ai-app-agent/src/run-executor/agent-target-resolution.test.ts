import assert from "node:assert/strict";
import test from "node:test";
import type { BaseRun, RuntimeProfile } from "@ai-app/shared/types";
import { RuntimeProviderRegistry } from "@ai-app/agent/runtime";
import { RuntimeRunExecutor } from "./index.js";

test("executor resolves once and persists reconciled target metadata before run.started", async () => {
  let currentRun = run();
  let detectCalls = 0;
  const updates: Array<Partial<BaseRun>> = [];
  const events: BaseRun[] = [];
  const provider = {
    id: "local-agent",
    canHandle: (profile: RuntimeProfile) => profile.kind === "local-agent",
    resolveExecutionProfile: async (profile: RuntimeProfile, context: any) => {
      assert.equal(context.project.id, "project-1");
      return { ...profile, provider: "new-provider", model: "new-provider:default" };
    },
    describeRun: (profile: RuntimeProfile) => ({
      runtime: profile.kind,
      agentTargetId: profile.agentTargetId,
      provider: profile.provider,
      model: profile.model,
    }),
    detect: async () => {
      detectCalls += 1;
      return { available: true };
    },
    async *streamEdit() {
      yield { type: "text_delta" as const, text: "done" };
    },
    cancel: async () => ({ cancelled: true }),
  };
  const executor = new RuntimeRunExecutor({
    repo: {
      getRun: () => currentRun,
      updateRun: (_runId, input) => {
        updates.push(input);
        currentRun = { ...currentRun, ...input };
        return currentRun;
      },
      createRunEvent: (input) => ({
        id: "event-1",
        runId: input.runId,
        projectId: input.projectId,
        type: input.type,
        content: input.content ?? "",
        status: input.status ?? "pending",
        metadata: input.metadata ?? null,
        sortOrder: input.sortOrder,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    },
    events: {
      emit: (event) => {
        if (event.type === "run.started" && event.payload.run) events.push(event.payload.run);
      },
    },
    runtimes: new RuntimeProviderRegistry([provider]),
  });

  await executor.execute({
    project: { id: "project-1" },
    request: { userPrompt: "Write", mode: "write" },
    runtimeProfile: profile(),
    runId: currentRun.id,
    isCancelled: () => false,
    finalizeCancellation: async () => undefined,
    complete: async () => undefined,
  });

  assert.equal(detectCalls, 0);
  assert.equal(updates[0]?.agentTargetId, "writer");
  assert.equal(updates[0]?.provider, "new-provider");
  assert.equal(updates[0]?.model, "new-provider:default");
  assert.equal(events[0]?.provider, "new-provider");
});

function profile(): RuntimeProfile {
  return {
    id: "local-agent:writer",
    kind: "local-agent",
    agentTargetId: "writer",
    provider: "old-provider",
    model: "old-provider:custom",
    displayName: "Writer",
    enabled: true,
    capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function run(): BaseRun {
  return {
    id: "run-1",
    projectId: "project-1",
    runtime: "local-agent",
    agentTargetId: "writer",
    provider: "old-provider",
    model: "old-provider:custom",
    status: "accepted",
    mode: "write",
    instruction: "Write",
    selectionType: "write",
    selectionPath: "",
    selectedText: "",
    selectedHtml: "",
    resultPreview: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    error: null,
  };
}
