import { openPathInFileManager } from "@ai-app/shared/local-open";
import { RuntimeRunExecutor } from "@ai-app/agent/run-executor";
import type { ContextAttachmentUploadResponse } from "@ai-app/shared/context-attachments";
import { resolveWorkspaceImportSourcePath } from "@ai-app/shared/import-source";
import type { RuntimeProfile } from "@ai-app/shared/types";
import type {
  AiEditRequest,
  ApplySheetCommandsRequest,
  CreateProjectRequest,
  SheetArtifact,
  SheetRun,
  SheetRunEvent,
  SheetWorkspaceContext,
  UpdateProjectRequest,
  XlsxManifest,
} from "@ai-sheet/shared";
import { join } from "node:path";
import { projectWorkspaceRoot } from "../local/paths.js";
import { createRuntimeProviderRegistry } from "../runtimes/runtime-registry.js";
import type { SheetRuntimeProject } from "../runtimes/runtime-provider.js";
import { EventHub } from "../ws/event-hub.js";
import { SheetRepository } from "./sheet-repository.js";
import { XlsxStorageAdapter } from "./xlsx-storage-adapter.js";
import { requireOfficeCli } from "../toolchains/officecli.js";
import type { XlsxDirtyCell, XlsxFormulaCalcResult } from "./xlsx-formula-calculator.js";

export class SheetService {
  private readonly runtimes = createRuntimeProviderRegistry();
  private readonly cancelledRunIds = new Set<string>();
  private readonly runAssistantMessageIds = new Map<string, string>();
  private readonly runExecutor: RuntimeRunExecutor<SheetRun, SheetRunEvent, SheetRuntimeProject, AiEditRequest>;

  constructor(
    private readonly repo: SheetRepository,
    private readonly events: EventHub,
    private readonly storage: XlsxStorageAdapter,
  ) {
    this.runExecutor = new RuntimeRunExecutor({
      repo,
      events,
      runtimes: this.runtimes,
    });
  }

  bootstrap() {
    return this.repo.snapshot();
  }

  async listLocalAgentProviders() {
    return { providers: await this.runtimes.listLocalAgentProviders() };
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
    await requireOfficeCli();
    const result = this.repo.createProject(input);
    try {
      await this.storage.createBlankWorkbook({
        workbookPath: this.repo.xlsxFilePath(result.project.id),
      });
      const calc = await this.recalculateProjectWorkbook(result.project.id, { forceFullRecalc: true });
      const refresh = await this.repo.refreshXlsxArtifactFromFile(result.project.id, "system");
      const detail = {
        ...result,
        artifact: refresh.artifact,
        xlsxManifest: refresh.manifest,
        calc,
      };
      this.events.emit({ type: "project.created", projectId: result.project.id, payload: detail });
      return detail;
    } catch (error) {
      this.repo.deleteProject(result.project.id);
      throw error;
    }
  }

  async importXlsxProject(input: { path?: string; title?: string }) {
    await requireOfficeCli();
    if (!input.path?.trim()) throw new Error("XLSX path is required");
    const sourcePath = resolveWorkspaceImportSourcePath(input.path, {
      workspaceEnvVars: ["AI_SHEET_WORKSPACE_ROOT", "TUTTI_WORKSPACE_ROOT"],
    });
    const result = await this.repo.importXlsxProjectFromFile({
      sourcePath,
      title: input.title,
    });
    const calc = await this.recalculateProjectWorkbook(result.project.id, { forceFullRecalc: true });
    await this.repo.refreshXlsxArtifactFromFile(result.project.id, "system");
    const refreshed = await this.getProject(result.project.id, { recalculate: false });
    const payload = { ...refreshed, sourcePath, calc };
    this.events.emit({ type: "project.created", projectId: result.project.id, payload });
    return payload;
  }

