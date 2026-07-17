import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, extname, join } from "node:path";
import {
  createEmptyDocxDocumentManifest,
  type DocumentProject,
  type DocumentRun,
  type DocumentRunEvent,
  type UpdateProjectRequest,
} from "@ai-doc/shared";
import { defaultRuntimeProfiles, RuntimeProfileStore, SqliteAgentConversationStore, SqliteRunStore } from "@ai-app/shared/project-store";
import { writeContextAttachmentFile } from "@ai-app/shared/server-files";
import { getDb } from "../db/database.js";
import { appPaths, ensureBaseDirs, ensureProjectDirs, projectWorkspaceRoot } from "../local/paths.js";
import { listProjectAssets, mimeTypeForAssetFileName, projectAssetRelativePath } from "./project-assets.js";
export class DocumentRepository {
  private readonly preparedAgentInstructions = new Map<string, string>();
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
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, type, content, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'system', ?, ?)`,
      )
      .run(id, input.title, input.type, input.content, input.templateId, input.templateName, now, now);
    const project = this.getProject(id);
    if (!project) throw new Error("Unable to create project");
    await this.materializeProject(project);
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
    return { projects: this.listProjects() };
  }

  getProject(projectId: string) {
    const row = rowOrNull<ProjectRow>(getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId));
    return row ? rowToProject(row) : null;
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
    if (updated && (next.content !== current.content || next.type !== current.type)) {
      await this.materializeProject(updated);
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
    this.preparedAgentInstructions.delete(projectId);
    await this.writeProjectAgentInstructions(project);
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
    if (options.force) this.preparedAgentInstructions.delete(projectId);
    await this.writeProjectAgentInstructions(project);
    return project;
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

  private async materializeProject(project: DocumentProject) {
    const root = projectWorkspaceRoot(project.id);
    await mkdir(root, { recursive: true });
    let documentWrite: Promise<void>;
    if (project.type === "docx") {
      documentWrite = writeFile(join(root, "document.json"), project.content || JSON.stringify(createEmptyDocxDocumentManifest()), "utf8");
    } else if (project.type === "markdown") {
      documentWrite = writeFile(join(root, "document.md"), project.content, "utf8");
    } else {
      documentWrite = writeFile(join(root, "document.html"), project.content, "utf8");
    }
    await Promise.all([documentWrite, this.writeProjectAgentInstructions(project)]);
  }
  private async writeProjectAgentInstructions(project: DocumentProject) {
    const preparationRevision = `${project.updatedAt}:${project.type}`;
    if (this.preparedAgentInstructions.get(project.id) === preparationRevision) return;
    const root = projectWorkspaceRoot(project.id);
    await mkdir(root, { recursive: true });
    const path = join(root, "AGENTS.md");
    const content = await projectAgentInstructions(project);
    const current = await readFile(path, "utf8").catch(() => null);
    if (current !== content) await writeFile(path, content, "utf8");
    this.preparedAgentInstructions.set(project.id, preparationRevision);
  }
}

async function projectAgentInstructions(project: DocumentProject) {
  if (project.type === "docx") return docxProjectAgentInstructions(project);
  if (project.type === "markdown") return markdownProjectAgentInstructions(project);
  return htmlProjectAgentInstructions(project);
}

async function htmlProjectAgentInstructions(project: DocumentProject) {
  const targetHtmlPath = join(projectWorkspaceRoot(project.id), "document.html");
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a rich HTML doc with the local AI Doc app.",
    `Current focused file: ${targetHtmlPath}`,
    artifactIntentInstructions("document"),
    "When the current request calls for document changes, read and edit the focused file directly with filesystem tools. The app watches workspace files and refreshes the preview when content changes.",
    stagedProjectWriteInstructions("HTML"),
    await projectAssetInstructions(project.id),
  ].join("\n");
}

async function markdownProjectAgentInstructions(project: DocumentProject) {
  const targetMarkdownPath = join(projectWorkspaceRoot(project.id), "document.md");
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a Markdown doc with the local AI Doc app.",
    `Current focused file: ${targetMarkdownPath}`,
    `Place local image assets under ${join(projectWorkspaceRoot(project.id), "assets")} and reference them from Markdown as ./assets/<file-name>.`,
    artifactIntentInstructions("document"),
    "When the current request calls for document changes, read and edit the focused file directly with filesystem tools. The app watches workspace files and refreshes the preview when content changes.",
    stagedProjectWriteInstructions("Markdown"),
    await projectAssetInstructions(project.id),
  ].join("\n");
}

async function docxProjectAgentInstructions(project: DocumentProject) {
  const targetDocxPath = join(projectWorkspaceRoot(project.id), "document.docx");
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a Word doc project with the local AI Doc app.",
    `Current focused file: ${targetDocxPath}`,
    artifactIntentInstructions("document"),
    "When the current request calls for creating or editing this Word doc, write the final result to the focused file with filesystem tools.",
    "The app watches that file and refreshes the preview when its content changes.",
    await projectAssetInstructions(project.id),
  ].join("\n");
}

function artifactIntentInstructions(artifactLabel: string) {
  return [
    `Treat the focused ${artifactLabel} as a workspace resource, not as an obligation to produce placeholder content.`,
    `Create or modify it only when the user's current request asks this app to produce, edit, convert, import into, export from, or otherwise update that artifact.`,
    "If the request is mainly to coordinate with tools or other apps, inspect context, answer a question, or continue work elsewhere, complete that request without changing the focused artifact just to leave something behind.",
  ].join("\n");
}

async function projectAssetInstructions(projectId: string) {
  const assets = await listProjectAssets(projectId);
  if (assets.length === 0) return "";
  return [
    "",
    "Project context attachments:",
    ...assets.map((asset) => `- ${asset.fileName} (${asset.mimeType}, ${asset.sizeBytes} bytes): ${asset.path}`),
    "Use these files as source context when they are relevant to the user's request.",
  ].join("\n");
}

function stagedProjectWriteInstructions(format: "HTML" | "Markdown") {
  const validity =
    format === "HTML"
      ? "Keep each saved intermediate version valid, self-contained, and previewable."
      : "Keep each saved intermediate version coherent, with balanced code fences, valid tables, and no dangling partial sections.";
  return `For large generations or broad rewrites, save useful progress in stages: write an initial scaffold or first complete sections, then continue expanding the focused file so progress is visible in the working file. ${validity}`;
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
