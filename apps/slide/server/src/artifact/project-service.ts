import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  deckSlideDisplayName,
  pptxMimeType,
  type AiEditRequest,
  type CreateProjectRequest,
  type DeckAssetUploadResponse,
  type RuntimeProfile,
  type SlideArtifact,
  type SlideRun,
  type SlideRunEvent,
  type SlideWorkspaceContext,
  type UpdateDeckSlideHtmlRequest,
  type UpdateProjectRequest,
} from "@ai-slide/shared";
import { createDebouncedWorkspaceRefresh, RuntimeRunExecutor } from "@ai-app/agent/run-executor";
import { resolvePreferredLocalAgentRuntimeProfileId } from "@ai-app/shared/agent-providers";
import { projectAssetFileExtensions, projectAssetMimeTypes } from "@ai-app/shared/artifact-assets";
import type { ContextAttachmentUploadResponse } from "@ai-app/shared/context-attachments";
import { resolveAbsoluteImportSourcePath } from "@ai-app/shared/import-source";
import { openPathInFileManager } from "@ai-app/shared/local-open";
import { isTshWorkspaceAppHost, TSH_DEFAULT_PARENT_PATH } from "@ai-app/shared/tsh-host";
import { projectWorkspaceRoot } from "../local/paths.js";
import { createRuntimeProviderRegistry } from "../runtimes/runtime-registry.js";
import type { SlideRuntimeProject } from "../runtimes/runtime-provider.js";
import { requireOfficeCli } from "../toolchains/officecli.js";
import { EventHub } from "../ws/event-hub.js";
import { ProjectRepository } from "./project-repository.js";
export class ProjectService {
  private readonly runtimes = createRuntimeProviderRegistry();
  private readonly cancelledRunIds = new Set<string>();
  private readonly runAssistantMessageIds = new Map<string, string>();
  private readonly runWorkspaceFlushes = new Map<string, () => Promise<void>>();
  private readonly runExecutor: RuntimeRunExecutor<SlideRun, SlideRunEvent, SlideRuntimeProject, AiEditRequest>;

  constructor(
    private readonly repo: ProjectRepository,
    private readonly events: EventHub,
  ) {
    this.runExecutor = new RuntimeRunExecutor({
      repo,
      events,
      runtimes: this.runtimes,
    });
  }

  bootstrap() {
    const snapshot = this.repo.snapshot();
    const tshWorkspaceApp = isTshWorkspaceAppHost();
    return {
      ...snapshot,
      tshWorkspaceApp,
      defaultParentPath: tshWorkspaceApp ? TSH_DEFAULT_PARENT_PATH : null,
    };
  }

  interruptActiveRuns(reason = "Interrupted by server restart") {
    return this.repo.interruptActiveRuns(reason);
  }

  listProjects() {
    return { projects: this.repo.listProjects() };
  }

  clearProjectHistory() {
    return this.repo.clearProjectHistory();
  }

  deleteProject(projectId: string) {
    return this.repo.deleteProject(projectId);
  }

  async createProject(input: CreateProjectRequest) {
    if (input.artifactType === "pptx") await requireOfficeCli();
    const result = await this.repo.createProject(input);
    this.events.emit({ type: "project.created", projectId: result.project.id, payload: result });
    return result;
  }

  async importPptxProject(input: { path?: string; title?: string }) {
    await requireOfficeCli();
    if (!input.path?.trim()) throw new Error("PPTX path is required");
    const sourcePath = resolveAbsoluteImportSourcePath(input.path);
    const imported = await this.repo.importPptxProjectFromFile({
      sourcePath,
      title: input.title,
    });
    const detail = {
      project: imported.project,
      artifact: imported.artifact,
      deckManifest: null,
      pptxManifest: imported.pptxManifest,
      sourcePath,
    };
    this.events.emit({ type: "project.created", projectId: imported.project.id, payload: detail });
    return detail;
  }

