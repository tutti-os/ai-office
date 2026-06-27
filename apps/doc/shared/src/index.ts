import type {
  AiEditMode,
  Id,
  LocalAgentProviderStatus,
  ReasoningEffort,
  RunEventType,
  RunStatus,
  RuntimeProfile,
  StreamEvent as BaseStreamEvent,
  TuttiAppOpenTarget,
  WsServerMessage as BaseWsServerMessage,
} from "@ai-app/shared/types";
import type { AgentArtifactContextBase, ArtifactSelectionBase } from "@ai-app/shared/artifact-runtime";

export type {
  AiEditMode,
  Id,
  LocalAgentProviderModel,
  LocalAgentProviderStatus,
  ReasoningEffort,
  RunEventType,
  RunStatus,
  RuntimeKind,
  RuntimeProfile,
  TuttiAppOpenTarget,
  WsClientMessage,
} from "@ai-app/shared/types";

export type DocumentType = "html" | "markdown" | "docx";
export type ArtifactType = DocumentType;
export type SelectionType = "text" | "element" | "write";

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

export interface ArtifactSelection extends ArtifactSelectionBase<SelectionType | "block"> {}

export interface AgentArtifactContext extends AgentArtifactContextBase<ArtifactType, ArtifactSelection> {
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

export interface DocumentLibraryTemplate {
  id: Id;
  name: string;
  classification: string;
  content: string;
  screenshot_cdn_url?: string;
  screenshot_width?: number;
  screenshot_height?: number;
}

export interface TemplatesResponse {
  templates: DocumentLibraryTemplate[];
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

export interface OpenDocumentCliRequest {
  path: string;
  title?: string;
}

export interface DocumentWorkspaceContext {
  workspaceRoot: string;
  focusedPath: string;
  focusedPathKind: "file";
  focusedFilePath: string;
  agentInstructionsPath: string;
}

export interface OpenDocumentCliResponse {
  ok: true;
  action: "imported";
  sourcePath: string;
  project: DocumentProject;
  openTarget: TuttiAppOpenTarget;
  workspace: DocumentWorkspaceContext;
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
  sessionId?: string | null;
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

export interface ProjectAssetUploadResponse {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface LocalAgentProviderStatusResponse {
  providers: LocalAgentProviderStatus[];
}

export type OfficeCliSource = "env" | "bundled" | "tutti" | "missing";

export interface OfficeCliStatus {
  available: boolean;
  version?: string;
  executablePath?: string;
  source: OfficeCliSource;
  canInstall: boolean;
  installing: boolean;
  reason?: string;
}

export interface OfficeCliStatusResponse {
  officecli: OfficeCliStatus;
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

export type StreamEvent = BaseStreamEvent<StreamEventType>;
export type WsServerMessage = BaseWsServerMessage<StreamEventType>;

export const defaultHtmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Doc</title>
  <style>
    :root {
      color: #1f2933;
      font-family: Lexend, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
