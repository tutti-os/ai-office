import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
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

export class DocumentRepository {
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
    normalize: (database) => {
      database
        .prepare(`UPDATE runtime_profiles SET model = 'codex:default', updated_at = ? WHERE id = 'local-agent:codex' AND model = 'codex:gpt-5'`)
        .run(new Date().toISOString());
    },
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

  createProject(input: { title: string; content: string; type: DocumentProject["type"]; templateId: string | null; templateName: string | null }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    ensureProjectDirs(id);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, type, content, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'system', ?, ?)`,
      )
      .run(id, input.title, input.type, input.content, input.templateId, input.templateName, now, now);
    const project = this.getProject(id);
    if (!project) throw new Error("Unable to create project");
    this.materializeProject(project);
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

  updateProject(projectId: string, input: UpdateProjectRequest) {
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
    if (updated) this.materializeProject(updated);
    return updated;
  }

  updateProjectSessionTitle(projectId: string, title: string) {
    return this.conversations.updateProjectSessionTitle(projectId, title);
  }

  async writeProjectAsset(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const root = ensureProjectDirs(projectId);
    const assetsDir = join(root, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const fileName = uniqueAssetFileName(assetsDir, input.fileName, input.mimeType);
    writeFileSync(join(assetsDir, fileName), input.bytes);
    this.writeProjectAgentInstructions(project);
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
    return writeContextAttachmentFile(ensureProjectDirs(projectId), input);
  }

  async writeProjectExport(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const root = ensureProjectDirs(projectId);
    const exportsDir = join(root, "exports");
    mkdirSync(exportsDir, { recursive: true });
    const fileName = uniqueExportFileName(exportsDir, input.fileName, input.mimeType);
    const absolutePath = join(exportsDir, fileName);
    writeFileSync(absolutePath, input.bytes);
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

  syncProjectAgentInstructions(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) return null;
    this.writeProjectAgentInstructions(project);
    return project;
  }

  setProjectTemplate(projectId: string, template: { id: string; name: string }) {
    getDb().prepare(`UPDATE projects SET template_id = ?, template_name = ? WHERE id = ?`).run(template.id, template.name, projectId);
    return this.getProject(projectId);
  }

  createRun(input: {
    projectId: string;
    runtime: string;
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

  getRun(runId: string) {
    return this.runs.getRun(runId);
  }

  listProjectRuns(projectId: string) {
    return this.runs.listProjectRuns(projectId);
  }

  updateRun(runId: string, input: Partial<Pick<DocumentRun, "status" | "error" | "resultPreview">>) {
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

  getRuntimeProfileForRun(run: Pick<DocumentRun, "runtime" | "provider" | "model">) {
    return this.runtimeProfiles.getForRun(run);
  }

  getDefaultRuntimeProfile() {
    return this.runtimeProfiles.getDefault();
  }

  private materializeProject(project: DocumentProject) {
    const root = ensureProjectDirs(project.id);
    if (project.type === "docx") {
      writeFileSync(join(root, "document.json"), project.content || JSON.stringify(createEmptyDocxDocumentManifest()), "utf8");
    } else if (project.type === "markdown") {
      writeFileSync(join(root, "document.md"), project.content, "utf8");
    } else {
      writeFileSync(join(root, "document.html"), project.content, "utf8");
    }
    this.writeProjectAgentInstructions(project);
  }

  private writeProjectAgentInstructions(project: DocumentProject) {
    const root = ensureProjectDirs(project.id);
    writeFileSync(join(root, "AGENTS.md"), projectAgentInstructions(project), "utf8");
  }
}

function projectAgentInstructions(project: DocumentProject) {
  if (project.type === "docx") return docxProjectAgentInstructions(project);
  if (project.type === "markdown") return markdownProjectAgentInstructions(project);
  return htmlProjectAgentInstructions(project);
}

function htmlProjectAgentInstructions(project: DocumentProject) {
  const targetHtmlPath = join(projectWorkspaceRoot(project.id), "document.html");
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a rich HTML doc with the local AI Doc app.",
    `Current focused file: ${targetHtmlPath}`,
    "Read and edit the focused file directly with filesystem tools. The app watches workspace files and refreshes the preview when content changes.",
    stagedProjectWriteInstructions("HTML"),
    projectAssetInstructions(project.id),
  ].join("\n");
}

function markdownProjectAgentInstructions(project: DocumentProject) {
  const targetMarkdownPath = join(projectWorkspaceRoot(project.id), "document.md");
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a Markdown doc with the local AI Doc app.",
    `Current focused file: ${targetMarkdownPath}`,
    `Place local image assets under ${join(projectWorkspaceRoot(project.id), "assets")} and reference them from Markdown as ./assets/<file-name>.`,
    "Read and edit the focused file directly with filesystem tools. The app watches workspace files and refreshes the preview when content changes.",
    stagedProjectWriteInstructions("Markdown"),
    projectAssetInstructions(project.id),
  ].join("\n");
}

function docxProjectAgentInstructions(project: DocumentProject) {
  const targetDocxPath = join(projectWorkspaceRoot(project.id), "document.docx");
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a Word doc project with the local AI Doc app.",
    `Current focused file: ${targetDocxPath}`,
    "When you create or edit the Word doc, write the final result to the focused file with filesystem tools.",
    "The app watches that file and refreshes the preview when its content changes.",
    projectAssetInstructions(project.id),
  ].join("\n");
}

function projectAssetInstructions(projectId: string) {
  const assets = listProjectAssets(projectId);
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

function mimeTypeForAssetFileName(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".md" || extension === ".markdown") return "text/markdown";
  if (extension === ".csv") return "text/csv";
  if (extension === ".html" || extension === ".htm") return "text/html";
  if (extension === ".json") return "application/json";
  if (extension === ".rtf") return "application/rtf";
  if (extension === ".doc") return "application/msword";
  if (extension === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === ".xls") return "application/vnd.ms-excel";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === ".ppt") return "application/vnd.ms-powerpoint";
  if (extension === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "text/plain";
}

function listProjectAssets(projectId: string) {
  const assetsDir = join(projectWorkspaceRoot(projectId), "assets");
  if (!existsSync(assetsDir)) return [];
  return readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolutePath = join(assetsDir, entry.name);
      return {
        fileName: entry.name,
        path: projectAssetRelativePath(entry.name),
        mimeType: mimeTypeForAssetFileName(entry.name),
        sizeBytes: statSync(absolutePath).size,
      };
    });
}

function projectAssetRelativePath(fileName: string) {
  return `./assets/${fileName}`;
}

function rows<TRow>(value: unknown): TRow[] {
  return value as TRow[];
}

function rowOrNull<TRow>(value: unknown): TRow | null {
  return (value ?? null) as TRow | null;
}
