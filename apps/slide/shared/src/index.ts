import type { AiEditMode, Id, ReasoningEffort, RunEventType, RunStatus, RuntimeKind } from "@ai-app/shared/types";

export type { AiEditMode, Id, ReasoningEffort, RuntimeKind } from "@ai-app/shared/types";

export type SlideArtifactType = "deck" | "pptx";

export type SlideProjectUpdatedBy = "human" | "ai" | "system";
export type SlideRunStatus = RunStatus;
export type SlideRunEventType = RunEventType;
export type SlideSelectionType = "slide" | "element" | "text" | "write";

export interface SlideProject {
  id: Id;
  title: string;
  activeArtifactId: Id;
  templateId: string | null;
  templateName: string | null;
  updatedBy: SlideProjectUpdatedBy;
  createdAt: string;
  updatedAt: string;
}

export interface SlideArtifact {
  id: Id;
  projectId: Id;
  type: SlideArtifactType;
  fileRef: string;
  mimeType: string;
  revision: number;
  updatedBy: SlideProjectUpdatedBy;
  createdAt: string;
  updatedAt: string;
}

export interface SlideArtifactSelection {
  type: "none" | SlideSelectionType | "range";
  text: string;
  html: string;
  path: string;
  slideId?: string | null;
  range?: unknown;
}

export interface AgentArtifactContext {
  projectId: Id;
  artifactId: Id;
  type: SlideArtifactType;
  fileRef: string;
  selection: SlideArtifactSelection | null;
  revision: number;
}

export interface SlideRun {
  id: Id;
  projectId: Id;
  runtime: string;
  provider: string;
  model: string;
  status: SlideRunStatus;
  mode: AiEditMode;
  instruction: string;
  selectionType: SlideSelectionType;
  selectionPath: string;
  selectedText: string;
  selectedHtml: string;
  resultPreview: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface SlideRunEvent {
  id: Id;
  runId: Id;
  projectId: Id;
  type: SlideRunEventType;
  content: string;
  status: "pending" | "streaming" | "success" | "error";
  metadata: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: string;
}

export interface SlideRunTimelineItem {
  run: SlideRun;
  events: SlideRunEvent[];
}

export interface SlideTemplate {
  id: string;
  name: string;
  slug: string;
  category: string;
  shortDescription: string;
  description: string;
  language: string;
  tags: string[];
  updatedAt: string;
  slideCount: number;
  canvas: { width: number; height: number };
  coverImage: string;
  stripImages: string[];
  previewImages: string[];
  thumbnailImages: string[];
}

export interface TemplatesResponse {
  templates: SlideTemplate[];
}

export interface DeckManifestSlide {
  id: string;
  title: string;
  file: string;
}

export interface DeckManifest {
  schemaVersion: "ai-slide.deck.v1";
  title: string;
  canvas: {
    width: number;
    height: number;
  };
  slides: DeckManifestSlide[];
  createdAt: string;
  updatedAt: string;
}

export interface PptxManifest {
  kind: "pptx";
  fileName: "slides.pptx";
  exists: boolean;
  sha256: string | null;
  sizeBytes: number;
  updatedAt: string | null;
}

export function createEmptyPptxManifest(): PptxManifest {
  return {
    kind: "pptx",
    fileName: "slides.pptx",
    exists: false,
    sha256: null,
    sizeBytes: 0,
    updatedAt: null,
  };
}

export function parsePptxManifest(content: string): PptxManifest {
  try {
    const parsed = JSON.parse(content) as Partial<PptxManifest>;
    if (parsed.kind === "pptx" && parsed.fileName === "slides.pptx") {
      return {
        kind: "pptx",
        fileName: "slides.pptx",
        exists: parsed.exists === true,
        sha256: typeof parsed.sha256 === "string" ? parsed.sha256 : null,
        sizeBytes: typeof parsed.sizeBytes === "number" && Number.isFinite(parsed.sizeBytes) ? parsed.sizeBytes : 0,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      };
    }
  } catch {
    // Fall through to an empty manifest.
  }
  return createEmptyPptxManifest();
}

export function serializePptxManifest(manifest: PptxManifest): string {
  return JSON.stringify(manifest);
}

export interface SlideProjectRecord {
  project: SlideProject;
  artifact: SlideArtifact;
}

export interface SlideProjectDetail extends SlideProjectRecord {
  deckManifest?: DeckManifest | null;
  pptxManifest?: PptxManifest | null;
}

export interface AppSnapshot {
  projects: SlideProject[];
  artifacts: SlideArtifact[];
  activeRuns: SlideRun[];
  runEvents: SlideRunEvent[];
}

export interface CreateProjectRequest {
  title?: string;
  artifactType?: SlideArtifactType;
  templateId?: string | null;
  templateName?: string | null;
}

export interface UpdateProjectRequest {
  title?: string;
  activeArtifactId?: string;
  updatedBy?: SlideProjectUpdatedBy;
}

export interface DeckSlideHtmlResponse {
  slide: DeckManifestSlide;
  html: string;
  artifact: SlideArtifact;
}

export interface UpdateDeckSlideHtmlRequest {
  html: string;
}

export interface AiEditRequest {
  userPrompt: string;
  mode: AiEditMode;
  artifactType?: SlideArtifactType;
  selectedText?: string;
  selectedHtml?: string;
  selectionType?: SlideSelectionType;
  selectionPath?: string;
  runtimeProfileId?: string | null;
  reasoningEffort?: ReasoningEffort | null;
}

export interface AiEditResponse {
  run: SlideRun;
}

export interface ProjectResponse {
  project: SlideProject;
  artifact: SlideArtifact;
}

export interface ProjectDetailResponse extends SlideProjectDetail {}

export interface ProjectsResponse {
  projects: SlideProject[];
}

export interface ProjectRunsResponse {
  runs: SlideRunTimelineItem[];
}

export const deckArtifactFileRef = "deck.slides";
export const pptxArtifactFileRef = "slides.pptx";
export const deckMimeType = "application/vnd.ai-slide.deck";
export const pptxMimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";


export function createBlankDeckManifest(input: { title: string; createdAt?: string }): DeckManifest {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    schemaVersion: "ai-slide.deck.v1",
    title: input.title,
    canvas: {
      width: 1920,
      height: 1080,
    },
    slides: [
      {
        id: "slide-001",
        title: "Cover",
        file: "slides/01-cover.html",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
