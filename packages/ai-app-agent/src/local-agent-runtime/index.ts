import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createDefaultLocalAgentProviderPlugins,
  createDefaultLocalAgentRuntime,
  createManagedAgentDetectContextFromHeaders,
  type AgentEvent,
  type DetectContext,
  type LocalAgentProviderPlugin,
  type RawAgentEvent,
  type RawAgentStream,
  type SkillMaterializationRecord,
} from "@tutti-os/agent-acp-kit";
import {
  loadTuttiAgentSkillContext,
  type LoadTuttiAgentSkillContextInput,
  type TuttiRecommendedSystemPrompt,
} from "@tutti-os/agent-acp-kit/tutti";
import { localAgentModelIdForAcp, localAgentProviderIdsMatch } from "@ai-app/shared/agent-providers";
import type { BaseAiEditRequest, BaseRun, LocalAgentProviderStatus, RuntimeProfile } from "@ai-app/shared/types";
import { safePathSegment } from "@ai-app/shared/local-paths";
import type { RuntimeEditContext, RuntimeProvider, RuntimeStreamEvent } from "@ai-app/agent/runtime";
import { createLocalAgentProviderDetector } from "./provider-detection.js";

const DEFAULT_TIMEOUT_MS = 180_000;

export type { SkillMaterializationFile, SkillMaterializationRecord } from "@tutti-os/agent-acp-kit";

export type LocalAgentMcpServer = {
  name: string;
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  startupTimeoutMs?: number;
  toolTimeoutMs?: number;
};

export type LocalAgentSkillContext = {
  skills: SkillMaterializationRecord[];
  recommendedSystemPrompt?: TuttiRecommendedSystemPrompt;
};

export type LocalAgentSkillManifestResult = SkillMaterializationRecord[] | Partial<LocalAgentSkillContext>;

export type LoadTuttiLocalAgentSkillContextInput = LoadTuttiAgentSkillContextInput;

export async function loadTuttiLocalAgentSkillContext(
  input: LoadTuttiLocalAgentSkillContextInput,
): Promise<LocalAgentSkillContext> {
  const context = await loadTuttiAgentSkillContext(input);
  return {
    skills: context.skillManifest,
    ...(context.recommendedSystemPrompt ? { recommendedSystemPrompt: context.recommendedSystemPrompt } : {}),
  };
}

export interface LocalAgentRuntimeProviderOptions<
  TRun extends BaseRun = BaseRun,
  TProject extends { id: string } = { id: string },
  TRequest extends BaseAiEditRequest = BaseAiEditRequest,
> {
  workspaceRoot(context: RuntimeEditContext<TRun, TProject, TRequest>): string;
  buildPrompt(context: RuntimeEditContext<TRun, TProject, TRequest>): string;
  buildSystemPrompt(
    context: RuntimeEditContext<TRun, TProject, TRequest>,
    workspaceRoot: string,
    skillContext: LocalAgentSkillContext,
  ): string | Promise<string>;
  buildSkillManifest?: (
    context: RuntimeEditContext<TRun, TProject, TRequest>,
    workspaceRoot: string,
  ) => LocalAgentSkillManifestResult | Promise<LocalAgentSkillManifestResult>;
  buildMcpServers?: (context: RuntimeEditContext<TRun, TProject, TRequest>) => LocalAgentMcpServer[];
  buildEnv?: (context: RuntimeEditContext<TRun, TProject, TRequest>, workspaceRoot: string) => Record<string, string> | Promise<Record<string, string>>;
  useProviderResume?: (context: RuntimeEditContext<TRun, TProject, TRequest>) => boolean;
  timeoutMs?: () => number;
  sessionDirName?: string;
  extraAllowedDirs?: (context: RuntimeEditContext<TRun, TProject, TRequest>, workspaceRoot: string) => string[];
}

export class LocalAgentRuntimeProvider<
  TRun extends BaseRun = BaseRun,
  TProject extends { id: string } = { id: string },
  TRequest extends BaseAiEditRequest = BaseAiEditRequest,
