import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { basename } from "node:path";
import { fromTshWorkspaceRelativePath, isTshWorkspaceAppHost, toTshWorkspaceRelativePath } from "@ai-app/shared/tsh-host";
import { getDb, rows } from "../db/database.js";

export type WorkspaceReferenceRecord = {
  id: string;
  projectId: string;
  kind: string;
  relativePath: string;
  displayName: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
  mtimeMs: number;
  updatedAt: string;
};

type WorkspaceReferenceRow = {
  id: string; project_id: string; kind: string; relative_path: string; display_name: string;
  description: string; mime_type: string; size_bytes: number; mtime_ms: number; updated_at: string;
};

export function recordWorkspaceReference(input: { projectId: string; kind: string; absolutePath: string; displayName?: string; description?: string; mimeType: string }) {
  if (!isTshWorkspaceAppHost()) return null;
  let relativePath: string;
  try { relativePath = toTshWorkspaceRelativePath(input.absolutePath); } catch { return null; }
  const info = statSync(input.absolutePath, { throwIfNoEntry: false });
  if (!info?.isFile()) return null;
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO workspace_references
      (id, project_id, kind, relative_path, display_name, description, mime_type, size_bytes, mtime_ms, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, relative_path) DO UPDATE SET
      kind = excluded.kind, display_name = excluded.display_name, description = excluded.description,
      mime_type = excluded.mime_type, size_bytes = excluded.size_bytes, mtime_ms = excluded.mtime_ms, updated_at = excluded.updated_at
  `).run(randomUUID(), input.projectId, input.kind, relativePath, input.displayName?.trim() || basename(input.absolutePath), input.description?.trim() || relativePath, input.mimeType, info.size, Math.trunc(info.mtimeMs), now, now);
  return relativePath;
}

export function listWorkspaceReferenceRecords(projectId?: string): WorkspaceReferenceRecord[] {
  const result = projectId
    ? getDb().prepare(`SELECT * FROM workspace_references WHERE project_id = ? ORDER BY mtime_ms DESC, display_name COLLATE NOCASE`).all(projectId)
    : getDb().prepare(`SELECT * FROM workspace_references ORDER BY mtime_ms DESC, display_name COLLATE NOCASE`).all();
  return rows<WorkspaceReferenceRow>(result).map((row) => ({ id: row.id, projectId: row.project_id, kind: row.kind, relativePath: row.relative_path, displayName: row.display_name, description: row.description, mimeType: row.mime_type, sizeBytes: row.size_bytes, mtimeMs: row.mtime_ms, updatedAt: row.updated_at }));
}

export function workspaceReferenceAbsolutePath(relativePath: string) { return fromTshWorkspaceRelativePath(relativePath); }
