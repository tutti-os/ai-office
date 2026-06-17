export type Id = string;

export type DocumentType = "html" | "markdown" | "docx";
export type ArtifactType = DocumentType;
export type RunStatus = "accepted" | "running" | "completed" | "failed" | "cancelled";
export type RunEventType = "status" | "thinking_delta" | "tool_call" | "tool_result" | "file_write" | "stderr" | "error";
export type AiEditMode = "rewrite" | "write";
export type SelectionType = "text" | "element" | "write";
export type RuntimeKind = "server-demo" | "local-agent";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface DocumentProject {
  id: Id;
  title: string;
  type: DocumentType;
  content: string;
  templateId: string | null;
  templateName: string | null;
  updatedBy: "human" | "ai" | "system";
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactRecord {
  id: Id;
  projectId: Id;
  type: ArtifactType;
  content: string | null;
  fileRef: string | null;
  mimeType: string;
  revision: number;
  updatedBy: "human" | "ai" | "system";
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactSelection {
  type: "none" | SelectionType | "block" | "range";
  text: string;
  html: string;
  path: string;
  range?: unknown;
}

export interface AgentArtifactContext {
  projectId: Id;
  artifactId: Id;
  type: ArtifactType;
  content: string;
  selection: ArtifactSelection | null;
  revision: number;
}

export interface DocxDocumentManifest {
  kind: "docx";
  fileName: "document.docx";
  sha256: string | null;
  sizeBytes: number;
  updatedAt: string | null;
}

export function createEmptyDocxDocumentManifest(): DocxDocumentManifest {
  return {
    kind: "docx",
    fileName: "document.docx",
    sha256: null,
    sizeBytes: 0,
    updatedAt: null,
  };
}

export function parseDocxDocumentManifest(content: string): DocxDocumentManifest {
  try {
    const parsed = JSON.parse(content) as Partial<DocxDocumentManifest>;
    if (parsed.kind === "docx" && parsed.fileName === "document.docx") {
      return {
        kind: "docx",
        fileName: "document.docx",
        sha256: typeof parsed.sha256 === "string" ? parsed.sha256 : null,
        sizeBytes: typeof parsed.sizeBytes === "number" && Number.isFinite(parsed.sizeBytes) ? parsed.sizeBytes : 0,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      };
    }
  } catch {
    // Fall through to an empty manifest.
  }
  return createEmptyDocxDocumentManifest();
}

export function serializeDocxDocumentManifest(manifest: DocxDocumentManifest): string {
  return JSON.stringify(manifest);
}

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

export interface DocumentRun {
  id: Id;
  projectId: Id;
  runtime: string;
  provider: string;
  model: string;
  status: RunStatus;
  mode: AiEditMode;
  instruction: string;
  selectionType: SelectionType;
  selectionPath: string;
  selectedText: string;
  selectedHtml: string;
  resultPreview: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface DocumentRunEvent {
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

export interface DocumentTemplate {
  id: Id;
  name: string;
  category: string;
  description: string;
  previewTone: string;
  prompt: string;
}

export interface AppSnapshot {
  projects: DocumentProject[];
  runtimeProfiles: RuntimeProfile[];
  activeRuns: DocumentRun[];
  runEvents: DocumentRunEvent[];
  templates: DocumentTemplate[];
  lastSeq: number;
}

export interface CreateProjectRequest {
  title?: string;
  templateId?: string | null;
  templateName?: string | null;
  content?: string;
  type?: DocumentType;
}

export interface UpdateProjectRequest {
  title?: string;
  content?: string;
  type?: DocumentType;
  updatedBy?: "human" | "ai" | "system";
}

export interface ApplyTemplateRequest {
  templateId: string;
  userPrompt?: string;
  runtimeProfileId?: string | null;
}

export interface AiEditRequest {
  htmlContent: string;
  selectedText?: string;
  selectedHtml?: string;
  selectionType?: SelectionType;
  selectionPath?: string;
  userPrompt: string;
  mode: AiEditMode;
  runtimeProfileId?: string | null;
  reasoningEffort?: ReasoningEffort | null;
}

export interface AiEditResponse {
  run: DocumentRun;
}

export interface DocumentRunTimelineItem {
  run: DocumentRun;
  events: DocumentRunEvent[];
}

export interface ProjectRunsResponse {
  runs: DocumentRunTimelineItem[];
}

export interface LocalAgentProviderStatusResponse {
  providers: LocalAgentProviderStatus[];
}

export type StreamEventType =
  | "project.created"
  | "project.updated"
  | "run.accepted"
  | "run.started"
  | "run.event.created"
  | "run.completed"
  | "run.failed"
  | "run.cancelled";

export interface StreamEvent {
  id: Id;
  seq: number;
  type: StreamEventType;
  projectId: string | null;
  runId: string | null;
  payload: unknown;
  createdAt: string;
}

export type WsServerMessage =
  | { type: "hello"; lastSeq: number }
  | { type: "event"; event: StreamEvent }
  | { type: "replay"; events: StreamEvent[]; lastSeq: number };

export type WsClientMessage = {
  type: "hello";
  lastSeq: number;
};

export const defaultHtmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <style>
    :root {
      color: #1f2933;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #ffffff;
    }
    body {
      max-width: 820px;
      margin: 0 auto;
      padding: 56px 72px 96px;
      line-height: 1.62;
      font-size: 16px;
    }
    h1 {
      margin: 0 0 22px;
      font-size: 36px;
      line-height: 1.15;
      letter-spacing: 0;
    }
    h2 {
      margin: 32px 0 12px;
      font-size: 22px;
      line-height: 1.25;
      letter-spacing: 0;
    }
    p {
      margin: 0 0 14px;
    }
    ul, ol {
      margin: 0 0 16px 24px;
      padding: 0;
    }
    [data-ai-region] {
      position: relative;
    }
  </style>
</head>
<body contenteditable="true">
  <p><br></p>
</body>
</html>`;
