import type { BaseAiEditRequest, BaseRun, LocalAgentTargetStatus, RuntimeProfile } from "@ai-app/shared/types";
import type { DetectContext, ManagedAgentInvocation } from "@tutti-os/agent-acp-kit";

export type RuntimeConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export interface RuntimeEditContext<
  TRun extends BaseRun = BaseRun,
  TProject extends { id: string } = { id: string },
  TRequest extends BaseAiEditRequest = BaseAiEditRequest,
> {
  run: TRun;
  project: TProject;
  runtimeProfile: RuntimeProfile;
  request: TRequest;
  conversation?: {
    conversationId: string;
    sessionId: string;
  };
  history?: RuntimeConversationMessage[];
  toolAccess?: {
    token: string;
    expiresAt: string;
  };
  managedAgent?: {
    cwd: string;
    managedAgentInvocation: ManagedAgentInvocation;
  };
  agentDetectContext?: DetectContext;
}

export type RuntimeStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input?: unknown }
  | { type: "tool_result"; id: string; name?: string; status?: "completed" | "failed"; output?: unknown; summary?: string; error?: string; isError?: boolean }
  | { type: "status"; message?: string; status?: string }
  | { type: "file_write"; path: string }
  | { type: "stderr"; text: string };

export interface RuntimeProvider<
  TRun extends BaseRun = BaseRun,
  TProject extends { id: string } = { id: string },
  TRequest extends BaseAiEditRequest = BaseAiEditRequest,
> {
  id: string;
  canHandle(profile: RuntimeProfile): boolean;
  resolveExecutionProfile?(profile: RuntimeProfile, detectContext?: DetectContext): Promise<RuntimeProfile>;
  describeRun(profile: RuntimeProfile): { runtime: string; agentTargetId: string | null; provider: string; model: string };
  detect(profile: RuntimeProfile, context?: RuntimeEditContext<TRun, TProject, TRequest>): Promise<{ available: boolean; reason?: string }>;
  listLocalAgentTargets?(headers?: Record<string, string | string[] | undefined>, refresh?: boolean): Promise<LocalAgentTargetStatus[]>;
  streamEdit(context: RuntimeEditContext<TRun, TProject, TRequest>): AsyncIterable<string | RuntimeStreamEvent>;
  cancel(runId: string): Promise<{ cancelled: boolean; reason?: string }>;
}

export class RuntimeProviderRegistry<
  TRun extends BaseRun = BaseRun,
  TProject extends { id: string } = { id: string },
  TRequest extends BaseAiEditRequest = BaseAiEditRequest,
> {
  private readonly providers: Array<RuntimeProvider<TRun, TProject, TRequest>>;

  constructor(providers: Array<RuntimeProvider<TRun, TProject, TRequest>>) {
    this.providers = providers;
  }

  getProvider(profile: RuntimeProfile) {
    return this.providers.find((provider) => provider.canHandle(profile)) ?? this.providers[0]!;
  }

  async resolveExecutionProfile(profile: RuntimeProfile, detectContext?: DetectContext) {
    const provider = this.getProvider(profile);
    return provider.resolveExecutionProfile?.(profile, detectContext) ?? profile;
  }

  async listLocalAgentTargets(headers?: Record<string, string | string[] | undefined>, refresh = false): Promise<LocalAgentTargetStatus[]> {
    const provider = this.providers.find((item) => typeof item.listLocalAgentTargets === "function");
    return provider?.listLocalAgentTargets?.(headers, refresh) ?? [];
  }
}

export class RuntimeProviderUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeProviderUnsupportedError";
  }
}