  async importXlsxProjectFile(input: { fileName: string; bytes: Buffer; title?: string }) {
    await requireOfficeCli();
    const result = await this.repo.importXlsxProjectFromBytes(input);
    const calc = await this.recalculateProjectWorkbook(result.project.id, { forceFullRecalc: true });
    await this.repo.refreshXlsxArtifactFromFile(result.project.id, "system");
    const refreshed = await this.getProject(result.project.id, { recalculate: false });
    const payload = { ...refreshed, calc };
    this.events.emit({ type: "project.created", projectId: result.project.id, payload });
    return payload;
  }

  async getProject(projectId: string, options: { recalculate?: boolean } = {}) {
    const calc = options.recalculate === false ? null : await this.recalculateProjectWorkbook(projectId, { forceFullRecalc: true });
    if (calc?.changed) await this.repo.refreshXlsxArtifactFromFile(projectId, "system");
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.repo.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Active artifact not found");
    return {
      project,
      artifact,
      ...(calc ? { calc } : {}),
      xlsxManifest: await this.repo.readXlsxManifest(projectId),
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

  readXlsxFile(projectId: string) {
    return this.repo.readXlsxFile(projectId);
  }

  listProjectRuns(projectId: string) {
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
    await requireOfficeCli();
    const runtimeProject = await this.createRuntimeProject(projectId);
    const runtimeProfile = this.repo.getRuntimeProfile(request.runtimeProfileId);
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
      provider: descriptor.provider,
      model: descriptor.model,
      mode: request.mode ?? "write",
      instruction: request.userPrompt,
      selectionType: request.selectionType ?? "write",
      selectionPath: request.selectionPath ?? "",
      selectedText: request.selectedText ?? "",
      selectedHtml: request.selectedHtml ?? "",
    });
    this.runAssistantMessageIds.set(run.id, assistantMessage.id);
    this.repo.updateConversationMessage(assistantMessage.id, { metadata: { status: "accepted", runId: run.id } });
    this.events.emit({ type: "run.accepted", projectId, runId: run.id, payload: { run } });
    void this.executeRun(runtimeProject, runtimeProfile, { ...request, mode: request.mode ?? "write" }, run.id, {
      assistantMessageId: assistantMessage.id,
      sessionId: session.id,
    });
    return { run };
  }

  async cancelRun(runId: string) {
    const run = this.repo.getRun(runId);
    if (!run) return null;
    if (!["accepted", "running"].includes(run.status)) return { run };
    this.cancelledRunIds.add(runId);
    await this.runtimes.getProvider(this.repo.getRuntimeProfileForRun(run)).cancel(runId).catch(() => undefined);
    return this.finalizeCancellation(runId, "Cancelled by user");
  }

  private resolveConversationSession(projectId: string, title: string, sessionId: string | null | undefined) {
    if (!sessionId?.trim()) return this.repo.ensureConversationSession(projectId, title);
    return this.requireProjectSession(projectId, sessionId);
  }

  private requireProjectSession(projectId: string, sessionId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const session = this.repo.listConversationSessions(projectId).find((item) => item.id === sessionId);
    if (!session) throw new Error("Session not found");
    return session;
  }

  async writeProjectExport(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    return this.repo.writeProjectExport(projectId, input);
  }

