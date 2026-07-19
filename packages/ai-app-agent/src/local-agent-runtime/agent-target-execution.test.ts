import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RuntimeProfile } from "@ai-app/shared/types";
import { isPlaceholderProfileModel, LocalAgentRuntimeProvider, projectDetectedAgentTargets, reconcileAgentTargetExecutionProfile, resolveRegisteredProviderId } from "./index.js";

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

test("execution resolution discovers project-scoped targets with the explicit run cwd", async () => {
  const provider = new LocalAgentRuntimeProvider({
    runCwd: (context) => `/projects/${context.project.id}`,
    buildPrompt: () => "prompt",
    buildSystemPrompt: () => "system",
  });
  let detectedCwd = "";
  (provider as any).loadAgentTargets = async (context: { cwd?: string }) => {
    detectedCwd = context.cwd ?? "";
    return [{ agentTargetId: "writer", providerId: "new_provider", supported: true }];
  };
  const resolved = await provider.resolveExecutionProfile(
    profile("writer", "old_provider", "old_provider:custom"),
    {
      run: run(),
      project: { id: "project-1" },
      runtimeProfile: profile("writer", "old_provider", "old_provider:custom"),
      request: { userPrompt: "Write", mode: "write" },
      agentDetectContext: { cwd: "/host/workspace" },
    },
  );
  assert.equal(detectedCwd, "/projects/project-1");
  assert.equal(resolved.provider, "new_provider");
});

test("placeholder model detection uses target metadata aliases instead of the resolved adapter id", () => {
  assert.equal(isPlaceholderProfileModel("claude-code:default", "claude-code"), true);
  assert.equal(isPlaceholderProfileModel("claude-code:default", "claude"), false);
});

test("detected Agent Targets preserve exact ids when multiple targets share one provider", () => {
  const projected = projectDetectedAgentTargets([
    detectedTarget("writer", "codex", "Writing Agent", true),
    { ...detectedTarget("reviewer", "codex", "Review Agent", true), isDefault: true },
  ]);
  assert.deepEqual(projected.map((target) => ({
    agentTargetId: target.agentTargetId,
    providerId: target.providerId,
    defaultModelId: target.defaultModelId,
    isDefault: target.isDefault,
  })), [
    { agentTargetId: "writer", providerId: "codex", defaultModelId: "gpt-5.2", isDefault: undefined },
    { agentTargetId: "reviewer", providerId: "codex", defaultModelId: "gpt-5.2", isDefault: true },
  ]);
});

test("standalone detections receive stable local target ids and a supported default", () => {
  const projected = projectDetectedAgentTargets([
    { ...detectedTarget("local:claude", "claude", "Claude", false), reason: "Authentication required" },
    detectedTarget("local:codex", "codex", "Codex", true),
  ]);
  assert.equal(projected[0]?.agentTargetId, "local:claude");
  assert.equal(projected[1]?.agentTargetId, "local:codex");
  assert.equal(projected[1]?.isDefault, true);
});

test("detections without an exact target id fail closed", () => {
  assert.deepEqual(projectDetectedAgentTargets([
    detectedTarget(undefined, "codex", "Codex", false),
  ]), []);
});

