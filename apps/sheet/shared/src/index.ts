import type {
  AiEditMode,
  Id,
  LocalAgentProviderStatus,
  ReasoningEffort,
  RuntimeProfile,
  RunEventType,
  RunStatus,
  StreamEvent as BaseStreamEvent,
  TuttiAppOpenResult,
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
  TuttiAppOpenResult,
  WsClientMessage,
} from "@ai-app/shared/types";

export type SheetArtifactType = "xlsx";
export type SheetProjectUpdatedBy = "human" | "ai" | "system";
export type SheetRunStatus = RunStatus;
export type SheetRunEventType = RunEventType;
export type SheetSelectionType = "sheet" | "cell" | "range" | "write";

export interface SheetProject {
  id: Id;
  title: string;
  activeArtifactId: Id;
  templateId: string | null;
  templateName: string | null;
  updatedBy: SheetProjectUpdatedBy;
  createdAt: string;
  updatedAt: string;
}

export interface SheetArtifact {
  id: Id;
  projectId: Id;
  type: SheetArtifactType;
  fileRef: string;
  mimeType: string;
  revision: number;
  updatedBy: SheetProjectUpdatedBy;
  createdAt: string;
  updatedAt: string;
}

export interface SheetArtifactSelection extends ArtifactSelectionBase<SheetSelectionType> {
  sheetId?: string | null;
  sheetName?: string | null;
  address?: string | null;
}

export interface AgentArtifactContext extends AgentArtifactContextBase<SheetArtifactType, SheetArtifactSelection> {
  projectId: Id;
  artifactId: Id;
  type: SheetArtifactType;
  fileRef: string;
  selection: SheetArtifactSelection | null;
  revision: number;
}

export interface XlsxManifest {
  kind: "xlsx";
  fileName: "workbook.xlsx";
  exists: boolean;
  sha256: string | null;
  sizeBytes: number;
  updatedAt: string | null;
}

export function createEmptyXlsxManifest(): XlsxManifest {
  return {
    kind: "xlsx",
    fileName: "workbook.xlsx",
    exists: false,
    sha256: null,
    sizeBytes: 0,
    updatedAt: null,
  };
}

export function parseXlsxManifest(content: string): XlsxManifest {
  try {
    const parsed = JSON.parse(content) as Partial<XlsxManifest>;
    if (parsed.kind === "xlsx" && parsed.fileName === "workbook.xlsx") {
      return {
        kind: "xlsx",
        fileName: "workbook.xlsx",
        exists: parsed.exists === true,
        sha256: typeof parsed.sha256 === "string" ? parsed.sha256 : null,
        sizeBytes: typeof parsed.sizeBytes === "number" && Number.isFinite(parsed.sizeBytes) ? parsed.sizeBytes : 0,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      };
    }
  } catch {
    // Fall through to an empty manifest.
  }
  return createEmptyXlsxManifest();
}

export function serializeXlsxManifest(manifest: XlsxManifest): string {
  return JSON.stringify(manifest);
}

export interface SheetRun {
  id: Id;
  projectId: Id;
  runtime: string;
  provider: string;
  model: string;
  status: SheetRunStatus;
  mode: AiEditMode;
  instruction: string;
  selectionType: SheetSelectionType;
  selectionPath: string;
  selectedText: string;
  selectedHtml: string;
  resultPreview: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface SheetRunEvent {
  id: Id;
  runId: Id;
  projectId: Id;
  type: SheetRunEventType;
  content: string;
  status: "pending" | "streaming" | "success" | "error";
  metadata: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: string;
}

export interface SheetRunTimelineItem {
  run: SheetRun;
  events: SheetRunEvent[];
}

export interface SheetProjectRecord {
  project: SheetProject;
  artifact: SheetArtifact;
}

export interface SheetProjectDetail extends SheetProjectRecord {
  xlsxManifest: XlsxManifest | null;
}

export interface AppSnapshot {
  projects: SheetProject[];
  artifacts: SheetArtifact[];
  runtimeProfiles: RuntimeProfile[];
  activeRuns: SheetRun[];
  runEvents: SheetRunEvent[];
  lastSeq: number;
}

export interface CreateProjectRequest {
  title?: string;
}

export interface OpenSheetCliRequest {
  path: string;
  title?: string;
}

export interface SheetWorkspaceContext {
  workspaceRoot: string;
  focusedPath: string;
  focusedPathKind: "file";
  focusedFilePath: string;
  agentInstructionsPath: string;
}

export interface OpenSheetCliResponse {
  ok: true;
  action: "imported";
  sourcePath: string;
  project: SheetProject;
  artifact: SheetArtifact;
  route: string;
  url: string;
  workspace: SheetWorkspaceContext;
  tuttiAppOpen: TuttiAppOpenResult;
}

export interface UpdateProjectRequest {
  title?: string;
  activeArtifactId?: string;
  updatedBy?: SheetProjectUpdatedBy;
}

export interface ImportXlsxProjectRequest {
  title?: string;
}

export interface SheetSetCellValueCommand {
  address: string;
  input: string;
  sheetId: string;
  sheetName?: string;
  type: "set-cell-value";
}

export type SheetCommand = SheetSetCellValueCommand;

export interface ApplySheetCommandsRequest {
  baseRevision: number;
  baseSha256: string | null;
  commands: SheetCommand[];
}

export interface ApplySheetCommandsResponse extends SheetProjectDetail {
  applied: number;
}

export interface ProjectResponse extends SheetProjectRecord {}
export interface ProjectDetailResponse extends SheetProjectDetail {}

export interface ProjectsResponse {
  projects: SheetProject[];
}

export interface TemplatesResponse {
  templates: [];
}

export interface ProjectRunsResponse {
  runs: SheetRunTimelineItem[];
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

export interface AiEditRequest {
  userPrompt: string;
  mode: AiEditMode;
  runtimeProfileId?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  selectionType?: SheetSelectionType;
  selectionPath?: string;
  selectedText?: string;
  selectedHtml?: string;
}

export interface AiEditResponse {
  run: SheetRun;
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

export const xlsxMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const xlsxArtifactFileRef = "workbook.xlsx";