> implements RuntimeProvider<TRun, TProject, TRequest> {
  id = "local-agent";
  private readonly controllers = new Map<string, AbortController>();
  private readonly localAgentRuntime = createDefaultLocalAgentRuntime({
    providers: createAiAppLocalAgentProviderPlugins(),
  });
  private readonly providerDetector = createLocalAgentProviderDetector(this.localAgentRuntime);
  private readonly options: LocalAgentRuntimeProviderOptions<TRun, TProject, TRequest>;

  constructor(options: LocalAgentRuntimeProviderOptions<TRun, TProject, TRequest>) {
    this.options = options;
  }

  canHandle(profile: RuntimeProfile) {
    return profile.kind === "local-agent";
  }

  describeRun(profile: RuntimeProfile) {
    return { runtime: profile.kind, provider: profile.provider, model: profile.model };
  }

  async detect(profile: RuntimeProfile, context?: RuntimeEditContext<TRun, TProject, TRequest>) {
    const providerId = this.resolveProviderId(profile.provider);
    if (!providerId) {
      return { available: false, reason: `local-agent provider is not registered: ${profile.provider}` };
    }
    const workspaceRoot = context ? this.options.workspaceRoot(context) : undefined;
    const env = context && workspaceRoot ? await this.options.buildEnv?.(context, workspaceRoot) : undefined;
    const detectionContext: DetectContext | undefined = context
      ? {
          ...(workspaceRoot ? { cwd: context.managedAgent?.cwd ?? workspaceRoot } : {}),
          ...(env ? { env } : {}),
          ...(context.managedAgent ? { managedAgentInvocation: context.managedAgent.managedAgentInvocation } : {}),
        }
      : undefined;
    const detection = (await this.providerDetector.detect(detectionContext))
      .find((item) => localAgentProviderIdsMatch(item.provider, providerId));
    if (!detection?.supported) {
      return {
        available: false,
        reason: detection?.reason ?? `${profile.provider} is not installed, authenticated, or supported on this machine.`,
      };
    }
    return { available: true };
  }

  async listLocalAgentProviders(
    headers?: Record<string, string | string[] | undefined>,
    refresh = false,
  ): Promise<LocalAgentProviderStatus[]> {
    const cwd = configuredWorkspaceRoot();
    const managedContext = createManagedAgentDetectContextFromHeaders(headers, cwd ? { cwd } : undefined);
    const detectionContext: DetectContext | undefined = managedContext
      ? { ...managedContext, ...(refresh ? { refresh: true } : {}) }
      : cwd || refresh
        ? { ...(cwd ? { cwd } : {}), ...(refresh ? { refresh: true } : {}) }
        : undefined;
    return this.providerDetector.detect(detectionContext);
  }

  async *streamEdit(context: RuntimeEditContext<TRun, TProject, TRequest>) {
    const provider = this.resolveProviderId(context.runtimeProfile.provider) ?? context.runtimeProfile.provider;
    const workspaceRoot = this.options.workspaceRoot(context);
    const controller = new AbortController();
    this.controllers.set(context.run.id, controller);

    try {
      const sessionStore = new LocalAgentSessionStore(workspaceRoot, this.options.sessionDirName ?? ".ai-app");
      const conversationSessionId = context.conversation?.sessionId ?? context.project.id;
      const providerResumeEnabled = this.options.useProviderResume?.(context) ?? true;
      const previousSession = providerResumeEnabled ? sessionStore.read(conversationSessionId) : null;
      const providerSessionId = previousSession?.provider === provider ? previousSession.providerSessionId : undefined;
      const resumeToken = previousSession?.provider === provider ? previousSession.resumeToken : undefined;
      const resume =
        providerSessionId || resumeToken
          ? {
              mode: "provider" as const,
              ...(providerSessionId ? { providerSessionId } : {}),
              ...(resumeToken ? { resumeToken } : {}),
            }
          : { mode: "fresh" as const };

      let emittedEvent = false;
      try {
        for await (const runtimeEvent of this.runWithResume({
          context,
          controller,
          provider,
          persistProviderSession: providerResumeEnabled,
          resume,
          sessionStore,
          workspaceRoot,
        })) {
          emittedEvent = true;
          yield runtimeEvent;
        }
      } catch (error) {
        if (previousSession && !emittedEvent && isProviderResumeFailure(error)) {
          sessionStore.remove(conversationSessionId);
          for await (const runtimeEvent of this.runWithResume({
            context,
            controller,
            provider,
            persistProviderSession: providerResumeEnabled,
            resume: { mode: "fresh" },
            sessionStore,
            workspaceRoot,
          })) {
            yield runtimeEvent;
          }
          return;
        }
        throw error;
      }
    } finally {
      this.controllers.delete(context.run.id);
    }
  }

  private async *runWithResume(input: {
    context: RuntimeEditContext<TRun, TProject, TRequest>;
    controller: AbortController;
    persistProviderSession: boolean;
    provider: string;
    resume: { mode: "provider"; providerSessionId?: string; resumeToken?: string } | { mode: "fresh" };
    sessionStore: LocalAgentSessionStore;
    workspaceRoot: string;
  }) {
    const { context, controller, persistProviderSession, provider, resume, sessionStore, workspaceRoot } = input;
    let lastError: Extract<AgentEvent, { type: "error" }> | undefined;
    const agentCwd = context.managedAgent?.cwd ?? workspaceRoot;
    const skillContext = normalizeSkillManifestResult(await this.options.buildSkillManifest?.(context, workspaceRoot));
    const systemPrompt = await this.options.buildSystemPrompt(context, workspaceRoot, skillContext);
    const conversationId = context.conversation?.conversationId ?? context.project.id;
    const sessionId = context.conversation?.sessionId ?? context.project.id;
    for await (const event of this.localAgentRuntime.run({
      runId: context.run.id,
      conversationId,
      sessionId,
      provider,
      runtimeKind: "local-agent",
      runtimeProvider: provider,
      cwd: agentCwd,
      prompt: this.options.buildPrompt(context),
      systemPrompt,
      history: context.history ?? [],
      model: localAgentModelIdForAcp(context.runtimeProfile.model, provider),
      reasoning: context.request.reasoningEffort ?? undefined,
      mcpServers: context.managedAgent ? [] : (this.options.buildMcpServers?.(context) ?? []),
      skillManifest: skillContext.skills,
      env: (await this.options.buildEnv?.(context, workspaceRoot)) ?? {},
      ...(context.managedAgent ? { managedAgentInvocation: context.managedAgent.managedAgentInvocation } : {}),
      timeoutMs: this.options.timeoutMs?.() ?? DEFAULT_TIMEOUT_MS,
      extraAllowedDirs: this.options.extraAllowedDirs?.(context, workspaceRoot) ?? [workspaceRoot],
      resume,
      signal: controller.signal,
    } as any)) {
      const runtimeEvent = toRuntimeStreamEvent(event as AgentEvent);
      if ((event as AgentEvent).type === "error") {
        lastError = event as Extract<AgentEvent, { type: "error" }>;
      }
      if (runtimeEvent) {
        yield runtimeEvent;
      } else if ((event as any).type === "error") {
        throw new Error((event as any).message);
      } else if ((event as any).type === "done") {
        const done = event as any;
        if (persistProviderSession && (done.sessionId || done.resumeToken)) {
          sessionStore.write(sessionId, {
            provider,
            providerSessionId: done.sessionId,
            resumeToken: done.resumeToken,
          });
        }
        const terminalStatus =
          done.status ??
          (done.reason === "cancelled" ? "canceled" : done.reason === "error" ? "failed" : "completed");
        if (terminalStatus === "failed") {
          throw new Error(
            lastError?.message ??
              `local-agent ${provider} failed${typeof done.exitCode === "number" ? ` with exit code ${done.exitCode}` : ""}`,
          );
        }
        if (terminalStatus === "canceled") {
          throw new Error(`local-agent ${provider} was canceled`);
        }
      }
    }
  }

  private resolveProviderId(provider: string) {
    const registered = this.localAgentRuntime.listProviders().find((item: any) => localAgentProviderIdsMatch(item.id, provider));
    return registered?.id;
  }

  async cancel(runId: string) {
    const controller = this.controllers.get(runId);
    if (!controller) return { cancelled: false, reason: "local-agent run is not active" };
    controller.abort();
    await this.localAgentRuntime.cancel(runId).catch(() => undefined);
    this.controllers.delete(runId);
    return { cancelled: true };
  }
}

