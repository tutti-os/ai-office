import { readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import {
  createEmptyDocxDocumentManifest,
  defaultHtmlDocument,
  type AiEditRequest,
  type ApplyTemplateRequest,
  type DocxDocumentManifest,
  type CreateProjectRequest,
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
import { RuntimeRunExecutor } from "@ai-app/agent/run-executor";
import { openPathInFileManager } from "@ai-app/shared/local-open";
import { projectWorkspaceRoot } from "../local/paths.js";
import { DocumentRepository } from "./document-repository.js";
import { documentTemplates, getTemplate } from "./templates.js";
import { loadTemplateProjectSeed, materializeTemplateAssetsToProject } from "../templates/template-service.js";
import { createRuntimeProviderRegistry } from "../runtimes/runtime-registry.js";
import { requireOfficeCli } from "../toolchains/officecli.js";
import { EventHub } from "../ws/event-hub.js";

export class DocumentService {
  private readonly runtimes = createRuntimeProviderRegistry();
  private readonly cancelledRunIds = new Set<string>();
  private readonly runAssistantMessageIds = new Map<string, string>();
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
    return {
      ...snapshot,
      templates: documentTemplates,
    };
  }

  interruptActiveRuns(reason = "Interrupted by server restart") {
    return this.repo.interruptActiveRuns(reason);
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
    const template = getTemplate(input.templateId);
    const type = input.type ?? "html";
    if (type === "docx") await requireOfficeCli();
    const templateProjectSeed = type === "html" && input.templateId && !input.content
      ? await loadTemplateProjectSeed(input.templateId)
      : null;
    const content = input.content ?? templateProjectSeed?.content ?? defaultProjectContent(type, template);
    const templateId = input.templateId ?? (template.id === "blank" ? null : template.id);
    const templateName = input.templateName ?? templateProjectSeed?.name ?? (template.id === "blank" ? null : template.name);
    const project = this.repo.createProject({
      title: input.title?.trim() || input.templateName?.trim() || templateProjectSeed?.name || template.name || "Untitled Doc",
      content,
      type,
      templateId,
      templateName,
    });
    if (type === "html" && templateId && templateProjectSeed) {
      await materializeTemplateAssetsToProject(templateId, join(projectWorkspaceRoot(project.id), "assets"), content);
    }
    this.events.emit({ type: "project.created", projectId: project.id, payload: { project } });
    return { project };
  }

  async importProjectFile(input: { fileName: string; mimeType: string; bytes: Buffer }) {
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
    const project = this.repo.createProject({
      title: importedProjectTitle(input.fileName),
      content,
      type,
      templateId: null,
      templateName: null,
    });
    if (type === "docx") {
      await writeFile(docxFilePath(project.id), input.bytes);
    }
    this.events.emit({ type: "project.created", projectId: project.id, payload: { project } });
    return { project };
  }

  getProject(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return { project };
  }

  async getDocxFile(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (project.type !== "docx") throw new Error("Project is not a DOCX doc");
    const bytes = await readFile(docxFilePath(projectId));
    return {
      bytes,
      fileName: docxFileName,
      mimeType: docxMimeType,
    };
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

  updateProject(projectId: string, input: UpdateProjectRequest) {
    const project = this.repo.updateProject(projectId, input);
    if (!project) return null;
    this.events.emit({ type: "project.updated", projectId, payload: { project } });
    return { project };
  }

  setProjectTitle(projectId: string, title: string, updatedBy: DocumentProject["updatedBy"] = "ai") {
    const project = this.repo.updateProject(projectId, { title, updatedBy });
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

  async writeProjectExport(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (project.type !== "html" && project.type !== "markdown") throw new Error("Exports are currently supported for HTML and Markdown docs only");
    if (!isSupportedExportMimeType(input.mimeType)) throw new Error("Only HTML, Markdown, DOCX, and PDF exports are supported");
    if (input.bytes.byteLength === 0) throw new Error("Export file is empty");
    if (input.bytes.byteLength > maxProjectExportBytes) throw new Error("Export file is too large");
    return this.repo.writeProjectExport(projectId, input);
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
    this.repo.syncProjectAgentInstructions(projectId);
    const runtimeProfile = this.repo.getRuntimeProfile(request.runtimeProfileId);
    const provider = this.runtimes.getProvider(runtimeProfile);
    const descriptor = provider.describeRun(runtimeProfile);
    const session = this.repo.ensureConversationSession(projectId, project.title);
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
    const profile = this.repo.getRuntimeProfileForRun(run);
    await this.runtimes.getProvider(profile).cancel(runId).catch(() => undefined);
    return this.finalizeCancellation(runId, "Cancelled by user");
  }

  private async executeRun(
    initialProject: DocumentProject,
    runtimeProfile: RuntimeProfile,
    request: AiEditRequest,
    runId: string,
    conversation: { assistantMessageId: string; sessionId: string },
  ) {
    let refreshedFromWorkspace = false;

    await this.runExecutor.execute({
      project: initialProject,
      request,
      runtimeProfile,
      runId,
      conversation: { conversationId: initialProject.id, sessionId: conversation.sessionId },
      history: this.repo.conversationHistory(conversation.sessionId, request.userPrompt),
      isCancelled: () => this.cancelledRunIds.has(runId),
      finalizeCancellation: (id, reason) => this.finalizeCancellation(id, reason),
      onWorkspaceEvent: async () => {
        refreshedFromWorkspace = Boolean(await this.refreshProjectFromWorkspace(initialProject.id, runId)) || refreshedFromWorkspace;
      },
      complete: async ({ generatedText }) => {
        refreshedFromWorkspace = Boolean(await this.refreshProjectFromWorkspace(initialProject.id, runId)) || refreshedFromWorkspace;
        const finalRun = await this.completeRun(initialProject, runtimeProfile, runId, generatedText, refreshedFromWorkspace);
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

  private completeMarkdownRun(initialProject: DocumentProject, runId: string, generatedText: string, refreshedFromWorkspace: boolean) {
    const finalMarkdown = extractMarkdownDocument(generatedText);
    let project = this.repo.getProject(initialProject.id);
    if (!refreshedFromWorkspace && finalMarkdown) {
      project = this.repo.updateProject(initialProject.id, {
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

  private completeHtmlRun(initialProject: DocumentProject, runId: string, generatedText: string, refreshedFromWorkspace: boolean) {
    const finalHtml = extractHtmlDocument(generatedText);
    let project = this.repo.getProject(initialProject.id);
    if (!refreshedFromWorkspace && finalHtml) {
      project = this.repo.updateProject(initialProject.id, {
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
    const finalRun = this.repo.updateRun(runId, { status: "completed", resultPreview });
    this.events.emit({ type: "run.completed", projectId, runId, payload: { run: finalRun } });
    return finalRun;
  }

  private async finalizeCancellation(runId: string, reason: string) {
    const run = this.repo.getRun(runId);
    if (!run) return null;
    const finalRun = this.repo.updateRun(runId, { status: "cancelled", error: reason }) ?? run;
    this.events.emit({ type: "run.cancelled", projectId: run.projectId, runId, payload: { run: finalRun } });
    const assistantMessageId = this.runAssistantMessageIds.get(runId);
    if (assistantMessageId) {
      this.repo.updateConversationMessage(assistantMessageId, {
        content: `Run cancelled: ${reason}`,
        metadata: { status: "cancelled", runId },
      });
    }
    this.cancelledRunIds.delete(runId);
    return { run: finalRun };
  }

  private async refreshProjectFromWorkspace(projectId: string, runId?: string) {
    const project = this.repo.getProject(projectId);
    if (!project) return null;
    if (project.type === "html") return this.refreshTextProjectFromFile(project, "document.html", runId);
    if (project.type === "markdown") return this.refreshTextProjectFromFile(project, "document.md", runId);
    return this.refreshDocxProjectFromFile(project, runId);
  }

  private async refreshTextProjectFromFile(project: DocumentProject, fileName: string, runId?: string) {
    let content = "";
    try {
      content = await readFile(join(projectWorkspaceRoot(project.id), fileName), "utf8");
    } catch {
      return null;
    }
    if (content === project.content) return null;
    const updated = this.repo.updateProject(project.id, {
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
    const updated = this.repo.updateProject(project.id, {
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
const maxProjectAssetBytes = 30 * 1024 * 1024;
const maxProjectExportBytes = 20 * 1024 * 1024;
const maxProjectImportBytes = 30 * 1024 * 1024;
const supportedProjectAssetMimeTypes = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
]);
const supportedProjectAssetExtensions = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".gif",
  ".htm",
  ".html",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".markdown",
  ".odt",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".rtf",
  ".svg",
  ".txt",
  ".webp",
  ".xls",
  ".xlsx",
]);
const supportedExportMimeTypes = new Set(["text/html", "text/markdown", docxMimeType, pdfMimeType]);

function docxFilePath(projectId: string) {
  return join(projectWorkspaceRoot(projectId), docxFileName);
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
  const decodedName = fileName.trim() || "Imported doc";
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

function renderTemplateSeed(template: DocumentTemplate) {
  if (template.category === "Career") return renderCareerTemplate(template);
  if (template.category === "Business") return renderBusinessTemplate(template);
  if (template.category === "Research") return renderResearchTemplate(template);
  if (template.category === "Legal") return renderLegalTemplate(template);
  if (template.category === "Financial") return renderInvoiceTemplate(template);
  return renderCreativeTemplate(template);
}

function renderTemplateShell(template: DocumentTemplate, body: string, extraCss = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(template.name)}</title>
  <style>
    body {
      max-width: 820px;
      margin: 0 auto;
      padding: 56px 72px 96px;
      color: #263238;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.62;
    }
    h1 { margin: 0 0 18px; font-size: 34px; line-height: 1.15; letter-spacing: 0; }
    h2 { margin: 30px 0 10px; font-size: 20px; letter-spacing: 0; }
    p { margin: 0 0 14px; }
    .eyebrow { color: #667085; font-size: 12px; font-weight: 700; letter-spacing: .16em; margin: 0 0 10px; text-transform: uppercase; }
    .muted { color: #667085; }
    .rule { border-top: 1px solid #d0d5dd; margin: 24px 0; }
    .grid-2 { display: grid; gap: 24px; grid-template-columns: 1fr 1fr; }
    .section { margin-top: 26px; }
    .pill { background: #eef2f6; border-radius: 999px; display: inline-block; font-size: 13px; margin: 0 8px 8px 0; padding: 6px 10px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #e4e7ec; padding: 10px 0; text-align: left; }
    th { color: #667085; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; }
    ${extraCss}
  </style>
</head>
<body contenteditable="true">
${body}
</body>
</html>`;
}

function renderCareerTemplate(template: DocumentTemplate) {
  const name = escapeHtml(template.name);
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Resume</p>
  <h1>${name}</h1>
  <p class="muted">Product strategist · New York · emily@example.com · (555) 010-2048</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="summary">
    <h2>Profile</h2>
    <p>Accomplished cross-functional operator with experience turning ambiguous business goals into clear product, research, and launch plans.</p>
  </section>
  <section class="section" data-ai-region="experience">
    <h2>Experience</h2>
    <p><strong>Senior Product Manager, Northstar Labs</strong><br><span class="muted">2021 - Present</span></p>
    <p>Led roadmap planning, customer research, and executive reporting for a collaborative AI workflow product.</p>
    <p><strong>Strategy Associate, Meridian Studio</strong><br><span class="muted">2018 - 2021</span></p>
    <p>Built market analysis, operating plans, and launch briefs for enterprise software clients.</p>
  </section>
  <section class="grid-2 section">
    <div data-ai-region="education">
      <h2>Education</h2>
      <p><strong>State University</strong><br><span class="muted">B.A. Economics</span></p>
    </div>
    <div data-ai-region="skills">
      <h2>Skills</h2>
      <span class="pill">Research</span><span class="pill">Roadmapping</span><span class="pill">Analytics</span><span class="pill">Writing</span>
    </div>
  </section>`,
    `h1 { font-size: 42px; } h2 { color: #315c59; font-size: 15px; letter-spacing: .12em; text-transform: uppercase; }`,
  );
}

function renderBusinessTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">${template.id.includes("letter") ? "Client Letter" : "Business Proposal"}</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Prepared for client review</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="overview">
    <h2>Executive Summary</h2>
    <p>This doc outlines the objective, proposed approach, timeline, and next steps for a focused business initiative.</p>
  </section>
  <section class="grid-2 section">
    <div data-ai-region="scope">
      <h2>Scope</h2>
      <p>Discovery, planning, delivery coordination, and a concise implementation handoff.</p>
    </div>
    <div data-ai-region="timeline">
      <h2>Timeline</h2>
      <p>Phase 1: discovery<br>Phase 2: draft<br>Phase 3: delivery</p>
    </div>
  </section>
  <section class="section" data-ai-region="next_steps">
    <h2>Next Steps</h2>
    <p>Confirm goals, assign owners, and schedule the first review checkpoint.</p>
  </section>`,
  );
}

function renderResearchTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Research Brief</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Findings, implications, and recommended actions</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="context">
    <h2>Context</h2>
    <p>This brief summarizes the current state, key evidence, and practical implications for decision makers.</p>
  </section>
  <section class="section" data-ai-region="findings">
    <h2>Key Findings</h2>
    <ul>
      <li>The strongest signal is concentrated around repeat usage and workflow fit.</li>
      <li>Teams need clearer handoffs between analysis, writing, and review.</li>
      <li>Near-term opportunities are actionable with limited engineering risk.</li>
    </ul>
  </section>
  <section class="section" data-ai-region="recommendations">
    <h2>Recommendations</h2>
    <p>Prioritize a focused pilot, validate success metrics, and revisit scope after the first review cycle.</p>
  </section>`,
  );
}

function renderLegalTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Agreement</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Draft for review</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="parties">
    <h2>1. Parties</h2>
    <p>This agreement is entered into by and between Client and Service Provider.</p>
  </section>
  <section class="section" data-ai-region="scope">
    <h2>2. Scope of Services</h2>
    <p>Service Provider will perform the services described in the attached statement of work.</p>
  </section>
  <section class="section" data-ai-region="payment">
    <h2>3. Payment Terms</h2>
    <p>Client will pay fees according to the agreed milestone schedule.</p>
  </section>
  <section class="grid-2 section" data-ai-region="signature">
    <div><p><strong>Client</strong></p><p>Signature: __________________</p></div>
    <div><p><strong>Service Provider</strong></p><p>Signature: __________________</p></div>
  </section>`,
  );
}

function renderInvoiceTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Invoice</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Invoice #INV-2026-001 · Due on receipt</p>
  <div class="rule"></div>
  <section class="grid-2 section">
    <div data-ai-region="vendor"><h2>From</h2><p>Northstar Studio<br>billing@example.com</p></div>
    <div data-ai-region="client"><h2>Bill To</h2><p>Client Name<br>client@example.com</p></div>
  </section>
  <section class="section" data-ai-region="line_items">
    <table>
      <thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Strategy and doc production</td><td>1</td><td>$2,400</td></tr>
        <tr><td>Review and revisions</td><td>1</td><td>$600</td></tr>
        <tr><td><strong>Total</strong></td><td></td><td><strong>$3,000</strong></td></tr>
      </tbody>
    </table>
  </section>`,
  );
}

function renderCreativeTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Plan</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Overview, audience, schedule, and execution notes</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="overview">
    <h2>Overview</h2>
    <p>A concise plan that frames the goal, intended audience, creative direction, and success metrics.</p>
  </section>
  <section class="grid-2 section">
    <div data-ai-region="audience"><h2>Audience</h2><p>Primary stakeholders, customers, or event participants.</p></div>
    <div data-ai-region="timeline"><h2>Timeline</h2><p>Milestones, checkpoints, and delivery dates.</p></div>
  </section>
  <section class="section" data-ai-region="actions">
    <h2>Action Items</h2>
    <ul><li>Confirm owner and deadline.</li><li>Draft assets and review materials.</li><li>Prepare final handoff.</li></ul>
  </section>`,
  );
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

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
