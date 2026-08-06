import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";
import {
  createEmptyDocxDocumentManifest,
  defaultHtmlDocument,
  type AiEditRequest,
  type ApplyTemplateRequest,
  type DocxDocumentManifest,
  type CreateProjectRequest,
  type DocumentWorkspaceContext,
  type DocumentTemplate,
  type DocumentProject,
  type DocumentRun,
  type DocumentRunEvent,
  type ProjectAssetUploadResponse,
  parseDocxDocumentManifest,
  type RuntimeProfile,
  serializeDocxDocumentManifest,
  type UpdateProjectRequest,
} from "@ai-doc/shared";
import { createDebouncedWorkspaceRefresh, RuntimeRunExecutor } from "@ai-app/agent/run-executor";
import { resolvePreferredLocalAgentRuntimeProfileId } from "@ai-app/shared/agent-providers";
import { projectAssetFileExtensions, projectAssetMimeTypes } from "@ai-app/shared/artifact-assets";
import type { ContextAttachmentUploadResponse } from "@ai-app/shared/context-attachments";
import { openPathInFileManager } from "@ai-app/shared/local-open";
import { isTshFileArtifactPath, isTshWorkspaceAppHost, TSH_DEFAULT_PARENT_PATH } from "@ai-app/shared/tsh-host";
import {
  bindProjectWorkspaceRoot,
  boundWorkspaceRoot,
  isTshFileArtifactProject,
  projectFocusedArtifactPath,
  projectPrivateRoot,
  projectWorkspaceRoot,
} from "../local/paths.js";
import { blankDocxBytes } from "./blank-docx-bytes.js";
import { DocumentRepository } from "./document-repository.js";
import { materializeDocumentProjectCore } from "./document-preparation.js";
import { renderTemplateSeed } from "./document-template-renderer.js";
import { mimeTypeForImportFileName, resolveImportSourcePath } from "./import-source.js";
import { assistantConversationContent, conversationMessageMetadata, previewText } from "./run-preview.js";
import { documentTemplates, getTemplate } from "./templates.js";
import { loadTemplateProjectSeed, materializeTemplateAssetsToProject } from "../templates/template-service.js";
import { createRuntimeProviderRegistry } from "../runtimes/runtime-registry.js";
import { requireOfficeCli } from "../toolchains/officecli.js";
import { EventHub } from "../ws/event-hub.js";
import { invalidateProjectAssetCache } from "./project-assets.js";

export class DocumentService {
  private readonly runtimes = createRuntimeProviderRegistry();
  private readonly cancelledRunIds = new Set<string>();
  private readonly runAssistantMessageIds = new Map<string, string>();
  private readonly runWorkspaceFlushes = new Map<string, () => Promise<void>>();
  private readonly runExecutor: RuntimeRunExecutor<DocumentRun, DocumentRunEvent, DocumentProject, AiEditRequest>;

  constructor(
    private readonly repo: DocumentRepository,
    private readonly events: EventHub,
  ) {
    this.runExecutor = new RuntimeRunExecutor({
      repo,
      events,
      runtimes: this.runtimes,
    });
  }

  bootstrap() {
    this.repo.ensureSeedData();
    const snapshot = this.repo.snapshot();
    const tshWorkspaceApp = isTshWorkspaceAppHost();
    return {
      ...snapshot,
      templates: documentTemplates,
      tshWorkspaceApp,
      defaultParentPath: tshWorkspaceApp ? TSH_DEFAULT_PARENT_PATH : null,
    };
  }

  interruptActiveRuns(reason = "Interrupted by server restart") {
    return this.repo.interruptActiveRuns(reason);
  }

