import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createDefaultLocalAgentProviderPlugins,
  createLocalAgentRuntime,
  type AgentEvent,
} from "@nextop-os/agent-acp-kit";
import type { BaseAiEditRequest, BaseRun, LocalAgentProviderStatus, RuntimeProfile } from "@ai-app/shared/types";
import { safePathSegment } from "@ai-app/shared/local-paths";
import type { RuntimeEditContext, RuntimeProvider, RuntimeStreamEvent } from "@ai-app/agent/runtime";

const DEFAULT_TIMEOUT_MS = 180_000;

export type LocalAgentMcpServer = {
  name: string;
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export interface LocalAgentRuntimeProviderOptions<
  TRun extends BaseRun = BaseRun,
  TProject extends { id: string } = { id: string },
  TRequest extends BaseAiEditRequest = BaseAiEditRequest,
> {
  workspaceRoot(context: RuntimeEditContext<TRun, TProject, TRequest>): string;
  buildPrompt(context: RuntimeEditContext<TRun, TProject, TRequest>): string;
  buildSystemPrompt(context: RuntimeEditContext<TRun, TProject, TRequest>): string;
  buildMcpServers?: (context: RuntimeEditContext<TRun, TProject, TRequest>) => LocalAgentMcpServer[];
  buildEnv?: (context: RuntimeEditContext<TRun, TProject, TRequest>, workspaceRoot: string) => Record<string, string>;
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
  private readonly localAgentRuntime = createLocalAgentRuntime({
    providers: createDefaultLocalAgentProviderPlugins(),
  });
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

  async detect(profile: RuntimeProfile) {
    const registered = this.localAgentRuntime.listProviders().some((item: any) => item.id === profile.provider);
    if (!registered) {
      return { available: false, reason: `local-agent provider is not registered: ${profile.provider}` };
    }
    const detection = (await this.localAgentRuntime.detect()).find((item: any) => item.provider === profile.provider);
    if (!detection) return { available: true };
    if (detection.result?.supported === false) {
      return {
        available: false,
        reason: detection.result.unsupportedReason ?? `${profile.provider} is not supported on this machine.`,
      };
    }
    if (detection.result === null) {
      return { available: false, reason: `${profile.provider} is not installed or not discoverable.` };
    }
    return { available: true };
  }

  async listLocalAgentProviders(): Promise<LocalAgentProviderStatus[]> {
    const detections = await this.localAgentRuntime.detect();
    return detections.map((item: any) => {
      const available = Boolean(item.result && item.result.supported !== false);
      return {
        provider: item.provider,
        displayName: item.displayName,
        available,
        authState: item.result?.authState ?? "unknown",
        executablePath: item.result?.executablePath ?? "",
        version: item.result?.version ?? "not-installed",
        configDir: item.result?.configDir,
        models: (item.result?.models ?? []).map((model: any) => ({ id: model.id, label: model.label })),
        reason: available ? undefined : localAgentUnavailableReason(item.displayName, item.result),
      };
    });
  }

  async *streamEdit(context: RuntimeEditContext<TRun, TProject, TRequest>) {
    const provider = context.runtimeProfile.provider;
    const workspaceRoot = this.options.workspaceRoot(context);
    const controller = new AbortController();
    this.controllers.set(context.run.id, controller);

    try {
      const sessionStore = new LocalAgentSessionStore(workspaceRoot, this.options.sessionDirName ?? ".ai-app");
      const previousSession = sessionStore.read(context.project.id);
      const resume =
        previousSession?.provider === provider && (previousSession.providerSessionId || previousSession.resumeToken)
          ? {
              mode: "provider" as const,
              ...(previousSession.providerSessionId ? { providerSessionId: previousSession.providerSessionId } : {}),
              ...(previousSession.resumeToken ? { resumeToken: previousSession.resumeToken } : {}),
            }
          : { mode: "fresh" as const };

      for await (const event of this.localAgentRuntime.run({
        runId: context.run.id,
        conversationId: context.project.id,
        sessionId: context.project.id,
        provider,
        runtimeKind: "local-agent",
        runtimeProvider: provider,
        cwd: workspaceRoot,
        prompt: this.options.buildPrompt(context),
        systemPrompt: this.options.buildSystemPrompt(context),
        history: [],
        model: stripProviderPrefix(context.runtimeProfile.model, provider),
        reasoning: context.request.reasoningEffort ?? undefined,
        mcpServers: this.options.buildMcpServers?.(context) ?? [],
        env: this.options.buildEnv?.(context, workspaceRoot) ?? {},
        timeoutMs: this.options.timeoutMs?.() ?? DEFAULT_TIMEOUT_MS,
        extraAllowedDirs: this.options.extraAllowedDirs?.(context, workspaceRoot) ?? [workspaceRoot],
        resume,
        signal: controller.signal,
      } as any)) {
        const runtimeEvent = toRuntimeStreamEvent(event as AgentEvent);
        if (runtimeEvent) {
          yield runtimeEvent;
        } else if ((event as any).type === "error") {
          throw new Error((event as any).message);
        } else if ((event as any).type === "done") {
          const done = event as any;
          if (done.sessionId || done.resumeToken) {
            sessionStore.write(context.project.id, {
              provider,
              providerSessionId: done.sessionId,
              resumeToken: done.resumeToken,
            });
          }
          if (done.status === "failed") {
            throw new Error(`local-agent ${provider} failed${typeof done.exitCode === "number" ? ` with exit code ${done.exitCode}` : ""}`);
          }
        }
      }
    } finally {
      this.controllers.delete(context.run.id);
    }
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

export function toRuntimeStreamEvent(event: AgentEvent): RuntimeStreamEvent | null {
  const item = event as any;
  if (item.type === "text_delta") return { type: "text_delta", text: item.text };
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

function localAgentUnavailableReason(displayName: string, result: any) {
  if (!result) return `${displayName} is not installed or not discoverable.`;
  if (result.supported === false) return result.unsupportedReason ?? `${displayName} is not supported on this machine.`;
  if (result.authState === "missing") return `${displayName} is installed but authentication is missing.`;
  if (result.authState === "expired") return `${displayName} authentication has expired.`;
  return `${displayName} is not available.`;
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
