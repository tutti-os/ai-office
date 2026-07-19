import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, extname, join } from "node:path";
import {
  type DocumentProject,
  type DocumentRun,
  type DocumentRunEvent,
  type UpdateProjectRequest,
} from "@ai-doc/shared";
import { defaultRuntimeProfiles, RuntimeProfileStore, SqliteAgentConversationStore, SqliteRunStore } from "@ai-app/shared/project-store";
import { asProjectPreparationError, SqliteProjectPreparationCoordinator } from "@ai-app/shared/project-preparation";
import { writeContextAttachmentFile } from "@ai-app/shared/server-files";
import { getDb } from "../db/database.js";
import { appPaths, ensureBaseDirs, ensureProjectDirs, projectWorkspaceRoot } from "../local/paths.js";
import { invalidateProjectAssetCache, mimeTypeForAssetFileName, projectAssetRelativePath } from "./project-assets.js";
import { insertDocumentProject } from "./document-persistence.js";
import { documentAgentContextVersion, materializeDocumentProjectCore, prepareDocumentAgentContext } from "./document-preparation.js";
export class DocumentRepository {
  private readonly preparation = new SqliteProjectPreparationCoordinator(getDb, "ai-doc");
  private readonly conversations = new SqliteAgentConversationStore(getDb, {
    createSessionId: randomUUID,
    createMessageId: randomUUID,
  });
  private readonly runs = new SqliteRunStore<DocumentRun, DocumentRunEvent>(getDb, {
    runsTable: "document_runs",
    eventsTable: "document_run_events",
    createRunId: randomUUID,
    createEventId: randomUUID,
  });
  private readonly runtimeProfiles = new RuntimeProfileStore(getDb, {
    defaultProfiles: defaultRuntimeProfiles({
      demoModel: "html-demo",
      demoDisplayName: "Demo HTML editor",
    }),
  });

  ensureSeedData() {
    this.runtimeProfiles.ensureSeedData();
  }

  interruptActiveRuns(reason: string) {
    return this.runs.interruptActiveRuns(reason);
  }