  async listLocalAgentTargets() {
    const agents = await this.runtimes.listLocalAgentTargets();
    this.repo.syncLocalAgentRuntimeProfiles(agents);
    return { agents };
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
    const template = getTemplate(input.templateId);
    const type = input.type ?? "html";
    if (type === "docx") await requireOfficeCli();
    const templateProjectSeed = type === "html" && input.templateId && !input.content
      ? await loadTemplateProjectSeed(input.templateId)
      : null;
    const content = input.content ?? templateProjectSeed?.content ?? defaultProjectContent(type, template);
    const templateId = input.templateId ?? (template.id === "blank" ? null : template.id);
    const templateName = input.templateName ?? templateProjectSeed?.name ?? (template.id === "blank" ? null : template.name);
    const project = await this.repo.createProject({
      title: input.title?.trim() || input.templateName?.trim() || templateProjectSeed?.name || template.name || "Untitled Doc",
      content,
      type,
      templateId,
      templateName,
      parentPath: input.parentPath,
    });
    if (type === "docx") {
      // TSH single-file DOCX binds a /workspace/*.docx path that hydrate/getDocxFile require.
      // Blank create must seed that binary (import writes bytes; agent edits assume the file exists).
      try {
        await this.ensureBlankDocxArtifact(project.id);
      } catch (error) {
        try {
          this.repo.deleteProject(project.id);
        } catch (cleanupError) {
          console.warn(JSON.stringify({
            event: "ai_doc.project.create.cleanup_failed",
            projectId: project.id,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          }));
        }
        throw error;
      }
    }
    if (type === "html" && templateId && templateProjectSeed) {
      await materializeTemplateAssetsToProject(templateId, join(projectWorkspaceRoot(project.id), "assets"), content);
      this.repo.invalidateAndStartAgentContext(project.id);
    }
    const ready = this.repo.getProject(project.id) ?? project;
    const result = { project: ready, preparation: this.repo.getProjectPreparation(ready.id) };
    this.events.emit({ type: "project.created", projectId: ready.id, payload: result });
    return result;
  }

  async importProjectFile(input: { fileName: string; mimeType: string; bytes: Buffer; title?: string; parentPath?: string | null }) {
    if (input.bytes.byteLength === 0) throw new Error("Import file is empty");
    if (input.bytes.byteLength > maxProjectImportBytes) throw new Error("Import file is too large");
    const type = importedDocumentType(input.fileName, input.mimeType);
    if (type === "docx") await requireOfficeCli();
    const now = new Date().toISOString();
    const content = type === "docx"
      ? serializeDocxDocumentManifest({
        kind: "docx",
        fileName: docxFileName,
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        sizeBytes: input.bytes.byteLength,
        updatedAt: now,
      })
      : input.bytes.toString("utf8");
    const project = await this.repo.createProject({
      title: input.title?.trim() || importedProjectTitle(input.fileName),
      content,
      type,
      templateId: null,
      templateName: null,
      parentPath: input.parentPath,
      importFileName: input.fileName,
    });
    if (type === "docx") {
      await writeFile(docxFilePath(project.id), input.bytes);
    }
    this.events.emit({ type: "project.created", projectId: project.id, payload: { project } });
    return { project };
  }

