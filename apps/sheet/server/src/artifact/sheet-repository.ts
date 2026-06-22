import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";
import { rmSync } from "node:fs";
import {
  createEmptyXlsxManifest,
  type CreateProjectRequest,
  type SheetArtifact,
  type SheetProject,
  type UpdateProjectRequest,
  type XlsxManifest,
  xlsxArtifactFileRef,
  xlsxMimeType,
} from "@ai-sheet/shared";
import { getDb, rowOrNull, rows } from "../db/database.js";
import { appPaths, ensureBaseDirs, ensureProjectDirs, projectWorkspaceRoot } from "../local/paths.js";

export class SheetRepository {
  snapshot() {
    const db = getDb();
    return {
      projects: rows<ProjectRow>(db.prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject),
      artifacts: rows<ArtifactRow>(db.prepare(`SELECT * FROM artifacts ORDER BY updated_at DESC`).all()).map(rowToArtifact),
      activeRuns: [],
      runEvents: [],
      lastSeq: (db.prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM stream_events`).get() as { seq: number }).seq,
    };
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

  createProject(input: CreateProjectRequest = {}) {
    const id = randomUUID();
    const artifactId = randomUUID();
    const now = new Date().toISOString();
    const title = input.title?.trim() || "Untitled Workbook";
    ensureProjectDirs(id);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, active_artifact_id, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, 'system', ?, ?)`,
      )
      .run(id, title, artifactId, now, now);
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
    const created = this.createProject({
      title: input.title?.trim() || basename(sourcePath, extname(sourcePath)),
    });
    await copyFile(sourcePath, xlsxFilePath(created.project.id));
    const refresh = await this.refreshXlsxArtifactFromFile(created.project.id, "human");
    const project = this.getProject(created.project.id);
    const artifact = this.getArtifact(created.artifact.id);
    if (!project || !artifact) throw new Error("Unable to import XLSX project");
    return {
      project,
      artifact,
      xlsxManifest: refresh?.manifest ?? (await readXlsxManifestFromFile(project.id)),
    };
  }

  async importXlsxProjectFromBytes(input: { title?: string; fileName: string; bytes: Buffer }) {
    if (input.bytes.byteLength === 0) throw new Error("XLSX file is empty");
    if (input.bytes.byteLength > maxXlsxImportBytes) throw new Error("XLSX file is too large");
    const created = this.createProject({
      title: input.title?.trim() || importedProjectTitle(input.fileName),
    });
    await writeFile(xlsxFilePath(created.project.id), input.bytes);
    const refresh = await this.refreshXlsxArtifactFromFile(created.project.id, "human");
    return {
      ...created,
      xlsxManifest: refresh?.manifest ?? (await readXlsxManifestFromFile(created.project.id)),
    };
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

  async refreshXlsxArtifactFromFile(projectId: string, updatedBy: SheetProject["updatedBy"]) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const manifest = await readXlsxManifestFromFile(projectId);
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Active artifact not found");
    if (!manifest.exists) return { changed: false, manifest, artifact };
    const currentManifest = await readXlsxManifestFromFile(projectId);
    const changed = currentManifest.sha256 !== manifest.sha256 || currentManifest.sizeBytes !== manifest.sizeBytes;
    this.bumpArtifactRevision(artifact.id, updatedBy);
    return {
      changed,
      manifest,
      artifact: this.getArtifact(artifact.id) ?? artifact,
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
    const exportsDir = join(ensureProjectDirs(projectId), "exports");
    const fileName = safeXlsxFileName(input.fileName || `${project.title}.xlsx`);
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

  projectExportsDir(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return join(ensureProjectDirs(projectId), "exports");
  }

  listProjectRuns(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return [];
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

async function readXlsxManifestFromFile(projectId: string): Promise<XlsxManifest> {
  try {
    const bytes = await readFile(xlsxFilePath(projectId));
    const info = await stat(xlsxFilePath(projectId));
    return {
      kind: "xlsx",
      fileName: xlsxArtifactFileRef,
      exists: true,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      updatedAt: info.mtime.toISOString(),
    };
  } catch {
    return createEmptyXlsxManifest();
  }
}

function xlsxFilePath(projectId: string) {
  return join(ensureProjectDirs(projectId), xlsxArtifactFileRef);
}

function importedProjectTitle(fileName: string) {
  const baseName = basename(fileName || "workbook", extname(fileName || "workbook"));
  return baseName.trim() || "Imported Workbook";
}

function safeXlsxFileName(fileName: string) {
  const base = basename(fileName, extname(fileName)).replace(/[^\w.-]/g, "_") || "workbook";
  return `${base}.xlsx`;
}

const maxXlsxImportBytes = 80 * 1024 * 1024;
