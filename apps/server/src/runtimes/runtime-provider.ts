import type { AiEditRequest, DocumentProject, DocumentRun, LocalAgentProviderStatus, RuntimeProfile } from "@ai-document/shared";

export interface RuntimeEditContext {
  run: DocumentRun;
  project: DocumentProject;
  runtimeProfile: RuntimeProfile;
  request: AiEditRequest;
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

export interface RuntimeProvider {
  id: string;
  canHandle(profile: RuntimeProfile): boolean;
  describeRun(profile: RuntimeProfile): { runtime: string; provider: string; model: string };
  detect(profile: RuntimeProfile): Promise<{ available: boolean; reason?: string }>;
  listLocalAgentProviders?(): Promise<LocalAgentProviderStatus[]>;
  streamEdit(context: RuntimeEditContext): AsyncIterable<string | RuntimeStreamEvent>;
  cancel(runId: string): Promise<{ cancelled: boolean; reason?: string }>;
}

export class RuntimeProviderUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeProviderUnsupportedError";
  }
}