  async importPptxProjectFile(input: { fileName: string; mimeType: string; bytes: Buffer; title?: string }) {
    await requireOfficeCli();
    if (input.bytes.byteLength === 0) throw new Error("PPTX file is empty");
    if (input.bytes.byteLength > maxPptxImportBytes) throw new Error("PPTX file is too large");
    if (!isSupportedPptxImport(input.fileName, input.mimeType)) throw new Error("Only PPTX files are supported");
    const imported = await this.repo.importPptxProjectFromBytes(input);
    const detail = {
      project: imported.project,
      artifact: imported.artifact,
      deckManifest: null,
      pptxManifest: imported.pptxManifest,
    };
    this.events.emit({ type: "project.created", projectId: imported.project.id, payload: detail });
    return detail;
  }

  async getProject(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.repo.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Active artifact not found");
    this.repo.assertFocusedArtifactPresent(project, artifact);
    await this.repo.ensureTemplateDeckMaterialized(project, artifact);
    return {
      project,
      artifact,
      deckManifest: await this.repo.readDeckManifest(project.id, artifact),
      pptxManifest: await this.repo.readPptxManifest(project.id, artifact),
    };
  }

  updateProject(projectId: string, input: UpdateProjectRequest) {
    const project = this.repo.updateProject(projectId, input);
    if (!project) return null;
    const artifact = this.repo.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Active artifact not found");
    const result = { project, artifact };
    this.events.emit({ type: "project.updated", projectId, payload: result });
    return result;
  }

  async setProjectTitle(projectId: string, title: string, updatedBy: "human" | "ai" | "system" = "ai") {
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new Error("Project title is required");
    const project = this.repo.updateProject(projectId, { title: cleanTitle, updatedBy });
    if (!project) throw new Error("Project not found");
    await this.repo.renameTshArtifactRootForTitle(projectId, cleanTitle);
    this.repo.updateProjectSessionTitle(projectId, cleanTitle);
    await this.repo.updateDeckManifestTitle(projectId, cleanTitle, updatedBy);
    const detail = await this.getProject(projectId);
    this.events.emit({ type: "project.updated", projectId, payload: detail });
    return detail;
  }

  async reorderDeckSlides(projectId: string, input: { slides?: string[] }, updatedBy: "human" | "ai" | "system" = "ai") {
    await this.repo.reorderDeckSlides(projectId, input, updatedBy);
    const detail = await this.getProject(projectId);
    this.events.emit({ type: "project.updated", projectId, payload: detail });
    return {
      project: detail.project,
      artifact: detail.artifact,
      deckManifest: detail.deckManifest,
    };
  }

  readDeckSlideHtml(projectId: string, slideId: string) {
    return this.repo.readDeckSlideHtml(projectId, slideId);
  }

  writeDeckSlideHtml(projectId: string, slideId: string, input: UpdateDeckSlideHtmlRequest) {
    if (typeof input.html !== "string" || !input.html.trim()) throw new Error("Slide HTML is required");
    return this.repo.writeDeckSlideHtml(
      projectId,
      slideId,
      input.html,
      "human",
      input.expectedArtifactRevision,
    );
  }