  async uploadContextAttachment(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }): Promise<ContextAttachmentUploadResponse> {
    if (!this.repo.getProject(projectId)) throw new Error("Project not found");
    if (input.bytes.byteLength === 0) throw new Error("Context attachment is empty");
    if (input.bytes.byteLength > maxContextAttachmentBytes) throw new Error("Context attachment is too large");
    return this.repo.writeContextAttachment(projectId, input);
  }

  async exportXlsxFile(projectId: string) {
    const detail = await this.getProject(projectId);
    const file = await this.repo.readXlsxFile(projectId);
    return this.writeProjectExport(projectId, {
      fileName: `${detail.project.title || "workbook"}.xlsx`,
      mimeType: file.mimeType,
      bytes: file.bytes,
    });
  }

  async openProjectExportsDir(projectId: string) {
    const path = this.repo.projectExportsDir(projectId);
    await openPathInFileManager(path);
    return { path };
  }

  projectWorkspaceContext(projectId: string, artifact: Pick<SheetArtifact, "fileRef">): SheetWorkspaceContext {
    const workspaceRoot = projectWorkspaceRoot(projectId);
    const focusedPath = join(workspaceRoot, artifact.fileRef);
    return {
      workspaceRoot,
      focusedPath,
      focusedPathKind: "file",
      focusedFilePath: focusedPath,
      agentInstructionsPath: join(workspaceRoot, "AGENTS.md"),
    };
  }

  async applyCommands(projectId: string, input: ApplySheetCommandsRequest) {
    if (!Array.isArray(input.commands) || input.commands.length === 0) throw new Error("At least one sheet command is required");
    const detail = await this.getProject(projectId, { recalculate: false });
    if (input.baseRevision !== detail.artifact.revision) throw new Error("Stale workbook revision. Refresh and try again.");
    if (input.baseSha256 && detail.xlsxManifest?.sha256 && input.baseSha256 !== detail.xlsxManifest.sha256) {
      throw new Error("Stale workbook file. Refresh and try again.");
    }

    await this.storage.applyCommands({
      commands: input.commands,
      workbookPath: this.repo.xlsxFilePath(projectId),
    });
    const calc = await this.recalculateProjectWorkbook(projectId, {
      dirtyCells: dirtyCellsFromCommands(input.commands),
    });
    const refresh = await this.repo.refreshXlsxArtifactFromFile(projectId, "human");
    const updated = await this.getProject(projectId, { recalculate: false });
    const result = {
      ...updated,
      applied: input.commands.length,
      xlsxManifest: refresh.manifest,
      calc,
    };
    this.events.emit({ type: "project.updated", projectId, payload: result });
    return result;
  }

  private async executeRun(
    runtimeProject: SheetRuntimeProject,
    runtimeProfile: RuntimeProfile,
    request: AiEditRequest,
    runId: string,
    conversation: { assistantMessageId: string; sessionId: string },
  ) {
    let refreshedArtifact = false;
    let workspaceFingerprint = "";

    await this.runExecutor.execute({
      project: runtimeProject,
      request,
      runtimeProfile,
      runId,
      conversation: { conversationId: runtimeProject.id, sessionId: conversation.sessionId },
      history: this.repo.conversationHistory(conversation.sessionId, request.userPrompt),
      isCancelled: () => this.cancelledRunIds.has(runId),
      finalizeCancellation: (id, reason) => this.finalizeCancellation(id, reason),
      beforeRun: async () => {
        workspaceFingerprint = await this.workspaceFingerprint(runtimeProject.id);
      },
      onWorkspaceEvent: async () => {
        const refresh = await this.refreshArtifactFromWorkspace(runtimeProject.id, runId, workspaceFingerprint);
        workspaceFingerprint = refresh.fingerprint;
        refreshedArtifact = refresh.changed || refreshedArtifact;
      },
      complete: async ({ generatedText }) => {
        if (!refreshedArtifact) await this.refreshArtifactFromWorkspace(runtimeProject.id, runId, workspaceFingerprint);
        const detail = await this.getProject(runtimeProject.id, { recalculate: false });
        const currentRun = this.repo.getRun(runId);
        if (currentRun && !["accepted", "running"].includes(currentRun.status)) return;
        const finalRun = this.repo.updateRun(runId, {
          status: "completed",
          resultPreview: previewText(generatedText || runPreview(detail.xlsxManifest)),
        });
        this.events.emit({ type: "run.completed", projectId: runtimeProject.id, runId, payload: { run: finalRun } });
        this.repo.updateConversationMessage(conversation.assistantMessageId, {
          content: assistantConversationContent(runtimeProfile, generatedText, finalRun?.resultPreview ?? ""),
          metadata: { status: "completed", runId },
        });
      },
      onFailure: async ({ error }) => {
        this.repo.updateConversationMessage(conversation.assistantMessageId, {
          content: `Run failed: ${error}`,
          metadata: { status: "failed", runId },
        });
      },
      onFinally: () => {
        this.cancelledRunIds.delete(runId);
        this.runAssistantMessageIds.delete(runId);
      },
    });
  }

  private async createRuntimeProject(projectId: string): Promise<SheetRuntimeProject> {
    const detail = await this.getProject(projectId);
    return {
      ...detail.project,
      artifact: detail.artifact,
      xlsxManifest: detail.xlsxManifest,
    };
  }

  private async refreshArtifactFromWorkspace(projectId: string, runId: string | undefined, previousFingerprint: string) {
    const calc = await this.recalculateProjectWorkbook(projectId, { forceFullRecalc: true });
    const refresh = await this.repo.refreshXlsxArtifactFromFile(projectId, "ai", {
      previousManifest: xlsxManifestFromFingerprint(previousFingerprint),
    });
    const fingerprint = await this.workspaceFingerprint(projectId);
    if (!refresh.changed && fingerprint === previousFingerprint) return { changed: false, fingerprint };
    const updated = await this.getProject(projectId, { recalculate: false });
    this.events.emit({ type: "project.updated", projectId, runId, payload: { ...updated, calc } });
    return { changed: true, fingerprint };
  }

  private async recalculateProjectWorkbook(projectId: string, options: { dirtyCells?: XlsxDirtyCell[]; forceFullRecalc?: boolean }) {
    const calc = await this.storage.recalculateWorkbook({
      workbookPath: this.repo.xlsxFilePath(projectId),
      dirtyCells: options.dirtyCells,
      forceFullRecalc: options.forceFullRecalc,
    });
    if (calc.status === "error") throw new Error(`XLSX formula calculation failed: ${JSON.stringify(calc.diagnostics ?? [])}`);
    return calc;
  }

  private async workspaceFingerprint(projectId: string) {
    const manifest = await this.repo.readXlsxManifest(projectId);
    return JSON.stringify({
      exists: Boolean(manifest?.exists),
      sha256: manifest?.sha256 ?? "",
      sizeBytes: manifest?.sizeBytes ?? 0,
    });
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

function conversationMessageMetadata(request: AiEditRequest) {
  return {
    mode: request.mode ?? "write",
    selectionPath: request.selectionPath ?? "",
    selectionType: request.selectionType ?? "write",
    selectedText: request.selectedText ?? "",
  };
}

function dirtyCellsFromCommands(commands: ApplySheetCommandsRequest["commands"]) {
  const dirtyCells: XlsxDirtyCell[] = [];
  for (const command of commands) {
    if (command.type === "set-cell-value") {
      dirtyCells.push({
        sheetName: command.sheetName || command.sheetId,
        address: command.address,
      });
    }
  }
  return dirtyCells;
}

function xlsxManifestFromFingerprint(value: string): Pick<XlsxManifest, "exists" | "sha256" | "sizeBytes"> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<Pick<XlsxManifest, "exists" | "sha256" | "sizeBytes">>;
    if (typeof parsed.exists !== "boolean") return undefined;
    return {
      exists: parsed.exists,
      sha256: typeof parsed.sha256 === "string" ? parsed.sha256 : null,
      sizeBytes: typeof parsed.sizeBytes === "number" && Number.isFinite(parsed.sizeBytes) ? parsed.sizeBytes : 0,
    };
  } catch {
    return undefined;
  }
}

function assistantConversationContent(runtimeProfile: RuntimeProfile, generatedText: string, resultPreview: string) {
  if (runtimeProfile.kind === "local-agent") return generatedText.trim() || resultPreview.trim() || "Run completed.";
  return resultPreview.trim() || previewText(generatedText) || "Run completed.";
}

function runPreview(manifest: { exists: boolean; sizeBytes: number } | null | undefined) {
  if (!manifest?.exists) return "XLSX run completed. No workbook.xlsx change was detected.";
  return `XLSX preview refreshed: ${manifest.sizeBytes} bytes`;
}

const maxContextAttachmentBytes = 30 * 1024 * 1024;

function previewText(value: string) {
  const text = value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
}
