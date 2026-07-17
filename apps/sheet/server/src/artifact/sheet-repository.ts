import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";
import { existsSync, rmSync } from "node:fs";
import {
  createEmptyXlsxManifest,
  type CreateProjectRequest,
  type SheetArtifact,
  type SheetProject,
  type SheetRun,
  type SheetRunEvent,
  type UpdateProjectRequest,
  type XlsxManifest,
  xlsxArtifactFileRef,
  xlsxMimeType,
} from "@ai-sheet/shared";
import { defaultRuntimeProfiles, RuntimeProfileStore, SqliteAgentConversationStore, SqliteRunStore } from "@ai-app/shared/project-store";
import { writeContextAttachmentFile } from "@ai-app/shared/server-files";
import { SqliteProjectPreparationCoordinator } from "@ai-app/shared/project-preparation";
import { getDb, rowOrNull, rows } from "../db/database.js";
import { appPaths, ensureBaseDirs, ensureProjectDirs, projectWorkspaceRoot } from "../local/paths.js";
import { withProjectImportCleanup } from "./project-import.js";

export class SheetRepository {
  private readonly preparation = new SqliteProjectPreparationCoordinator(getDb, "ai-sheet");
  private readonly conversations = new SqliteAgentConversationStore(getDb, {
    createSessionId: randomUUID,
    createMessageId: randomUUID,
  });
  private readonly runs = new SqliteRunStore<SheetRun, SheetRunEvent>(getDb, {
    runsTable: "sheet_runs",
    eventsTable: "sheet_run_events",
    createRunId: randomUUID,
    createEventId: randomUUID,
  });
  private readonly runtimeProfiles = new RuntimeProfileStore(getDb, {
    defaultProfiles: defaultRuntimeProfiles({
      demoModel: "sheet-demo",
      demoDisplayName: "Demo sheet editor",
    }),
  });

  ensureSeedData() {
    this.runtimeProfiles.ensureSeedData();
  }

  snapshot() {
    this.ensureSeedData();
    const db = getDb();
    return {
      projects: rows<ProjectRow>(db.prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject),
      artifacts: rows<ArtifactRow>(db.prepare(`SELECT * FROM artifacts ORDER BY updated_at DESC`).all()).map(rowToArtifact),
      runtimeProfiles: this.runtimeProfiles.list(),
      activeRuns: this.runs.listActiveRuns(),
      runEvents: this.runs.listRecentRunEvents(),
      lastSeq: (db.prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM stream_events`).get() as { seq: number }).seq,
    };
  }

  interruptActiveRuns(reason: string) {
    return this.runs.interruptActiveRuns(reason);
  }

  listProjects() {
    return rows<ProjectRow>(getDb().prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject);
  }

  getProject(projectId: string) {
    const row = rowOrNull<ProjectRow>(getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId));
    return row ? rowToProject(row) : null;
  }

  getArtifact(artifactId: string) {
    const row = rowOrNull<ArtifactRow>(getDb().prepare(`SELECT * FROM artifacts WHERE id = ?`).get(artifactId));
    return row ? rowToArtifact(row) : null;
  }

  getRuntimeProfile(profileId: string | null | undefined) {
    this.ensureSeedData();
    return this.runtimeProfiles.get(profileId);
  }

  getLocalAgentRuntimeProfileByTarget(agentTargetId: string) {
    this.ensureSeedData();
    return this.runtimeProfiles.getLocalAgentByTarget(agentTargetId);
  }

  getRuntimeProfileForRun(run: Pick<SheetRun, "runtime" | "agentTargetId" | "provider" | "model">) {
    this.ensureSeedData();
    return this.runtimeProfiles.getForRun(run);
  }

  syncLocalAgentRuntimeProfiles(agents: Array<{ agentTargetId: string; providerId: string; displayName: string; supported: boolean }>) {
    this.ensureSeedData();
    this.runtimeProfiles.syncLocalAgentRuntimeProfiles(agents);
  }

  async createProject(input: CreateProjectRequest = {}) {
    const id = randomUUID();
    const artifactId = randomUUID();
    const now = new Date().toISOString();
    const title = input.title?.trim() || "Untitled Workbook";
    await mkdir(projectWorkspaceRoot(id), { recursive: true });
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, active_artifact_id, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, 'system', ?, ?)`,
      )
      .run(id, title, artifactId, now, now);
    getDb().prepare(
      `INSERT OR IGNORE INTO project_preparation
       (project_id, core_state, agent_context_state, agent_context_generation, updated_at)
       VALUES (?, 'preparing', 'pending', 0, ?)`,
    ).run(id, now);
    getDb()
      .prepare(
        `INSERT INTO artifacts (id, project_id, type, file_ref, mime_type, revision, updated_by, created_at, updated_at)
         VALUES (?, ?, 'xlsx', ?, ?, 1, 'system', ?, ?)`,
      )
      .run(artifactId, id, xlsxArtifactFileRef, xlsxMimeType, now, now);
    const project = this.getProject(id);
    const artifact = this.getArtifact(artifactId);
    if (!project || !artifact) throw new Error("Unable to create project");
    return { project, artifact };
  }

  async importXlsxProjectFromFile(input: { sourcePath: string; title?: string }) {
    const sourcePath = resolve(input.sourcePath);
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) throw new Error("XLSX source is not a file");
    if (extname(sourcePath).toLowerCase() !== ".xlsx") throw new Error("XLSX source must end with .xlsx");
    const created = await this.createProject({
      title: input.title?.trim() || basename(sourcePath, extname(sourcePath)),
    });
    return withProjectImportCleanup({
      cleanup: () => { this.deleteProject(created.project.id); },
      importProject: async () => {
        await copyFile(sourcePath, xlsxFilePath(created.project.id));
        const xlsxManifest = await readXlsxManifestFromFile(created.project.id);
        const project = this.getProject(created.project.id);
        const artifact = this.getArtifact(created.artifact.id);
        if (!project || !artifact) throw new Error("Unable to import XLSX project");
        this.markProjectCoreReady(project.id);
        return { project, artifact, xlsxManifest };
      },
    });
  }

