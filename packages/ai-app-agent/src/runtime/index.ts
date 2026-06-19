import type { BaseAiEditRequest, BaseRun, LocalAgentProviderStatus, RuntimeProfile } from "@ai-app/shared/types";

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
  describeRun(profile: RuntimeProfile): { runtime: string; provider: string; model: string };
  detect(profile: RuntimeProfile): Promise<{ available: boolean; reason?: string }>;
  listLocalAgentProviders?(): Promise<LocalAgentProviderStatus[]>;
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

  async listLocalAgentProviders(): Promise<LocalAgentProviderStatus[]> {
    const provider = this.providers.find((item) => typeof item.listLocalAgentProviders === "function");
    return provider?.listLocalAgentProviders?.() ?? [];
  }
}

export class RuntimeProviderUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeProviderUnsupportedError";
  }
}
