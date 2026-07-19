import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createDefaultLocalAgentProviderPlugins,
  createDefaultLocalAgentRuntime,
  type AgentEvent,
  type DetectContext,
  type DetectedProvider,
  type LocalAgentProviderPlugin,
  type RawAgentEvent,
  type RawAgentStream,
  type SkillMaterializationRecord,
} from "@tutti-os/agent-acp-kit";
import {
  loadTuttiAgentSkillContext,
  type LoadTuttiAgentSkillContextInput,
} from "@tutti-os/agent-acp-kit/tutti";
import { localAgentModelIdForAcp, localAgentProviderIdsMatch, normalizeRuntimeProfileProviderId } from "@ai-app/shared/agent-providers";
import type { BaseAiEditRequest, BaseRun, LocalAgentTargetStatus, RuntimeProfile } from "@ai-app/shared/types";
import { safePathSegment } from "@ai-app/shared/local-paths";
import { createAgentRunTimingLogger, type AgentRunTimingLogger } from "@ai-app/agent/agent-run-timing";
import type { RuntimeEditContext, RuntimeProvider } from "@ai-app/agent/runtime";
import { createAgentRunObserver } from "./agent-run-observer.js";
import { toRuntimeStreamEvent } from "./event-projection.js";
import {
  prepareLocalAgentRun,
  type LocalAgentSkillContext,
  type LocalAgentSkillManifestResult,
  type PreparedLocalAgentRun,
} from "./prepare-run.js";

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
export type { LocalAgentSkillContext, LocalAgentSkillManifestResult } from "./prepare-run.js";
export { toRuntimeStreamEvent } from "./event-projection.js";

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
  runCwd(context: RuntimeEditContext<TRun, TProject, TRequest>): string;
  buildPrompt(context: RuntimeEditContext<TRun, TProject, TRequest>): string;
  buildSystemPrompt(
    context: RuntimeEditContext<TRun, TProject, TRequest>,
    runCwd: string,
    skillContext: LocalAgentSkillContext,
  ): string | Promise<string>;
  buildSkillManifest?: (
    context: RuntimeEditContext<TRun, TProject, TRequest>,
    runCwd: string,
  ) => LocalAgentSkillManifestResult | Promise<LocalAgentSkillManifestResult>;
  buildMcpServers?: (context: RuntimeEditContext<TRun, TProject, TRequest>) => LocalAgentMcpServer[];
  buildEnv?: (context: RuntimeEditContext<TRun, TProject, TRequest>, runCwd: string) => Record<string, string> | Promise<Record<string, string>>;
  useProviderResume?: (context: RuntimeEditContext<TRun, TProject, TRequest>) => boolean;
  timeoutMs?: () => number;
  sessionDirName?: string;
  extraAllowedDirs?: (context: RuntimeEditContext<TRun, TProject, TRequest>, runCwd: string) => string[];
  commandEnvNames?: string[];
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
  private readonly options: LocalAgentRuntimeProviderOptions<TRun, TProject, TRequest>;

  constructor(options: LocalAgentRuntimeProviderOptions<TRun, TProject, TRequest>) {
    this.options = options;
  }

  canHandle(profile: RuntimeProfile) {
    return profile.kind === "local-agent";
  }

  describeRun(profile: RuntimeProfile) {
    return { runtime: profile.kind, agentTargetId: profile.agentTargetId, provider: profile.provider, model: profile.model };
  }

  async resolveExecutionProfile(profile: RuntimeProfile, context?: RuntimeEditContext<TRun, TProject, TRequest>) {
    if (!profile.agentTargetId) throw new Error("local-agent profile does not contain an exact Agent Target id");
    const runCwd = context ? this.options.runCwd(context) : undefined;
    const env = context && runCwd ? await this.options.buildEnv?.(context, runCwd) : undefined;
    const detectContext = context && runCwd
      ? projectDetectContext(context.agentDetectContext, runCwd, env)
      : undefined;
    const target = (await this.loadAgentTargets(detectContext))
      .find((candidate) => candidate.agentTargetId === profile.agentTargetId);
    if (!target?.supported) throw new Error(target?.reason ?? `Agent Target is not available: ${profile.agentTargetId}`);
    return reconcileAgentTargetExecutionProfile(profile, target);
  }

  async detect(profile: RuntimeProfile, context?: RuntimeEditContext<TRun, TProject, TRequest>) {
    if (!profile.agentTargetId) return { available: false, reason: "local-agent profile does not contain an exact Agent Target id" };
    const runCwd = context ? this.options.runCwd(context) : undefined;
    const env = context && runCwd ? await this.options.buildEnv?.(context, runCwd) : undefined;
    const detectionContext = context && runCwd
      ? projectDetectContext(context.agentDetectContext, runCwd, env)
      : undefined;
    const target = (await this.loadAgentTargets(detectionContext))
      .find((item) => item.agentTargetId === profile.agentTargetId);
    if (!target?.supported) {
      return {
        available: false,
        reason: target?.reason ?? `Agent Target is not available: ${profile.agentTargetId}`,
      };
    }
    if (normalizeRuntimeProfileProviderId(profile.provider) !== normalizeRuntimeProfileProviderId(target.providerId)) {
      return { available: false, reason: `Agent Target provider metadata changed: ${profile.agentTargetId}` };
    }
    return { available: true };
  }

  async listLocalAgentTargets(refresh = false): Promise<LocalAgentTargetStatus[]> {
    const env = this.tuttiCliDetectionEnv();
    const detectionContext: DetectContext | undefined = refresh || env
      ? { ...(env ? { env } : {}), ...(refresh ? { refresh: true } : {}) }
      : undefined;
    return this.loadAgentTargets(detectionContext);
  }

  async *streamEdit(context: RuntimeEditContext<TRun, TProject, TRequest>) {
    const agentTargetId = context.runtimeProfile.agentTargetId;
    if (!agentTargetId) throw new Error("local-agent runtime profile is missing agentTargetId");
    const runCwd = this.options.runCwd(context);
    const controller = new AbortController();
    this.controllers.set(context.run.id, controller);
    const provider = this.resolveProviderId(context.runtimeProfile.provider) ?? context.runtimeProfile.provider;
    const timing = createAgentRunTimingLogger({
      runId: context.run.id,
      provider,
      agentTargetId,
      scope: "agent.runtime",
    });
    timing.emit("agent_prepare_started");
    let runOutcome: "completed" | "failed" | "canceled" = "failed";

    try {
      const sessionStore = new LocalAgentSessionStore(runCwd, this.options.sessionDirName ?? ".ai-app");
      const conversationSessionId = context.conversation?.sessionId ?? context.project.id;
      const providerResumeEnabled = this.options.useProviderResume?.(context) ?? true;
      const [previousSession, prepared] = await Promise.all([
        providerResumeEnabled
          ? timing.measure("prepare", "provider_session", () => sessionStore.read(conversationSessionId))
          : Promise.resolve(null),
        prepareLocalAgentRun({
          context,
          runCwd,
          timing,
          buildSkillManifest: this.options.buildSkillManifest,
          buildEnv: this.options.buildEnv,
          buildSystemPrompt: this.options.buildSystemPrompt,
        }),
      ]);
      timing.emit("agent_prepare_done", {
        phase: "prepare",
        skill_count: prepared.skillContext.skills.length,
        resume_available: previousSession != null,
      });
      const sameTarget = previousSession?.agentTargetId === agentTargetId && previousSession.provider === provider;
      const providerSessionId = sameTarget ? previousSession?.providerSessionId : undefined;
      const resumeToken = sameTarget ? previousSession?.resumeToken : undefined;
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
          agentTargetId,
          persistProviderSession: providerResumeEnabled,
          resume,
          sessionStore,
          runCwd,
          prepared,
          timing,
        })) {
          emittedEvent = true;
          yield runtimeEvent;
        }
        runOutcome = "completed";
      } catch (error) {
        if (previousSession && !emittedEvent && isProviderResumeFailure(error)) {
          await sessionStore.remove(conversationSessionId);
          for await (const runtimeEvent of this.runWithResume({
            context,
            controller,
            provider,
            agentTargetId,
            persistProviderSession: providerResumeEnabled,
            resume: { mode: "fresh" },
            sessionStore,
            runCwd,
            prepared,
            timing,
          })) {
            yield runtimeEvent;
          }
          runOutcome = "completed";
          return;
        }
        throw error;
      }
    } catch (error) {
      runOutcome = controller.signal.aborted ? "canceled" : "failed";
      throw error;
    } finally {
      this.controllers.delete(context.run.id);
      timing.emit("agent_run_done", {
        phase: "cleanup",
        outcome: runOutcome,
      });
    }
  }

  private async *runWithResume(input: {
    context: RuntimeEditContext<TRun, TProject, TRequest>;
    controller: AbortController;
    persistProviderSession: boolean;
    agentTargetId: string;
    provider: string;
    resume: { mode: "provider"; providerSessionId?: string; resumeToken?: string } | { mode: "fresh" };
    sessionStore: LocalAgentSessionStore;
    runCwd: string;
    prepared: PreparedLocalAgentRun;
    timing: AgentRunTimingLogger;
  }) {
    const {
      context,
      controller,
      persistProviderSession,
      agentTargetId,
      provider,
      resume,
      sessionStore,
      runCwd,
      prepared,
      timing,
    } = input;
    let lastError: Extract<AgentEvent, { type: "error" }> | undefined;
    const conversationId = context.conversation?.conversationId ?? context.project.id;
    const sessionId = context.conversation?.sessionId ?? context.project.id;
    const model = isPlaceholderProfileModel(context.runtimeProfile.model, context.runtimeProfile.provider)
      ? undefined
      : localAgentModelIdForAcp(context.runtimeProfile.model, provider);
    const tuttiCliEnv = this.tuttiCliDetectionEnv();
    const observer = createAgentRunObserver({
      timing,
      model: model ?? "default",
      resumeMode: resume.mode,
      isAborted: () => controller.signal.aborted,
    });
    try {
      for await (const event of this.localAgentRuntime.run({
        agentTargetId,
        runId: context.run.id,
        conversationId,
        sessionId,
        provider,
        runtimeKind: "local-agent",
        runtimeProvider: provider,
        cwd: runCwd,
        prompt: this.options.buildPrompt(context),
        systemPrompt: prepared.systemPrompt,
        history: context.history ?? [],
        model,
        reasoning: context.request.reasoningEffort ?? undefined,
        mcpServers: this.options.buildMcpServers?.(context) ?? [],
        skillManifest: prepared.skillContext.skills,
        env: { ...prepared.appEnv, ...(tuttiCliEnv ?? {}) },
        timeoutMs: this.options.timeoutMs?.() ?? DEFAULT_TIMEOUT_MS,
        extraAllowedDirs: this.options.extraAllowedDirs?.(context, runCwd) ?? [runCwd],
        resume,
        signal: controller.signal,
        metadata: { timingDiagnostics: true },
      } as any)) {
        const agentEvent = event as AgentEvent;
        if (observer.observe(agentEvent)) continue;
        if (agentEvent.type === "error") lastError = agentEvent;
        const runtimeEvent = toRuntimeStreamEvent(agentEvent);
        if (runtimeEvent) {
          yield runtimeEvent;
        } else if (agentEvent.type === "error") {
          throw new Error(agentEvent.message);
        } else if (agentEvent.type === "done") {
          const done = agentEvent;
          if (persistProviderSession && (done.sessionId || done.resumeToken)) {
            await timing.measure("cleanup", "provider_session_persist", () => sessionStore.write(sessionId, {
              agentTargetId,
              provider,
              providerSessionId: done.sessionId,
              resumeToken: done.resumeToken,
            }));
          }
          const terminalStatus = done.status
            ?? (done.reason === "cancelled" ? "canceled" : done.reason === "error" ? "failed" : "completed");
          if (terminalStatus === "failed") {
            throw new Error(
              lastError?.message
                ?? `local-agent ${provider} failed${typeof done.exitCode === "number" ? ` with exit code ${done.exitCode}` : ""}`,
            );
          }
          if (terminalStatus === "canceled") throw new Error(`local-agent ${provider} was canceled`);
        }
      }
    } catch (error) {
      observer.fail(error);
      throw error;
    } finally {
      observer.close();
    }
  }

  private resolveProviderId(provider: string) {
    return resolveRegisteredProviderId(provider, this.localAgentRuntime.listProviders().map((item: any) => String(item.id)));
  }

  private tuttiCliDetectionEnv() {
    if (process.env.TUTTI_CLI?.trim()) return undefined;
    const configured = this.options.commandEnvNames
      ?.map((name) => process.env[name]?.trim())
      .find(Boolean);
    return configured ? { TUTTI_CLI: configured } : undefined;
  }

  private async loadAgentTargets(detectContext?: DetectContext): Promise<LocalAgentTargetStatus[]> {
    const detections = await this.localAgentRuntime.detect(detectContext);
    return projectDetectedAgentTargets(detections);
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

export function projectDetectedAgentTargets(
  detections: DetectedProvider[],
): LocalAgentTargetStatus[] {
  const projected = detections.flatMap((detection) => detection.agentTargetId ? [{
    agentTargetId: detection.agentTargetId,
    providerId: String(detection.provider),
    provider: String(detection.provider),
    displayName: detection.displayName,
    supported: detection.supported,
    authState: detection.authState,
    models: detection.models.map((model) => ({ id: model.id, label: model.label })),
    ...(detection.defaultModelId ? { defaultModelId: detection.defaultModelId } : {}),
    ...(detection.isDefault ? { isDefault: true as const } : {}),
    ...(detection.reason ? { reason: detection.reason } : {}),
  }] : []);
  if (projected.some((target) => target.isDefault)) return projected;
  const fallbackDefault = projected.find((target) => target.supported) ?? projected[0];
  return projected.map((target) => target === fallbackDefault ? { ...target, isDefault: true as const } : target);
}

export function reconcileAgentTargetExecutionProfile(
  profile: RuntimeProfile,
  target: Pick<LocalAgentTargetStatus, "agentTargetId" | "providerId">,
): RuntimeProfile {
  if (!profile.agentTargetId || profile.agentTargetId !== target.agentTargetId) {
    throw new Error(`Agent Target mismatch: ${profile.agentTargetId ?? "missing"}`);
  }
  const providerChanged = normalizeRuntimeProfileProviderId(profile.provider) !== normalizeRuntimeProfileProviderId(target.providerId);
  return {
    ...profile,
    provider: target.providerId,
    ...(providerChanged ? { model: `${target.providerId}:default` } : {}),
  };
}

export function resolveRegisteredProviderId(provider: string, registeredProviderIds: string[]) {
  const exact = registeredProviderIds.find((candidate) => candidate === provider);
  if (exact) return exact;
  const canonicalMatches = registeredProviderIds.filter(
    (candidate) => normalizeRuntimeProfileProviderId(candidate) === normalizeRuntimeProfileProviderId(provider),
  );
  if (canonicalMatches.length === 1) return canonicalMatches[0];
  if (canonicalMatches.length > 1) throw new Error(`Provider adapter is ambiguous: ${provider}`);
  const legacyMatches = registeredProviderIds.filter((candidate) => localAgentProviderIdsMatch(candidate, provider));
  if (legacyMatches.length === 1) return legacyMatches[0];
  if (legacyMatches.length > 1) throw new Error(`Provider adapter is ambiguous: ${provider}`);
  return undefined;
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

export function stripProviderPrefix(model: string, provider: string) {
  const prefix = `${provider}:`;
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
}

function projectDetectContext(
  provided: DetectContext | undefined,
  runCwd: string,
  appEnv: Record<string, string> | undefined,
): DetectContext {
  const env = provided?.env || appEnv
    ? { ...(provided?.env ?? {}), ...(appEnv ?? {}) }
    : undefined;
  return {
    ...(provided ?? {}),
    cwd: runCwd,
    ...(env ? { env } : {}),
  };
}

interface StoredLocalAgentSession {
  agentTargetId: string;
  provider: string;
  providerSessionId?: string;
  resumeToken?: string;
  updatedAt: string;
}

class LocalAgentSessionStore {
  private readonly runCwd: string;
  private readonly sessionDirName: string;

  constructor(runCwd: string, sessionDirName: string) {
    this.runCwd = runCwd;
    this.sessionDirName = sessionDirName;
  }

  async read(projectId: string): Promise<StoredLocalAgentSession | null> {
    try {
      const parsed = JSON.parse(await readFile(this.pathFor(projectId), "utf8")) as StoredLocalAgentSession;
      return typeof parsed.agentTargetId === "string" && parsed.agentTargetId && typeof parsed.provider === "string" && parsed.provider ? parsed : null;
    } catch {
      return null;
    }
  }

  async write(projectId: string, session: Omit<StoredLocalAgentSession, "updatedAt">) {
    const filePath = this.pathFor(projectId);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify({ ...session, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  }

  async remove(projectId: string) {
    try {
      await unlink(this.pathFor(projectId));
    } catch {
      // Missing session is equivalent to a fresh run.
    }
  }

  private pathFor(projectId: string) {
    return join(this.runCwd, this.sessionDirName, "local-agent-sessions", `${safePathSegment(projectId)}.json`);
  }
}

export function isPlaceholderProfileModel(model: string, provider: string) {
  return !model.trim() || model === `${provider}:default` || model === "default";
}