  async importXlsxProjectFromBytes(input: { title?: string; fileName: string; bytes: Buffer }) {
    if (input.bytes.byteLength === 0) throw new Error("XLSX file is empty");
    if (input.bytes.byteLength > maxXlsxImportBytes) throw new Error("XLSX file is too large");
    const created = await this.createProject({
      title: input.title?.trim() || importedProjectTitle(input.fileName),
    });
    return withProjectImportCleanup({
      cleanup: () => { this.deleteProject(created.project.id); },
      importProject: async () => {
        await writeFile(xlsxFilePath(created.project.id), input.bytes);
        const xlsxManifest = await readXlsxManifestFromFile(created.project.id);
        this.markProjectCoreReady(created.project.id);
        return { ...created, xlsxManifest };
      },
    });
  }

  updateProject(projectId: string, input: UpdateProjectRequest) {
    const current = this.getProject(projectId);
    if (!current) return null;
    const now = new Date().toISOString();
    const activeArtifactId = input.activeArtifactId ?? current.activeArtifactId;
    if (activeArtifactId !== current.activeArtifactId && !this.getArtifact(activeArtifactId)) throw new Error("Artifact not found");
    getDb()
      .prepare(
        `UPDATE projects
         SET title = ?, active_artifact_id = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(input.title?.trim() || current.title, activeArtifactId, input.updatedBy ?? "human", now, projectId);
    return this.getProject(projectId);
  }

  getProjectPreparation(projectId: string) {
    return this.preparation.getStatus(projectId);
  }

  markProjectCoreReady(projectId: string) {
    this.preparation.markCore(projectId, "ready");
  }

  async ensureAgentContextReady(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    await this.preparation.ensureAgentContext({
      projectId,
      baseVersion: sheetAgentContextVersion,
      prepare: () => this.writeProjectAgentInstructions(project),
    });
  }

  startAgentContextPreparation(project: SheetProject) {
    this.preparation.startAgentContext({
      projectId: project.id,
      baseVersion: sheetAgentContextVersion,
      fallbackPath: projectWorkspaceRoot(project.id),
      prepare: () => this.writeProjectAgentInstructions(project),
    });
  }

  clearProjectHistory() {
    getDb().exec(`
      DELETE FROM sheet_run_events;
      DELETE FROM sheet_runs;
      DELETE FROM stream_events;
      DELETE FROM artifacts;
      DELETE FROM projects;
    `);
    rmSync(appPaths.projectsDir, { force: true, recursive: true });
    ensureBaseDirs();
    return { projects: [] as SheetProject[] };
  }

  deleteProject(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare(`DELETE FROM sheet_run_events WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM sheet_runs WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM stream_events WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM artifacts WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    rmSync(projectWorkspaceRoot(projectId), { force: true, recursive: true });
    return { projects: this.listProjects() };
  }

  async readXlsxFile(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const bytes = await readFile(xlsxFilePath(projectId));
    return {
      bytes,
      fileName: xlsxArtifactFileRef,
      mimeType: xlsxMimeType,
    };
  }

  xlsxFilePath(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return xlsxFilePath(projectId);
  }

  async readXlsxManifest(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return readXlsxManifestFromFile(projectId);
  }

  async refreshXlsxArtifactFromFile(
    projectId: string,
    updatedBy: SheetProject["updatedBy"],
    options: { previousManifest?: Pick<XlsxManifest, "exists" | "sha256" | "sizeBytes">; forceRevision?: boolean } = {},
  ) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const manifest = await readXlsxManifestFromFile(projectId);
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Active artifact not found");
    const changed = options.forceRevision ?? (options.previousManifest ? xlsxManifestChanged(options.previousManifest, manifest) : manifest.exists);
    const refreshedArtifact = changed ? this.bumpArtifactRevision(artifact.id, updatedBy) : artifact;
    return {
      changed,
      manifest,
      artifact: refreshedArtifact ?? artifact,
    };
  }