test("run preparation overlaps skills, env, and session reads and consumes kit timing diagnostics", async (t) => {
  t.mock.method(console, "info", () => undefined);
  const runCwd = await mkdtemp(join(tmpdir(), "ai-office-agent-prep-"));
  let skillStarted = false;
  let envStarted = false;
  let releasePreparation!: () => void;
  const preparationReleased = new Promise<void>((resolve) => {
    releasePreparation = resolve;
  });
  let announceConcurrent!: () => void;
  const concurrent = new Promise<void>((resolve) => {
    announceConcurrent = resolve;
  });
  const markStarted = () => {
    if (skillStarted && envStarted) announceConcurrent();
  };
  let skillCwd = "";
  let envCwd = "";
  let systemPromptCwd = "";
  const provider = new LocalAgentRuntimeProvider({
    runCwd: () => runCwd,
    buildPrompt: () => "prompt",
    buildSystemPrompt: (_context, cwd) => {
      systemPromptCwd = cwd;
      return "system";
    },
    buildSkillManifest: async (_context, cwd) => {
      skillCwd = cwd;
      skillStarted = true;
      markStarted();
      await preparationReleased;
      return [{
        skillId: "project-skill",
        slug: "project-skill",
        content: "# Project skill",
        deliveryMode: "prompt-injection" as const,
      }];
    },
    buildEnv: async (_context, cwd) => {
      envCwd = cwd;
      envStarted = true;
      markStarted();
      await preparationReleased;
      return { APP_CHILD_MARKER: "project-env" };
    },
  });
  let capturedInput: Record<string, unknown> | undefined;
  (provider as any).localAgentRuntime = {
    listProviders: () => [{ id: "codex" }],
    async *run(input: Record<string, unknown>) {
      capturedInput = input;
      yield {
        type: "status",
        diagnostic: {
          kind: "timing",
          phase: "prepare",
          stage: "provider_plan",
          elapsedMs: 12,
          totalElapsedMs: 20,
        },
      };
      yield { type: "text_delta", text: "ready" };
      yield { type: "done", status: "completed", sessionId: "provider-session-1" };
    },
  };
  const streamed: unknown[] = [];
  const collecting = (async () => {
    for await (const event of provider.streamEdit({
      run: { ...run(), provider: "codex", model: "codex:default" },
      project: { id: "project-1" },
      runtimeProfile: profile("writer", "codex", "codex:default"),
      request: { userPrompt: "Write", mode: "write" },
    })) streamed.push(event);
  })();

  try {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        concurrent,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("preparation did not overlap")), 1_000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    releasePreparation();
    await collecting;
    assert.deepEqual(streamed, [{ type: "text_delta", text: "ready" }]);
    assert.equal(skillCwd, runCwd);
    assert.equal(envCwd, runCwd);
    assert.equal(systemPromptCwd, runCwd);
    assert.equal(capturedInput?.cwd, runCwd);
    assert.equal(capturedInput?.systemPrompt, "system");
    assert.deepEqual(capturedInput?.extraAllowedDirs, [runCwd]);
    assert.deepEqual(capturedInput?.skillManifest, [{
      skillId: "project-skill",
      slug: "project-skill",
      content: "# Project skill",
      deliveryMode: "prompt-injection",
    }]);
    const childEnv = capturedInput?.env as Record<string, string>;
    assert.equal(childEnv.APP_CHILD_MARKER, "project-env");
    for (const forbidden of [
      "TUTTI_WORKSPACE_ROOT",
      "AI_DOC_WORKSPACE",
      "AI_DOC_WORKSPACE_ROOT",
      "AI_SLIDE_WORKSPACE",
      "AI_SLIDE_WORKSPACE_ROOT",
      "AI_SHEET_WORKSPACE",
      "AI_SHEET_WORKSPACE_ROOT",
    ]) {
      assert.equal(Object.hasOwn(childEnv, forbidden), false, `${forbidden} must not be in the explicit Agent env`);
    }
    assert.deepEqual(capturedInput?.metadata, { timingDiagnostics: true });
    const storedSession = JSON.parse(await readFile(
      join(runCwd, ".ai-app", "local-agent-sessions", "project-1.json"),
      "utf8",
    )) as { providerSessionId: string };
    assert.equal(storedSession.providerSessionId, "provider-session-1");
  } finally {
    releasePreparation();
    await rm(runCwd, { recursive: true, force: true });
  }
});

function detectedTarget(agentTargetId: string | undefined, provider: string, displayName: string, supported: boolean) {
  return {
    ...(agentTargetId ? { agentTargetId } : {}),
    provider,
    displayName,
    supported,
    authState: supported ? "ok" as const : "missing" as const,
    models: [{ id: "gpt-5.2", label: "GPT-5.2", description: "Model description" }],
    defaultModelId: "gpt-5.2",
  };
}

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

function run() {
  return {
    id: "run-1",
    projectId: "project-1",
    runtime: "local-agent",
    agentTargetId: "writer",
    provider: "old_provider",
    model: "old_provider:custom",
    status: "accepted" as const,
    mode: "write" as const,
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
