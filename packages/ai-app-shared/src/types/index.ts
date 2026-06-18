export type Id = string;

export type ProjectUpdatedBy = "human" | "ai" | "system";
export type RunStatus = "accepted" | "running" | "completed" | "failed" | "cancelled";
export type RunEventType = "status" | "text_delta" | "thinking_delta" | "tool_call" | "tool_result" | "file_write" | "stderr" | "error";
export type AiEditMode = "rewrite" | "write";
export type RuntimeKind = "server-demo" | "local-agent";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface RuntimeProfile {
  id: Id;
  kind: RuntimeKind;
  provider: string;
  model: string;
  displayName: string;
  enabled: boolean;
  capabilities: {
    streaming: boolean;
    toolUse: boolean;
    reasoning: boolean;
    resume: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface LocalAgentProviderModel {
  id: string;
  label: string;
}

export interface LocalAgentProviderStatus {
  provider: string;
  displayName: string;
  available: boolean;
  authState: "ok" | "missing" | "expired" | "unknown";
  executablePath: string;
  version: string;
  configDir?: string;
  models: LocalAgentProviderModel[];
  reason?: string;
}

export interface BaseRun {
  id: Id;
  projectId: Id;
  runtime: string;
  provider: string;
  model: string;
  status: RunStatus;
  mode: AiEditMode;
  instruction: string;
  selectionType: string;
  selectionPath: string;
  selectedText: string;
  selectedHtml: string;
  resultPreview: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface BaseRunEvent {
  id: Id;
  runId: Id;
  projectId: Id;
  type: RunEventType;
  content: string;
  status: "pending" | "streaming" | "success" | "error";
  metadata: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: string;
}

export interface BaseRunTimelineItem<TRun extends BaseRun = BaseRun, TEvent extends BaseRunEvent = BaseRunEvent> {
  run: TRun;
  events: TEvent[];
}

export interface BaseAiEditRequest {
  userPrompt: string;
  mode: AiEditMode;
  runtimeProfileId?: string | null;
  reasoningEffort?: ReasoningEffort | null;
}

export interface StreamEvent<TType extends string = string> {
  id: Id;
  seq: number;
  type: TType;
  projectId: string | null;
  runId: string | null;
  payload: unknown;
  createdAt: string;
}

export type WsServerMessage<TType extends string = string> =
  | { type: "hello"; lastSeq: number }
  | { type: "event"; event: StreamEvent<TType> }
  | { type: "replay"; events: Array<StreamEvent<TType>>; lastSeq: number };

export type WsClientMessage = {
  type: "hello";
  lastSeq: number;
};