  bumpArtifactRevision(artifactId: string, updatedBy: SheetProject["updatedBy"]) {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE artifacts
         SET revision = revision + 1, updated_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(updatedBy, now, artifactId);
    return this.getArtifact(artifactId);
  }

  async writeProjectExport(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (input.mimeType !== xlsxMimeType) throw new Error("Only XLSX exports are supported");
    if (input.bytes.byteLength === 0) throw new Error("Export file is empty");
    if (input.bytes.byteLength > maxXlsxImportBytes) throw new Error("Export file is too large");
    const exportsDir = join(projectWorkspaceRoot(projectId), "exports");
    await mkdir(exportsDir, { recursive: true });
    const fileName = uniqueXlsxFileName(exportsDir, input.fileName || `${project.title}.xlsx`);
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

  async writeContextAttachment(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return writeContextAttachmentFile(projectWorkspaceRoot(projectId), input);
  }

  projectExportsDir(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return join(ensureProjectDirs(projectId), "exports");
  }

  listProjectRuns(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return this.runs.listProjectRuns(projectId);
  }

  createRun(input: Parameters<SqliteRunStore<SheetRun, SheetRunEvent>["createRun"]>[0]) {
    return this.runs.createRun(input);
  }

  getRun(runId: string) {
    return this.runs.getRun(runId);
  }

  updateRun(runId: string, input: Partial<Pick<SheetRun, "status" | "error" | "resultPreview" | "agentTargetId" | "provider" | "model">>) {
    return this.runs.updateRun(runId, input);
  }

  createRunEvent(input: Parameters<SqliteRunStore<SheetRun, SheetRunEvent>["createRunEvent"]>[0]) {
    return this.runs.createRunEvent(input);
  }

  listRunEvents(runId: string) {
    return this.runs.listRunEvents(runId);
  }

  ensureConversationSession(projectId: string, title: string) {
    return this.conversations.ensureProjectSession(projectId, title);
  }

  createConversationSession(projectId: string, title?: string) {
    return this.conversations.createProjectSession(projectId, title);
  }

  listConversationSessions(projectId: string) {
    return this.conversations.listProjectSessions(projectId);
  }

  createConversationMessage(input: Parameters<SqliteAgentConversationStore["createMessage"]>[0]) {
    return this.conversations.createMessage(input);
  }

  updateConversationMessage(messageId: string, input: Parameters<SqliteAgentConversationStore["updateMessage"]>[1]) {
    return this.conversations.updateMessage(messageId, input);
  }

  conversationHistory(sessionId: string, currentPrompt: string) {
    return this.conversations.normalizedHistory({ sessionId, currentPrompt });
  }

  listConversationMessages(sessionId: string) {
    return this.conversations.listSessionMessages(sessionId);
  }

  updateProjectSessionTitle(projectId: string, title: string) {
    return this.conversations.updateProjectSessionTitle(projectId, title);
  }

  private async writeProjectAgentInstructions(project: SheetProject) {
    const root = projectWorkspaceRoot(project.id);
    await mkdir(root, { recursive: true });
    const path = join(root, "AGENTS.md");
    const content = sheetProjectAgentInstructions(project);
    const current = await readFile(path, "utf8").catch(() => null);
    if (current !== content) await writeFile(path, content, "utf8");
  }
}

type ProjectRow = {
  id: string;
  title: string;
  active_artifact_id: string;
  template_id: string | null;
  template_name: string | null;
  updated_by: SheetProject["updatedBy"];
  created_at: string;
  updated_at: string;
};

type ArtifactRow = {
  id: string;
  project_id: string;
  type: SheetArtifact["type"];
  file_ref: string;
  mime_type: string;
  revision: number;
  updated_by: SheetProject["updatedBy"];
  created_at: string;
  updated_at: string;
};

function rowToProject(row: ProjectRow): SheetProject {
  return {
    id: row.id,
    title: row.title,
    activeArtifactId: row.active_artifact_id,
    templateId: row.template_id,
    templateName: row.template_name,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToArtifact(row: ArtifactRow): SheetArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    fileRef: row.file_ref,
    mimeType: row.mime_type,
    revision: row.revision,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function xlsxManifestChanged(
  previous: Pick<XlsxManifest, "exists" | "sha256" | "sizeBytes">,
  next: Pick<XlsxManifest, "exists" | "sha256" | "sizeBytes">,
) {
  return previous.exists !== next.exists || previous.sha256 !== next.sha256 || previous.sizeBytes !== next.sizeBytes;
}

async function readXlsxManifestFromFile(projectId: string): Promise<XlsxManifest> {
  try {
    const path = xlsxFilePath(projectId);
    const info = await stat(path);
    const cached = xlsxManifestCache.get(path);
    if (cached && cached.mtimeMs === info.mtimeMs && cached.sizeBytes === info.size) {
      return cached.manifest;
    }
    const bytes = await readFile(path);
    const manifest = {
      kind: "xlsx",
      fileName: xlsxArtifactFileRef,
      exists: true,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      updatedAt: info.mtime.toISOString(),
    } satisfies XlsxManifest;
    xlsxManifestCache.set(path, { mtimeMs: info.mtimeMs, sizeBytes: info.size, manifest });
    return manifest;
  } catch {
    return createEmptyXlsxManifest();
  }
}

function xlsxFilePath(projectId: string) {
  return join(projectWorkspaceRoot(projectId), xlsxArtifactFileRef);
}

const xlsxManifestCache = new Map<string, { mtimeMs: number; sizeBytes: number; manifest: XlsxManifest }>();
const sheetAgentContextVersion = "ai-sheet-agent-context-v1";

function sheetProjectAgentInstructions(project: SheetProject) {
  const targetXlsxPath = join(projectWorkspaceRoot(project.id), xlsxArtifactFileRef);
  return [
    "# AI Sheet Workspace",
    "",
    "You are editing an XLSX workbook with the local AI Sheet app.",
    `Current focused file: ${targetXlsxPath}`,
    "Use the officecli command-line tool to inspect, create, edit, and validate the focused XLSX file when possible.",
    "When asked to create or edit spreadsheet content, write the final workbook to the focused file with filesystem tools.",
    "Do not convert the workbook to Markdown, CSV, or HTML unless explicitly asked for a separate export.",
  ].join("\n");
}

function importedProjectTitle(fileName: string) {
  const clean = safeBaseName(fileName || "workbook");
  const baseName = basename(clean, extname(clean));
  return baseName.trim() || "Imported Workbook";
}

function uniqueXlsxFileName(exportsDir: string, requestedName: string) {
  const safeName = safeXlsxFileName(requestedName);
  const extension = extname(safeName);
  const stem = basename(safeName, extension) || "workbook";
  let candidate = safeName;
  let index = 2;
  while (existsSync(join(exportsDir, candidate))) {
    candidate = `${stem}-${index}${extension}`;
    index += 1;
  }
  return candidate;
}

function safeXlsxFileName(fileName: string) {
  const clean = safeBaseName(fileName || "workbook");
  const base = basename(clean, extname(clean))
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80) || "workbook";
  return `${base}.xlsx`;
}

function safeBaseName(value: string) {
  return basename(safeDecodeURIComponent(value)).split(/[\\/]/).filter(Boolean).pop() || value;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const maxXlsxImportBytes = 80 * 1024 * 1024;