  snapshot() {
    const db = getDb();
    return {
      projects: rows<ProjectRow>(db.prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject),
      runtimeProfiles: this.runtimeProfiles.list(),
      activeRuns: this.runs.listActiveRuns(),
      runEvents: this.runs.listRecentRunEvents(),
      lastSeq: (db.prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM stream_events`).get() as { seq: number }).seq,
    };
  }

  async createProject(input: { title: string; content: string; type: DocumentProject["type"]; templateId: string | null; templateName: string | null }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    insertDocumentProject(getDb(), {
      id,
      title: input.title,
      type: input.type,
      content: input.content,
      templateId: input.templateId,
      templateName: input.templateName,
      now,
    });
    const project = this.getProject(id);
    if (!project) throw new Error("Unable to create project");
    try {
      await this.materializeProjectCore(project);
      this.preparation.markCore(project.id, "ready");
    } catch (error) {
      const failure = asProjectPreparationError(error, "core_materialization", this.documentPath(project));
      this.preparation.markCore(project.id, "failed", failure);
      throw failure;
    }
    this.startAgentContextPreparation(project);
    return project;
  }

  listProjects() {
    return rows<ProjectRow>(getDb().prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject);
  }

  clearProjectHistory() {
    const db = getDb();
    db.exec(`
      DELETE FROM document_run_events;
      DELETE FROM document_runs;
      DELETE FROM agent_conversation_messages;
      DELETE FROM agent_conversation_sessions;
      DELETE FROM stream_events;
      DELETE FROM projects;
    `);
    rmSync(appPaths.projectsDir, { force: true, recursive: true });
    invalidateProjectAssetCache();
    ensureBaseDirs();
    return { projects: [] as DocumentProject[] };
  }

  deleteProject(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare(`DELETE FROM agent_conversation_messages WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM agent_conversation_sessions WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM document_run_events WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM document_runs WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM stream_events WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    rmSync(projectWorkspaceRoot(projectId), { force: true, recursive: true });
    invalidateProjectAssetCache(projectId);
    return { projects: this.listProjects() };
  }

  getProject(projectId: string) {
    const row = rowOrNull<ProjectRow>(getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId));
    return row ? rowToProject(row) : null;
  }

  getProjectPreparation(projectId: string) {
    return this.preparation.getStatus(projectId);
  }

  async updateProject(projectId: string, input: UpdateProjectRequest) {
    const current = this.getProject(projectId);
    if (!current) return null;
    const now = new Date().toISOString();
    const next = {
      title: input.title === undefined ? current.title : input.title.trim() || current.title,
      type: input.type ?? current.type,
      content: input.content ?? current.content,
      updatedBy: input.updatedBy ?? "human",
    };
    getDb()
      .prepare(
        `UPDATE projects
         SET title = ?, type = ?, content = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(next.title, next.type, next.content, next.updatedBy, now, projectId);
    const updated = this.getProject(projectId);
    const coreNeedsRepair = this.preparation.getStatus(projectId)?.coreState !== "ready";
    if (updated && (next.content !== current.content || next.type !== current.type || coreNeedsRepair)) {
      this.preparation.markCore(projectId, "preparing");
      try {
        await this.materializeProjectCore(updated);
        this.preparation.markCore(projectId, "ready");
      } catch (error) {
        const failure = asProjectPreparationError(error, "core_materialization", this.documentPath(updated));
        this.preparation.markCore(projectId, "failed", failure);
        throw failure;
      }
      this.preparation.invalidateAgentContext(projectId);
      this.startAgentContextPreparation(updated);
    }
    return updated;
  }

  updateProjectSessionTitle(projectId: string, title: string) {
    return this.conversations.updateProjectSessionTitle(projectId, title);
  }

  async writeProjectAsset(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const root = projectWorkspaceRoot(projectId);
    const assetsDir = join(root, "assets");
    await mkdir(assetsDir, { recursive: true });
    const fileName = uniqueAssetFileName(assetsDir, input.fileName, input.mimeType);
    await writeFile(join(assetsDir, fileName), input.bytes);
    invalidateProjectAssetCache(projectId);
    this.preparation.invalidateAgentContext(projectId);
    this.startAgentContextPreparation(project);
    return {
      path: projectAssetRelativePath(fileName),
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    };
  }

  async writeContextAttachment(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const root = projectWorkspaceRoot(projectId);
    await mkdir(root, { recursive: true });
    return writeContextAttachmentFile(root, input);
  }

  async writeProjectExport(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const root = projectWorkspaceRoot(projectId);
    const exportsDir = join(root, "exports");
    await mkdir(exportsDir, { recursive: true });
    const fileName = uniqueExportFileName(exportsDir, input.fileName, input.mimeType);
    const absolutePath = join(exportsDir, fileName);
    await writeFile(absolutePath, input.bytes);
    return {
      path: absolutePath,
      absolutePath,
      exportsDir,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    };
  }

  async readProjectAsset(projectId: string, fileName: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const safeName = safeAssetFileName(fileName, "application/octet-stream");
    if (safeName !== fileName) throw new Error("Asset not found");
    const bytes = await readFile(join(projectWorkspaceRoot(projectId), "assets", safeName));
    return {
      bytes,
      fileName: safeName,
      mimeType: mimeTypeForAssetFileName(safeName),
    };
  }

  projectExportsDir(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return join(ensureProjectDirs(projectId), "exports");
  }

  async syncProjectAgentInstructions(projectId: string, options: { force?: boolean } = {}) {
    const project = this.getProject(projectId);
    if (!project) return null;
    if (options.force) this.preparation.invalidateAgentContext(projectId);
    await this.ensureAgentContextReady(projectId);
    return project;
  }

  async ensureAgentContextReady(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    await this.preparation.ensureAgentContext({
      projectId,
      baseVersion: this.agentContextBaseVersion(project),
      prepare: () => this.writeProjectAgentInstructions(project),
    });
    return project;
  }

  invalidateAndStartAgentContext(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) return;
    this.preparation.invalidateAgentContext(projectId);
    this.startAgentContextPreparation(project);
  }

  setProjectTemplate(projectId: string, template: { id: string; name: string }) {
    getDb().prepare(`UPDATE projects SET template_id = ?, template_name = ? WHERE id = ?`).run(template.id, template.name, projectId);
    return this.getProject(projectId);
  }

  createRun(input: {
    projectId: string;
    runtime: string;
    agentTargetId: string | null;
    provider: string;
    model: string;
    mode: string;
    instruction: string;
    selectionType: string;
    selectionPath: string;
    selectedText: string;
    selectedHtml: string;
  }) {
    return this.runs.createRun(input);
  }

  ensureConversationSession(projectId: string, title?: string) {
    return this.conversations.ensureProjectSession(projectId, title);
  }

  createConversationSession(projectId: string, title?: string) {
    return this.conversations.createProjectSession(projectId, title);
  }

  listConversationSessions(projectId: string) {
    return this.conversations.listProjectSessions(projectId);
  }

  createConversationMessage(input: {
    projectId: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    metadata?: Record<string, unknown> | null;
  }) {
    return this.conversations.createMessage(input);
  }

  updateConversationMessage(messageId: string, input: { content?: string; metadata?: Record<string, unknown> | null }) {
    return this.conversations.updateMessage(messageId, input);
  }

  conversationHistory(sessionId: string, currentPrompt: string) {
    return this.conversations.normalizedHistory({ sessionId, currentPrompt });
  }

  listConversationMessages(sessionId: string) {
    return this.conversations.listSessionMessages(sessionId);
  }

  getRun(runId: string) {
    return this.runs.getRun(runId);
  }

  listProjectRuns(projectId: string) {
    return this.runs.listProjectRuns(projectId);
  }

  updateRun(runId: string, input: Partial<Pick<DocumentRun, "status" | "error" | "resultPreview" | "agentTargetId" | "provider" | "model">>) {
    return this.runs.updateRun(runId, input);
  }

  createRunEvent(input: {
    runId: string;
    projectId: string;
    type: DocumentRunEvent["type"];
    content?: string;
    status?: DocumentRunEvent["status"];
    metadata?: Record<string, unknown> | null;
    sortOrder: number;
  }) {
    return this.runs.createRunEvent(input);
  }

  listRunEvents(runId: string) {
    return this.runs.listRunEvents(runId);
  }

  getRuntimeProfile(profileId: string | null | undefined) {
    return this.runtimeProfiles.get(profileId);
  }

  getLocalAgentRuntimeProfileByTarget(agentTargetId: string) {
    return this.runtimeProfiles.getLocalAgentByTarget(agentTargetId);
  }

  getRuntimeProfileForRun(run: Pick<DocumentRun, "runtime" | "agentTargetId" | "provider" | "model">) {
    return this.runtimeProfiles.getForRun(run);
  }

  getDefaultRuntimeProfile() {
    return this.runtimeProfiles.getDefault();
  }

  syncLocalAgentRuntimeProfiles(agents: Array<{ agentTargetId: string; providerId: string; displayName: string; supported: boolean }>) {
    this.runtimeProfiles.syncLocalAgentRuntimeProfiles(agents);
  }

  private async materializeProjectCore(project: DocumentProject) {
    const root = projectWorkspaceRoot(project.id);
    await materializeDocumentProjectCore(root, project);
  }
  private async writeProjectAgentInstructions(project: DocumentProject) {
    const root = projectWorkspaceRoot(project.id);
    await prepareDocumentAgentContext(root, project);
  }

  private startAgentContextPreparation(project: DocumentProject) {
    this.preparation.startAgentContext({
      projectId: project.id,
      baseVersion: this.agentContextBaseVersion(project),
      fallbackPath: projectWorkspaceRoot(project.id),
      prepare: () => this.writeProjectAgentInstructions(project),
    });
  }

  private documentPath(project: DocumentProject) {
    const fileName = project.type === "docx" ? "document.json" : project.type === "markdown" ? "document.md" : "document.html";
    return join(projectWorkspaceRoot(project.id), fileName);
  }

  private agentContextBaseVersion(project: DocumentProject) {
    return documentAgentContextVersion(project);
  }
}

interface ProjectRow {
  id: string;
  title: string;
  type: "html" | "markdown" | "docx";
  content: string;
  template_id: string | null;
  template_name: string | null;
  updated_by: "human" | "ai" | "system";
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): DocumentProject {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    content: row.content,
    templateId: row.template_id,
    templateName: row.template_name,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function uniqueAssetFileName(assetsDir: string, requestedName: string, mimeType: string) {
  const safeName = safeAssetFileName(requestedName, mimeType);
  const extension = extname(safeName);
  const stem = basename(safeName, extension) || "image";
  let candidate = safeName;
  let index = 2;
  while (existsSync(join(assetsDir, candidate))) {
    candidate = `${stem}-${index}${extension}`;
    index += 1;
  }
  return candidate;
}

function uniqueExportFileName(exportsDir: string, requestedName: string, mimeType: string) {
  const safeName = safeExportFileName(requestedName, mimeType);
  const extension = extname(safeName);
  const stem = basename(safeName, extension) || "export";
  let candidate = safeName;
  let index = 2;
  while (existsSync(join(exportsDir, candidate))) {
    candidate = `${stem}-${index}${extension}`;
    index += 1;
  }
  return candidate;
}

function safeAssetFileName(fileName: string, mimeType: string) {
  const rawBase = safeBaseName(fileName || "asset");
  const extension = normalizedAssetExtension(rawBase, mimeType);
  const stem = safeFileStem(basename(rawBase, extname(rawBase)), "asset");
  return `${stem}${extension}`;
}

function safeExportFileName(fileName: string, mimeType: string) {
  const rawBase = safeBaseName(fileName || "export");
  const extension = normalizedExportExtension(rawBase, mimeType);
  const stem = safeFileStem(basename(rawBase, extname(rawBase)), "export");
  return `${stem}${extension}`;
}

function safeBaseName(value: string) {
  return basename(safeDecodeURIComponent(value));
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeFileStem(value: string, fallback: string) {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80) || fallback;
}

function normalizedAssetExtension(fileName: string, mimeType: string) {
  const extension = extname(fileName).toLowerCase();
  if ([
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
  ].includes(extension)) return extension;
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/svg+xml") return ".svg";
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "text/plain") return ".txt";
  if (mimeType === "text/markdown") return ".md";
  if (mimeType === "text/csv") return ".csv";
  if (mimeType === "text/html") return ".html";
  if (mimeType === "application/json") return ".json";
  if (mimeType === "application/rtf") return ".rtf";
  if (mimeType === "application/msword") return ".doc";
  if (mimeType === "application/vnd.ms-excel") return ".xls";
  if (mimeType === "application/vnd.ms-powerpoint") return ".ppt";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return ".pptx";
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return ".xlsx";
  return ".bin";
}

function normalizedExportExtension(fileName: string, mimeType: string) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".html" || extension === ".htm") return extension;
  if (extension === ".md" || extension === ".markdown") return extension;
  if (extension === ".docx") return extension;
  if (extension === ".pdf") return extension;
  if (mimeType === "text/markdown") return ".md";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (mimeType === "application/pdf") return ".pdf";
  return ".html";
}

function rows<TRow>(value: unknown): TRow[] {
  return value as TRow[];
}

function rowOrNull<TRow>(value: unknown): TRow | null {
  return (value ?? null) as TRow | null;
}