  async importProjectPath(input: { path: string; title?: string }) {
    const sourcePath = resolveImportSourcePath(input.path);
    const sourceStat = await stat(sourcePath).catch((error: unknown) => {
      throw new Error(`Unable to read import file: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (!sourceStat.isFile()) throw new Error("Import path must point to a file");
    if (sourceStat.size === 0) throw new Error("Import file is empty");
    if (sourceStat.size > maxProjectImportBytes) throw new Error("Import file is too large");
    const fileName = basename(sourcePath);
    const result = await this.importProjectFile({
      fileName,
      mimeType: mimeTypeForImportFileName(fileName),
      bytes: await readFile(sourcePath),
      title: input.title,
    });
    return { ...result, sourcePath };
  }

  projectWorkspaceContext(project: Pick<DocumentProject, "id" | "type">): DocumentWorkspaceContext {
    const workspaceRoot = projectWorkspaceRoot(project.id);
    const focusedPath = projectFocusedArtifactPath(project.id, project.type);
    return {
      // Sidecar root (assets/exports). For TSH single-file, the user product is focusedPath.
      workspaceRoot,
      focusedPath,
      focusedPathKind: "file",
      focusedFilePath: focusedPath,
      // TSH single-file products do not materialize AGENTS.md; Tutti keeps the path for directory projects.
      agentInstructionsPath: isTshFileArtifactProject(project.id) ? "" : join(workspaceRoot, "AGENTS.md"),
    };
  }

  async getProject(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return { project: await this.hydrateProjectFromFocusedArtifact(project) };
  }

  /**
   * Source of truth for TSH (and Tutti when the focused file exists) text docs is
   * the on-disk artifact. DOCX keeps the DB manifest and still requires the binary.
   *
   * Never call updateProject/materialize here: rematerializing recreates a renamed
   * path and shows up as a spurious save on open.
   */
  private async hydrateProjectFromFocusedArtifact(project: DocumentProject): Promise<DocumentProject> {
    const bound = boundWorkspaceRoot(project.id) || project.workspaceRoot || null;
    if (bound) bindProjectWorkspaceRoot(project.id, bound);

    const path = projectFocusedArtifactPath(project.id, project.type);
    const requiresDiskArtifact =
      isTshFileArtifactProject(project.id) ||
      (isTshWorkspaceAppHost() && Boolean(bound && isTshFileArtifactPath(bound)));

    if (project.type === "docx") {
      if (requiresDiskArtifact && !existsSync(path)) {
        // Recover blank creates that bound a path but never seeded the binary.
        if (isBlankDocxManifest(project.content)) {
          await this.ensureBlankDocxArtifact(project.id);
          return this.repo.getProject(project.id) ?? project;
        }
        throw new Error(`Document file is missing at ${path}: no such file or directory`);
      }
      return project;
    }

    if (!existsSync(path)) {
      if (requiresDiskArtifact) {
        throw new Error(`Document file is missing at ${path}: no such file or directory`);
      }
      return project;
    }

    const content = await readFile(path, "utf8");
    if (content === project.content) return project;

    this.repo.syncProjectContentQuiet(project.id, content);
    return { ...project, content, updatedBy: "system" };
  }

  async getDocxFile(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (project.type !== "docx") throw new Error("Project is not a DOCX doc");
    const path = docxFilePath(projectId);
    try {
      const bytes = await readFile(path);
      return {
        bytes,
        fileName: docxFileName,
        mimeType: docxMimeType,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        if (isBlankDocxManifest(project.content)) {
          await this.ensureBlankDocxArtifact(projectId);
          const bytes = await readFile(path);
          return { bytes, fileName: docxFileName, mimeType: docxMimeType };
        }
        throw new Error(`Document file is missing at ${path}`);
      }
      throw error;
    }
  }

  /** Seed a blank .docx when create left only the private manifest (import already writes bytes). */
  private async ensureBlankDocxArtifact(projectId: string) {
    const path = docxFilePath(projectId);
    if (existsSync(path)) return;

    // Do not call officecli here: TSH marks OfficeCLI available without probing, and
    // create-time exec against HostFS/NFS has failed in production ("Unable to create project").
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, blankDocxBytes);

    const now = new Date().toISOString();
    const content = serializeDocxDocumentManifest({
      kind: "docx",
      fileName: docxFileName,
      sha256: createHash("sha256").update(blankDocxBytes).digest("hex"),
      sizeBytes: blankDocxBytes.byteLength,
      updatedAt: now,
    });
    this.repo.syncProjectContentQuiet(projectId, content);
    const project = this.repo.getProject(projectId);
    if (!project) return;
    const coreRoot = isTshFileArtifactProject(projectId)
      ? projectPrivateRoot(projectId)
      : projectWorkspaceRoot(projectId);
    await materializeDocumentProjectCore(coreRoot, { ...project, content });
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

  async listRunEvents(runId: string) {
    const run = this.repo.getRun(runId);
    if (!run) throw new Error("Run not found");
    await this.refreshProjectFromWorkspace(run.projectId, runId);
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

  async updateProject(projectId: string, input: UpdateProjectRequest) {
    const project = await this.repo.updateProject(projectId, input);
    if (!project) return null;
    if (input.title !== undefined) {
      this.repo.updateProjectSessionTitle(projectId, project.title);
    }
    this.events.emit({ type: "project.updated", projectId, payload: { project } });
    return { project };
  }

  async setProjectTitle(projectId: string, title: string, updatedBy: DocumentProject["updatedBy"] = "ai") {
    const project = await this.repo.updateProject(projectId, { title, updatedBy });
    if (!project) throw new Error("Project not found");
    this.repo.updateProjectSessionTitle(projectId, project.title);
    const result = { project };
    this.events.emit({ type: "project.updated", projectId, payload: result });
    return result;
  }

  async uploadProjectAsset(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }): Promise<ProjectAssetUploadResponse> {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (!isSupportedProjectAsset(input.fileName, input.mimeType)) throw new Error("Only image, PDF, text, and Office document assets are supported");
    if (input.bytes.byteLength === 0) throw new Error("Asset file is empty");
    if (input.bytes.byteLength > maxProjectAssetBytes) throw new Error("Asset file is too large");
    return this.repo.writeProjectAsset(projectId, input);
  }

  async uploadContextAttachment(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }): Promise<ContextAttachmentUploadResponse> {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (input.bytes.byteLength === 0) throw new Error("Context attachment is empty");
    if (input.bytes.byteLength > maxContextAttachmentBytes) throw new Error("Context attachment is too large");
    return this.repo.writeContextAttachment(projectId, input);
  }

  async writeProjectExport(
    projectId: string,
    input: { fileName: string; mimeType: string; bytes: Buffer; targetDirectory?: string | null },
  ) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (project.type === "docx" && input.mimeType.toLowerCase() !== pdfMimeType) throw new Error("Only PDF exports are supported for Word documents");
    if (project.type !== "html" && project.type !== "markdown" && project.type !== "docx") throw new Error("Exports are currently supported for HTML, Markdown, and Word docs only");
    if (!isSupportedExportMimeType(input.mimeType)) throw new Error("Only HTML, Markdown, DOCX, and PDF exports are supported");
    if (input.bytes.byteLength === 0) throw new Error("Export file is empty");
    if (input.bytes.byteLength > maxProjectExportBytes) throw new Error("Export file is too large");
    const targetDirectory = input.targetDirectory?.trim() || null;
    if (targetDirectory && !isTshWorkspaceAppHost()) {
      throw new Error("Custom export directories are only supported on TSH");
    }
    return this.repo.writeProjectExport(projectId, { ...input, targetDirectory });
  }

  async getProjectAsset(projectId: string, fileName: string) {
    return this.repo.readProjectAsset(projectId, fileName);
  }

  async openProjectExportsDir(projectId: string) {
    const path = this.repo.projectExportsDir(projectId);
    await openPathInFileManager(path);
    return { path };
  }

  async applyTemplate(projectId: string, input: ApplyTemplateRequest) {
    const template = getTemplate(input.templateId);
    const prompt = input.userPrompt?.trim()
      ? `${template.prompt}\n\nUser context:\n${input.userPrompt.trim()}`
      : template.prompt;
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    this.repo.setProjectTemplate(projectId, template);
    const request: AiEditRequest = {
      htmlContent: project.content,
      selectedText: "",
      selectedHtml: "",
      selectionType: "write",
      selectionPath: "",
      userPrompt: `Create an initial rich HTML doc from this template seed:\n${prompt}`,
      mode: "write",
      runtimeProfileId: input.runtimeProfileId,
    };
    return this.startAiEdit(projectId, request);
  }

  async startAiEdit(projectId: string, request: AiEditRequest) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (project.type === "docx") await requireOfficeCli();
    await this.repo.ensureAgentContextReady(projectId);
    const runtimeProfile = await this.resolveRuntimeProfile(request.runtimeProfileId);
    const provider = this.runtimes.getProvider(runtimeProfile);
    const descriptor = provider.describeRun(runtimeProfile);
    const session = this.resolveConversationSession(projectId, project.title, request.sessionId);
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
    void this.executeRun(project, runtimeProfile, request, run.id, { assistantMessageId: assistantMessage.id, sessionId: session.id });
    return { run };
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

  private async executeRun(
    initialProject: DocumentProject,
    runtimeProfile: RuntimeProfile,
    request: AiEditRequest,
    runId: string,
    conversation: { assistantMessageId: string; sessionId: string },
  ) {
    let refreshedFromWorkspace = false;
    const workspaceRefresh = createDebouncedWorkspaceRefresh(async () => {
      const refreshed = await this.refreshProjectFromWorkspace(initialProject.id, runId).finally(() => invalidateProjectAssetCache(initialProject.id));
      refreshedFromWorkspace = Boolean(refreshed) || refreshedFromWorkspace;
    }, workspaceRefreshDebounceMs, { runId, provider: runtimeProfile.provider, agentTargetId: runtimeProfile.agentTargetId ?? "unknown" });
    let terminalFlush: Promise<void> | null = null;
    const flushTerminalWorkspace = () => terminalFlush ??= workspaceRefresh.flush();
    this.runWorkspaceFlushes.set(runId, flushTerminalWorkspace);
    await this.runExecutor.execute({
      project: initialProject,
      request,
      runtimeProfile,
      runId,
      conversation: { conversationId: initialProject.id, sessionId: conversation.sessionId },
      history: this.repo.conversationHistory(conversation.sessionId, request.userPrompt),
      isCancelled: () => this.cancelledRunIds.has(runId),
      finalizeCancellation: async (id, reason) => (await flushTerminalWorkspace().catch(() => undefined), this.finalizeCancellation(id, reason)),
      onWorkspaceEvent: async () => {
        workspaceRefresh.schedule();
      },
      complete: async ({ generatedText }) => {
        await flushTerminalWorkspace();
        const finalRun = await this.completeRun(initialProject, runtimeProfile, runId, generatedText, refreshedFromWorkspace);
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

  private async completeRun(
    initialProject: DocumentProject,
    runtimeProfile: RuntimeProfile,
    runId: string,
    generatedText: string,
    refreshedFromWorkspace: boolean,
  ) {
    if (initialProject.type === "docx") {
      const project = this.repo.getProject(initialProject.id);
      return this.emitRunCompleted(initialProject.id, runId, previewText(generatedText || docxRunPreview(project?.content ?? "")));
    }

    if (runtimeProfile.kind === "local-agent") {
      const preview =
        previewText(generatedText) ||
        (refreshedFromWorkspace ? "Workspace file changes were applied." : "Run completed. No workspace file changes were detected.");
      return this.emitRunCompleted(initialProject.id, runId, preview);
    }

    if (initialProject.type === "markdown") {
      return this.completeMarkdownRun(initialProject, runId, generatedText, refreshedFromWorkspace);
    }

    return this.completeHtmlRun(initialProject, runId, generatedText, refreshedFromWorkspace);
  }

  private async completeMarkdownRun(initialProject: DocumentProject, runId: string, generatedText: string, refreshedFromWorkspace: boolean) {
    const finalMarkdown = extractMarkdownDocument(generatedText);
    let project = this.repo.getProject(initialProject.id);
    if (!refreshedFromWorkspace && finalMarkdown) {
      project = await this.repo.updateProject(initialProject.id, {
        content: finalMarkdown,
        type: "markdown",
        updatedBy: "ai",
      });
      if (project) this.events.emit({ type: "project.updated", projectId: project.id, runId, payload: { project } });
    } else if (!project || project.updatedBy !== "ai") {
      throw new Error("AI did not return a complete Markdown doc.");
    }
    return this.emitRunCompleted(initialProject.id, runId, previewText(finalMarkdown || project?.content || ""));
  }

  private async completeHtmlRun(initialProject: DocumentProject, runId: string, generatedText: string, refreshedFromWorkspace: boolean) {
    const finalHtml = extractHtmlDocument(generatedText);
    let project = this.repo.getProject(initialProject.id);
    if (!refreshedFromWorkspace && finalHtml) {
      project = await this.repo.updateProject(initialProject.id, {
        content: finalHtml,
        updatedBy: "ai",
      });
      if (project) this.events.emit({ type: "project.updated", projectId: project.id, runId, payload: { project } });
    } else if (!project || project.updatedBy !== "ai") {
      throw new Error("AI did not return a complete HTML doc.");
    }
    return this.emitRunCompleted(initialProject.id, runId, previewText(finalHtml || project?.content || ""));
  }

  private emitRunCompleted(projectId: string, runId: string, resultPreview: string) {
    const currentRun = this.repo.getRun(runId);
    if (currentRun && !["accepted", "running"].includes(currentRun.status)) return currentRun;
    const finalRun = this.repo.updateRun(runId, { status: "completed", resultPreview });
    this.events.emit({ type: "run.completed", projectId, runId, payload: { run: finalRun } });
    return finalRun;
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

  private async refreshProjectFromWorkspace(projectId: string, runId?: string) {
    const project = this.repo.getProject(projectId);
    if (!project) return null;
    if (project.type === "html" || project.type === "markdown") {
      return this.refreshTextProjectFromFile(project, runId);
    }
    return this.refreshDocxProjectFromFile(project, runId);
  }

  private async refreshTextProjectFromFile(project: DocumentProject, runId?: string) {
    let content = "";
    try {
      content = await readFile(projectFocusedArtifactPath(project.id, project.type), "utf8");
    } catch {
      return null;
    }
    if (content === project.content) return null;
    const updated = await this.repo.updateProject(project.id, {
      content,
      type: project.type,
      updatedBy: "ai",
    });
    if (updated) this.events.emit({ type: "project.updated", projectId: project.id, runId, payload: { project: updated } });
    return updated;
  }

  private async refreshDocxProjectFromFile(project: DocumentProject, runId?: string) {
    if (project.type !== "docx") return null;
    const nextManifest = await readDocxManifestFromFile(project.id);
    if (!nextManifest) return null;
    const currentManifest = parseDocxDocumentManifest(project.content);
    if (currentManifest.sha256 === nextManifest.sha256 && currentManifest.sizeBytes === nextManifest.sizeBytes) {
      return null;
    }
    const updated = await this.repo.updateProject(project.id, {
      content: serializeDocxDocumentManifest(nextManifest),
      type: "docx",
      updatedBy: "ai",
    });
    if (updated) this.events.emit({ type: "project.updated", projectId: project.id, runId, payload: { project: updated } });
    return updated;
  }
}

function extractHtmlDocument(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const fence = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const candidate = (fence?.[1] ?? trimmed).trim();
  const htmlStart = candidate.search(/<!doctype html>|<html[\s>]/i);
  if (htmlStart >= 0) return candidate.slice(htmlStart).trim();
  if (/<body[\s>]/i.test(candidate) || /<h1[\s>]/i.test(candidate) || /<p[\s>]/i.test(candidate)) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Doc</title>
</head>
<body contenteditable="true">
${candidate}
</body>
</html>`;
  }
  return "";
}

function extractMarkdownDocument(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const fence = trimmed.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
  return (fence?.[1] ?? trimmed).trim();
}

function defaultProjectContent(type: DocumentProject["type"], template: DocumentTemplate) {
  if (type === "markdown") return "";
  if (type === "docx") return serializeDocxDocumentManifest(createEmptyDocxDocumentManifest());
  if (template.id === "blank") return defaultHtmlDocument;
  return renderTemplateSeed(template);
}

const docxFileName = "document.docx";
const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdfMimeType = "application/pdf";
const maxContextAttachmentBytes = 30 * 1024 * 1024;
const workspaceRefreshDebounceMs = 1_500;
const maxProjectAssetBytes = 30 * 1024 * 1024;
const maxProjectExportBytes = 20 * 1024 * 1024;
const maxProjectImportBytes = 30 * 1024 * 1024;
const supportedProjectAssetMimeTypes = new Set<string>(projectAssetMimeTypes);
const supportedProjectAssetExtensions = new Set<string>(projectAssetFileExtensions);
const supportedExportMimeTypes = new Set(["text/html", "text/markdown", docxMimeType, pdfMimeType]);

function docxFilePath(projectId: string) {
  return projectFocusedArtifactPath(projectId, "docx");
}

function isBlankDocxManifest(content: string) {
  const manifest = parseDocxDocumentManifest(content);
  return !manifest.sha256 && manifest.sizeBytes === 0;
}

function importedDocumentType(fileName: string, mimeType: string): DocumentProject["type"] {
  const normalizedName = fileName.toLowerCase();
  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedName.endsWith(".docx") || normalizedMimeType === docxMimeType) return "docx";
  if (normalizedName.endsWith(".md") || normalizedName.endsWith(".markdown") || normalizedMimeType === "text/markdown") return "markdown";
  if (normalizedName.endsWith(".html") || normalizedName.endsWith(".htm") || normalizedMimeType === "text/html") return "html";
  throw new Error("Only HTML, Markdown, and Word documents can be imported");
}

function importedProjectTitle(fileName: string) {
  const decodedName = basename(fileName).split(/[\\/]/).filter(Boolean).pop()?.trim() || "Imported doc";
  return decodedName.replace(/\.(html?|markdown|md|docx)$/i, "").trim() || decodedName;
}

function isSupportedProjectAsset(fileName: string, mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase();
  if (supportedProjectAssetMimeTypes.has(normalizedMimeType)) return true;
  return supportedProjectAssetExtensions.has(extname(fileName).toLowerCase());
}

function isSupportedExportMimeType(mimeType: string) {
  return supportedExportMimeTypes.has(mimeType.toLowerCase());
}

async function readDocxManifestFromFile(projectId: string): Promise<DocxDocumentManifest | null> {
  try {
    const [fileStat, bytes] = await Promise.all([stat(docxFilePath(projectId)), readFile(docxFilePath(projectId))]);
    if (!fileStat.isFile()) return null;
    return {
      kind: "docx",
      fileName: docxFileName,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      updatedAt: fileStat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

function docxRunPreview(content: string) {
  const manifest = parseDocxDocumentManifest(content);
  if (!manifest.sha256) return "DOCX run completed. No document.docx change was detected.";
  return `DOCX preview refreshed: ${manifest.sizeBytes} bytes`;
}