  async uploadDeckAsset(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }): Promise<DeckAssetUploadResponse> {
    if (!isSupportedImageMimeType(input.mimeType)) throw new Error("Only image assets are supported");
    if (input.bytes.byteLength === 0) throw new Error("Asset file is empty");
    if (input.bytes.byteLength > maxDeckAssetBytes) throw new Error("Asset file is too large");
    const asset = await this.repo.writeDeckAsset(projectId, input);
    return {
      path: asset.path,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    };
  }

  async uploadProjectAsset(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }): Promise<DeckAssetUploadResponse> {
    if (!this.repo.getProject(projectId)) throw new Error("Project not found");
    if (!isSupportedProjectAsset(input.fileName, input.mimeType)) throw new Error("Only image, PDF, text, and Office document assets are supported");
    if (input.bytes.byteLength === 0) throw new Error("Asset file is empty");
    if (input.bytes.byteLength > maxProjectAssetBytes) throw new Error("Asset file is too large");
    return this.repo.writeProjectAsset(projectId, input);
  }

  async uploadContextAttachment(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }): Promise<ContextAttachmentUploadResponse> {
    if (!this.repo.getProject(projectId)) throw new Error("Project not found");
    if (input.bytes.byteLength === 0) throw new Error("Context attachment is empty");
    if (input.bytes.byteLength > maxContextAttachmentBytes) throw new Error("Context attachment is too large");
    return this.repo.writeContextAttachment(projectId, input);
  }

  async writeProjectExport(
    projectId: string,
    input: { fileName: string; mimeType: string; bytes: Buffer; targetDirectory?: string | null },
  ) {
    if (!isSupportedExportMimeType(input.mimeType)) throw new Error("Only PPTX and PDF exports are supported");
    if (input.bytes.byteLength === 0) throw new Error("Export file is empty");
    if (input.bytes.byteLength > maxDeckExportBytes) throw new Error("Export file is too large");
    const targetDirectory = input.targetDirectory?.trim() || null;
    if (targetDirectory && !isTshWorkspaceAppHost()) {
      throw new Error("Custom export directories are only supported on TSH");
    }
    return this.repo.writeProjectExport(projectId, { ...input, targetDirectory });
  }

  async exportPptxFile(projectId: string, input: { targetDirectory?: string | null } = {}) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const file = await this.repo.readPptxFile(projectId);
    return this.writeProjectExport(projectId, {
      fileName: `${project.title || "slides"}.pptx`,
      mimeType: file.mimeType,
      bytes: file.bytes,
      targetDirectory: input.targetDirectory,
    });
  }

  async exportDeckHtml(projectId: string, input: { targetDirectory?: string | null } = {}) {
    const targetDirectory = input.targetDirectory?.trim() || null;
    if (targetDirectory && !isTshWorkspaceAppHost()) {
      throw new Error("Custom export directories are only supported on TSH");
    }
    return this.repo.writeDeckHtmlExport(projectId, { targetDirectory });
  }

  async openProjectExportsDir(projectId: string) {
    const path = this.repo.projectExportsDir(projectId);
    await openPathInFileManager(path);
    return { path };
  }

  projectWorkspaceContext(projectId: string, artifact: Pick<SlideArtifact, "fileRef" | "type">): SlideWorkspaceContext {
    const workspaceRoot = projectWorkspaceRoot(projectId);
    const focusedPath = join(workspaceRoot, artifact.fileRef);
    return {
      workspaceRoot,
      focusedPath,
      focusedPathKind: artifact.type === "deck" ? "directory" : "file",
      focusedFilePath: artifact.type === "pptx" ? focusedPath : undefined,
      agentInstructionsPath: join(workspaceRoot, "AGENTS.md"),
    };
  }

  readPptxFile(projectId: string) {
    return this.repo.readPptxFile(projectId);
  }

  listProjectRuns(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return {
      runs: this.repo.listProjectRuns(projectId).map((run) => ({
        run,
        events: this.repo.listRunEvents(run.id),
      })),
    };
  }

  listRunEvents(runId: string) {
    const run = this.repo.getRun(runId);
    if (!run) throw new Error("Run not found");
    return { run, events: this.repo.listRunEvents(runId) };
  }

  listConversationSessions(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return { sessions: this.repo.listConversationSessions(projectId) };
  }

  createConversationSession(projectId: string, input: { title?: string }) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return { session: this.repo.createConversationSession(projectId, input.title?.trim() || project.title) };
  }

  listConversationMessages(input: { projectId: string; sessionId: string }) {
    this.requireProjectSession(input.projectId, input.sessionId);
    return { messages: this.repo.listConversationMessages(input.sessionId) };
  }

  createConversationMessage(input: {
    projectId: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    metadata?: Record<string, unknown> | null;
  }) {
    this.requireProjectSession(input.projectId, input.sessionId);
    return {
      message: this.repo.createConversationMessage({
        projectId: input.projectId,
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        metadata: input.metadata,
      }),
    };
  }

  async startAiEdit(projectId: string, request: AiEditRequest) {
    // Join both durable core readiness and auxiliary context before reading the
    // runtime project so a failed materialization cannot leak into an agent run.
    await this.repo.ensureAgentContextReady(projectId);
    const runtimeProject = await this.createRuntimeProject(projectId);
    if (runtimeProject.artifact.type === "pptx") await requireOfficeCli();
    const runtimeProfile = await this.resolveRuntimeProfile(request.runtimeProfileId);
    const provider = this.runtimes.getProvider(runtimeProfile);
    const descriptor = provider.describeRun(runtimeProfile);
    const session = this.resolveConversationSession(projectId, runtimeProject.title, request.sessionId);
    this.repo.createConversationMessage({
      projectId,
      sessionId: session.id,
      role: "user",
      content: request.userPrompt,
      metadata: conversationMessageMetadata(request),
    });
    const assistantMessage = this.repo.createConversationMessage({
      projectId,
      sessionId: session.id,
      role: "assistant",
      content: "",
      metadata: { status: "accepted" },
    });
    const run = this.repo.createRun({
      projectId,
      runtime: descriptor.runtime,
      agentTargetId: descriptor.agentTargetId,
      provider: descriptor.provider,
      model: descriptor.model,
      mode: request.mode,
      instruction: request.userPrompt,
      selectionType: request.selectionType ?? "write",
      selectionPath: request.selectionPath ?? "",
      selectedText: request.selectedText ?? "",
      selectedHtml: request.selectedHtml ?? "",
    });
    this.runAssistantMessageIds.set(run.id, assistantMessage.id);
    this.repo.updateConversationMessage(assistantMessage.id, { metadata: { status: "accepted", runId: run.id } });
    this.events.emit({ type: "run.accepted", projectId, runId: run.id, payload: { run } });
    void this.executeRun(runtimeProject, runtimeProfile, request, run.id, { assistantMessageId: assistantMessage.id, sessionId: session.id });
    return { run };
  }

  async listLocalAgentTargets() {
    const agents = await this.runtimes.listLocalAgentTargets();
    this.repo.syncLocalAgentRuntimeProfiles(agents);
    return { agents };
  }

  private resolveConversationSession(projectId: string, title: string, sessionId: string | null | undefined) {
    if (!sessionId?.trim()) return this.repo.ensureConversationSession(projectId, title);
    return this.requireProjectSession(projectId, sessionId);
  }

  private async resolveRuntimeProfile(runtimeProfileId: string | null | undefined) {
    if (runtimeProfileId) {
      const existing = this.repo.getRuntimeProfile(runtimeProfileId);
      if (existing.id === runtimeProfileId && existing.kind !== "local-agent") return existing;
      const agents = await this.runtimes.listLocalAgentTargets();
      this.repo.syncLocalAgentRuntimeProfiles(agents);
      const synced = this.repo.getRuntimeProfile(runtimeProfileId);
      if (synced.id !== runtimeProfileId) throw new Error(`Runtime profile not found: ${runtimeProfileId}`);
      if (!synced.agentTargetId || !agents.some((agent) => agent.agentTargetId === synced.agentTargetId && agent.supported)) {
        throw new Error(`Agent Target is unavailable: ${synced.agentTargetId ?? runtimeProfileId}`);
      }
      return synced;
    }
    const agents = await this.runtimes.listLocalAgentTargets();
    this.repo.syncLocalAgentRuntimeProfiles(agents);
    const profiles = this.repo.snapshot().runtimeProfiles;
    const preferredProfileId = resolvePreferredLocalAgentRuntimeProfileId({
      profiles,
      agents,
    });
    if (!preferredProfileId) throw new Error("No available Agent Target");
    return this.repo.getRuntimeProfile(preferredProfileId);
  }

  private requireProjectSession(projectId: string, sessionId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const session = this.repo.listConversationSessions(projectId).find((item) => item.id === sessionId);
    if (!session) throw new Error("Session not found");
    return session;
  }

  async cancelRun(runId: string) {
    const run = this.repo.getRun(runId);
    if (!run) return null;
    if (!["accepted", "running"].includes(run.status)) return { run };
    this.cancelledRunIds.add(runId);
    await this.runtimes.getProviderForRuntime(run.runtime).cancel(runId).catch(() => undefined);
    await this.runWorkspaceFlushes.get(runId)?.().catch(() => undefined);
    return this.finalizeCancellation(runId, "Cancelled by user");
  }

  private async executeRun(
    runtimeProject: SlideRuntimeProject,
    runtimeProfile: RuntimeProfile,
    request: AiEditRequest,
    runId: string,
    conversation: { assistantMessageId: string; sessionId: string },
  ) {
    let refreshedArtifact = false;
    let workspaceFingerprint = "";
    const workspaceRefresh = createDebouncedWorkspaceRefresh(async () => {
      const refresh = await this.refreshArtifactFromWorkspace(runtimeProject.id, runId, workspaceFingerprint);
      workspaceFingerprint = refresh.fingerprint;
      refreshedArtifact = refresh.changed || refreshedArtifact;
    }, workspaceRefreshDebounceMs, {
      runId,
      provider: runtimeProfile.provider,
      agentTargetId: runtimeProfile.agentTargetId ?? "unknown",
    });
    let terminalFlush: Promise<void> | null = null;
    const flushTerminalWorkspace = () => terminalFlush ??= workspaceRefresh.flush();
    this.runWorkspaceFlushes.set(runId, flushTerminalWorkspace);

    await this.runExecutor.execute({
      project: runtimeProject,
      request,
      runtimeProfile,
      runId,
      conversation: { conversationId: runtimeProject.id, sessionId: conversation.sessionId },
      history: this.repo.conversationHistory(conversation.sessionId, request.userPrompt),
      isCancelled: () => this.cancelledRunIds.has(runId),
      finalizeCancellation: async (id, reason) => {
        await flushTerminalWorkspace().catch(() => undefined);
        return this.finalizeCancellation(id, reason);
      },
      beforeRun: async () => {
        workspaceFingerprint = await this.workspaceFingerprint(runtimeProject.id);
      },
      onWorkspaceEvent: async () => {
        workspaceRefresh.schedule();
      },
      complete: async ({ generatedText }) => {
        await flushTerminalWorkspace();
        const detail = await this.getProject(runtimeProject.id);
        const currentRun = this.repo.getRun(runId);
        if (currentRun && !["accepted", "running"].includes(currentRun.status)) return;
        const finalRun = this.repo.updateRun(runId, {
          status: "completed",
          resultPreview: previewText(generatedText || runPreview(detail.artifact.type, detail.pptxManifest)),
        });
        this.events.emit({ type: "run.completed", projectId: runtimeProject.id, runId, payload: { run: finalRun } });
        this.repo.updateConversationMessage(conversation.assistantMessageId, {
          content: assistantConversationContent(runtimeProfile, generatedText, finalRun?.resultPreview ?? ""),
          metadata: { status: "completed", runId },
        });
      },
      onFailure: async ({ error }) => {
        await flushTerminalWorkspace().catch(() => undefined);
        this.repo.updateConversationMessage(conversation.assistantMessageId, {
          content: `Run failed: ${error}`,
          metadata: { status: "failed", runId },
        });
      },
      onFinally: () => {
        workspaceRefresh.dispose();
        this.runWorkspaceFlushes.delete(runId);
        this.cancelledRunIds.delete(runId);
        this.runAssistantMessageIds.delete(runId);
      },
    });
  }

  private async createRuntimeProject(projectId: string): Promise<SlideRuntimeProject> {
    const detail = await this.getProject(projectId);
    return {
      ...detail.project,
      artifact: detail.artifact,
      deckManifest: detail.deckManifest,
      deckSlides: await this.readDeckSlideContext(projectId, detail.deckManifest),
      pptxManifest: detail.pptxManifest,
    };
  }

  private async readDeckSlideContext(projectId: string, manifest: SlideRuntimeProject["deckManifest"]) {
    if (!manifest?.slides.length) return [];
    const slides = manifest.slides.slice(0, maxPromptSlidePreviews);
    return Promise.all(
      slides.map(async (slide, index) => {
        try {
          const result = await this.repo.readDeckSlideHtml(projectId, slide.id);
          return {
            id: slide.id,
            displayName: deckSlideDisplayName(slide, index),
            file: slide.file,
            htmlPreview: previewHtmlForPrompt(result.html),
          };
        } catch {
          return {
            id: slide.id,
            displayName: deckSlideDisplayName(slide, index),
            file: slide.file,
            htmlPreview: "",
          };
        }
      }),
    );
  }

  private async refreshArtifactFromWorkspace(projectId: string, runId: string | undefined, previousFingerprint: string) {
    const detail = await this.getProject(projectId);
    const fingerprint = await this.workspaceFingerprintFromDetail(detail);
    if (fingerprint === previousFingerprint) return { changed: false, fingerprint };

    if (detail.artifact.type === "pptx") {
      await this.repo.refreshPptxArtifactFromFile(projectId, "ai");
    } else {
      const syncedManifest = await this.syncDeckManifestSlideFiles(detail);
      if (!syncedManifest) this.repo.bumpArtifactRevision(detail.artifact.id, "ai");
    }
    const updated = await this.getProject(projectId);
    this.events.emit({ type: "project.updated", projectId, runId, payload: updated });
    return { changed: true, fingerprint: await this.workspaceFingerprint(projectId) };
  }

  private async syncDeckManifestSlideFiles(detail: Awaited<ReturnType<ProjectService["getProject"]>>) {
    if (detail.artifact.type !== "deck" || !detail.deckManifest) return false;
    const slidesDir = join(projectWorkspaceRoot(detail.project.id), detail.artifact.fileRef, "slides");
    let slideFiles: string[];
    try {
      const entries = await readdir(slidesDir, { withFileTypes: true });
      slideFiles = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
        .map((entry) => entry.name);
    } catch {
      return false;
    }
    const manifestFiles = new Set(detail.deckManifest.slides.map((slide) => slide.file.replace(/^slides\//, "")));
    if (slideFiles.length === manifestFiles.size && slideFiles.every((file) => manifestFiles.has(file))) return false;
    try {
      await this.repo.reorderDeckSlides(detail.project.id, {}, "ai");
      return true;
    } catch {
      return false;
    }
  }

  private async workspaceFingerprint(projectId: string) {
    const detail = await this.getProject(projectId);
    return this.workspaceFingerprintFromDetail(detail);
  }

  private async workspaceFingerprintFromDetail(detail: Awaited<ReturnType<ProjectService["getProject"]>>) {
    if (detail.artifact.type === "pptx") {
      const manifest = detail.pptxManifest;
      return JSON.stringify({
        type: "pptx",
        exists: Boolean(manifest?.exists),
        sha256: manifest?.sha256 ?? "",
        sizeBytes: manifest?.sizeBytes ?? 0,
      });
    }
    const deckRoot = join(projectWorkspaceRoot(detail.project.id), detail.artifact.fileRef);
    return `deck:${await hashDirectoryMetadata(deckRoot)}`;
  }

  private async finalizeCancellation(runId: string, reason: string) {
    const run = this.repo.getRun(runId);
    if (!run) return null;
    if (run.status === "cancelled") return { run };
    const finalRun = this.repo.updateRun(runId, { status: "cancelled", error: reason }) ?? run;
    this.events.emit({ type: "run.cancelled", projectId: run.projectId, runId, payload: { run: finalRun } });
    const assistantMessageId = this.runAssistantMessageIds.get(runId);
    if (assistantMessageId) {
      this.repo.updateConversationMessage(assistantMessageId, {
        content: `Run cancelled: ${reason}`,
        metadata: { status: "cancelled", runId },
      });
    }
    return { run: finalRun };
  }
}

const maxDeckAssetBytes = 20 * 1024 * 1024;
const maxContextAttachmentBytes = 30 * 1024 * 1024;
const maxProjectAssetBytes = 30 * 1024 * 1024;
const maxDeckExportBytes = 50 * 1024 * 1024;
const maxPptxImportBytes = 50 * 1024 * 1024;
const workspaceRefreshDebounceMs = 1_500;
const maxPromptSlidePreviews = 4;
const pdfMimeType = "application/pdf";
const supportedProjectAssetMimeTypes = new Set<string>(projectAssetMimeTypes);
const supportedProjectAssetExtensions = new Set<string>(projectAssetFileExtensions);

function isSupportedExportMimeType(mimeType: string) {
  return mimeType === pptxMimeType || mimeType === pdfMimeType;
}

function isSupportedPptxImport(fileName: string, mimeType: string) {
  return fileName.toLowerCase().endsWith(".pptx") || mimeType.toLowerCase() === pptxMimeType;
}

function isSupportedImageMimeType(mimeType: string) {
  return ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"].includes(mimeType);
}

function isSupportedProjectAsset(fileName: string, mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase();
  if (supportedProjectAssetMimeTypes.has(normalizedMimeType)) return true;
  return supportedProjectAssetExtensions.has(extname(fileName).toLowerCase());
}

async function hashDirectoryMetadata(root: string) {
  const hash = createHash("sha256");
  await hashDirectoryMetadataInto(hash, root, "");
  return hash.digest("hex");
}

async function hashDirectoryMetadataInto(hash: ReturnType<typeof createHash>, root: string, relativeDir: string) {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> = [];
  try {
    entries = await readdir(join(root, relativeDir), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = relativeDir ? join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await hashDirectoryMetadataInto(hash, root, relativePath);
    } else if (entry.isFile()) {
      const info = await stat(join(root, relativePath));
      hash.update(relativePath);
      hash.update("\0");
      hash.update(String(info.size));
      hash.update("\0");
      hash.update(String(info.mtimeMs));
      hash.update("\0");
    }
  }
}

function runPreview(artifactType: "deck" | "pptx", manifest: { exists: boolean; sizeBytes: number } | null | undefined) {
  if (artifactType === "deck") return "Deck files updated.";
  if (!manifest?.exists) return "PPTX run completed. No slides.pptx change was detected.";
  return `PPTX preview refreshed: ${manifest.sizeBytes} bytes`;
}

function conversationMessageMetadata(request: AiEditRequest) {
  return {
    mode: request.mode,
    selectionPath: request.selectionPath ?? "",
    selectionType: request.selectionType ?? "write",
    selectedText: request.selectedText ?? "",
  };
}

function assistantConversationContent(runtimeProfile: RuntimeProfile, generatedText: string, resultPreview: string) {
  if (runtimeProfile.kind === "local-agent") return generatedText.trim() || resultPreview.trim() || "Run completed.";
  return resultPreview.trim() || previewText(generatedText) || "Run completed.";
}

function previewText(value: string) {
  const text = value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
}

function previewHtmlForPrompt(value: string) {
  const text = value.trim();
  return text.length > 5000 ? `${text.slice(0, 5000)}\n<!-- truncated -->` : text;
}