function normalizeSkillManifestResult(value: LocalAgentSkillManifestResult | undefined): LocalAgentSkillContext {
  if (!value) return { skills: [] };
  if (Array.isArray(value)) return { skills: value };
  return {
    skills: value.skills ?? [],
    ...(value.recommendedSystemPrompt ? { recommendedSystemPrompt: value.recommendedSystemPrompt } : {}),
  };
}

function createAiAppLocalAgentProviderPlugins(): LocalAgentProviderPlugin[] {
  return createDefaultLocalAgentProviderPlugins().map((provider) =>
    localAgentProviderIdsMatch(provider.id, "claude") ? withClaudeStreamCompatibility(provider) : provider,
  );
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function extractClaudeAssistantText(item: RawAgentEvent) {
  const record = toRecord(item);
  if (!record || record.type !== "assistant") return undefined;

  if (typeof record.text === "string" && record.text.trim()) return record.text;

  const message = toRecord(record.message);
  const content = message?.content;
  if (!Array.isArray(content)) return undefined;

  const text = content
    .map((entry) => {
      const block = toRecord(entry);
      return block?.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .filter(Boolean)
    .join("\n");
  return text.trim() ? text : undefined;
}

function extractClaudeResultText(item: RawAgentEvent) {
  const record = toRecord(item);
  if (!record || record.type !== "result" || record.is_error === true) return undefined;
  return typeof record.result === "string" && record.result.trim() ? record.result : undefined;
}

function splitClaudeReasoning(text: string): RawAgentEvent[] {
  const events: RawAgentEvent[] = [];
  let cleaned = text;
  const reasoningParts: string[] = [];
  cleaned = cleaned.replace(/<reasoning>([\s\S]*?)<\/reasoning>/g, (_match, content: string) => {
    const trimmed = content.trim();
    if (trimmed) reasoningParts.push(trimmed);
    return "";
  });

  if (reasoningParts.length > 0) events.push({ type: "thinking", text: reasoningParts.join("\n") });
  const finalText = cleaned.trim();
  if (finalText) events.push({ type: "assistant", text: finalText });
  return events;
}

async function* normalizeClaudeRawStream(stream: RawAgentStream): RawAgentStream {
  let emittedAssistantText = false;
  for await (const item of stream) {
    const assistantText = extractClaudeAssistantText(item);
    if (assistantText) {
      emittedAssistantText = true;
      yield* splitClaudeReasoning(assistantText);
      continue;
    }

    const resultText = emittedAssistantText ? undefined : extractClaudeResultText(item);
    if (resultText) {
      emittedAssistantText = true;
      yield* splitClaudeReasoning(resultText);
      continue;
    }

    yield item;
  }
}

function withClaudeStreamCompatibility(provider: LocalAgentProviderPlugin): LocalAgentProviderPlugin {
  const baseCreateAdapter = provider.createAdapter;
  const baseDetect = provider.detect.bind(provider);
  return {
    ...provider,
    detect: baseDetect,
    ...(baseCreateAdapter
      ? {
          createAdapter() {
            const adapter = baseCreateAdapter();
            return {
              ...adapter,
              parseEvents(stream: RawAgentStream) {
                return adapter.parseEvents(normalizeClaudeRawStream(stream));
              },
            };
          },
        }
      : {}),
  };
}

function isProviderResumeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /thread\/resume|resume failed|no rollout found|providerSessionId|resumeToken/i.test(message);
}

export function toRuntimeStreamEvent(event: AgentEvent): RuntimeStreamEvent | null {
  const item = event as any;
  if (item.type === "text_delta") return { type: "text_delta", text: item.text };
  if ((item.type === "assistant" || item.type === "agent_message" || item.type === "message") && typeof item.text === "string") {
    return { type: "text_delta", text: item.text };
  }
  if (item.type === "result" && item.is_error !== true && typeof item.result === "string") {
    return { type: "text_delta", text: item.result };
  }
  if (item.type === "thinking" || item.type === "thinking_delta") return { type: "thinking_delta", text: item.text };
  if (item.type === "tool_call") return { type: "tool_call", id: item.id, name: item.name || "unknown_tool", input: item.input };
  if (item.type === "tool_result") {
    return {
      type: "tool_result",
      id: item.id,
      name: item.name || "unknown_tool",
      status: item.status,
      output: item.output,
      summary: item.summary,
      error: item.error,
      isError: item.isError,
    };
  }
  if (item.type === "status") return { type: "status", status: item.status ?? item.stage, message: item.message };
  if (item.type === "file_write") return { type: "file_write", path: item.path };
  if (item.type === "stderr") return { type: "stderr", text: item.text };
  return null;
}

export function stripProviderPrefix(model: string, provider: string) {
  const prefix = `${provider}:`;
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
}

function configuredWorkspaceRoot() {
  return process.env.TUTTI_WORKSPACE_ROOT?.trim()
    || process.env.AI_DOC_WORKSPACE_ROOT?.trim()
    || process.env.AI_SLIDE_WORKSPACE_ROOT?.trim()
    || process.env.AI_SHEET_WORKSPACE_ROOT?.trim()
    || undefined;
}

interface StoredLocalAgentSession {
  provider: string;
  providerSessionId?: string;
  resumeToken?: string;
  updatedAt: string;
}

class LocalAgentSessionStore {
  private readonly workspaceRoot: string;
  private readonly sessionDirName: string;

  constructor(workspaceRoot: string, sessionDirName: string) {
    this.workspaceRoot = workspaceRoot;
    this.sessionDirName = sessionDirName;
  }

  read(projectId: string): StoredLocalAgentSession | null {
    try {
      const parsed = JSON.parse(readFileSync(this.pathFor(projectId), "utf8")) as StoredLocalAgentSession;
      return typeof parsed.provider === "string" && parsed.provider ? parsed : null;
    } catch {
      return null;
    }
  }

  write(projectId: string, session: Omit<StoredLocalAgentSession, "updatedAt">) {
    const filePath = this.pathFor(projectId);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify({ ...session, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  }

  remove(projectId: string) {
    try {
      unlinkSync(this.pathFor(projectId));
    } catch {
      // Missing session is equivalent to a fresh run.
    }
  }

  private pathFor(projectId: string) {
    return join(this.workspaceRoot, this.sessionDirName, "local-agent-sessions", `${safePathSegment(projectId)}.json`);
  }
}
