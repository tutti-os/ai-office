import { stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import { appDataRelativeReferencePath, listWorkspaceFiles } from "@ai-app/shared/workspace-files";
import { getDb, rows } from "../db/database.js";
import {
  bindProjectWorkspaceRoot,
  appPaths,
  projectExportsRoot,
  projectFocusedArtifactPath,
  unbindProjectWorkspaceRoot,
} from "../local/paths.js";
import {
  listWorkspaceReferenceRecords,
  workspaceReferenceAbsolutePath,
  type WorkspaceReferenceRecord,
} from "./workspace-reference-catalog.js";

type ReferenceListRequest = {
  parentGroupId?: string;
  filterText?: string;
  limit?: number;
  cursor?: string;
  timeRange?: { fromMs?: number; toMs?: number };
};

type ReferenceSearchRequest = {
  query?: string;
  limit?: number;
  cursor?: string;
  filters?: string[];
  timeRange?: { fromMs?: number; toMs?: number };
};

type ReferenceItem = {
  type: "reference";
  reference: {
    kind: "file";
    displayName: string;
    description?: string;
    location: { type: "app-data-relative"; path: string };
    sizeBytes?: number;
    mtimeMs?: number;
    mimeType?: string;
    score?: number;
    parentGroupLabel?: string;
  };
};

type GroupItem = {
  type: "group";
  id: string;
  displayName: string;
  description?: string;
  referenceCount: number;
};

type ProjectMetadata = {
  title: string;
  type: "html" | "markdown" | "docx";
  updatedAt: string;
  workspaceRoot: string | null;
};

export function registerTuttiReferenceRoutes(server: FastifyInstance) {
  server.post<{ Body: ReferenceListRequest }>("/tutti/references/list", async (request) => {
    const body = request.body ?? {};
    const limit = clampLimit(body.limit);
    const offset = cursorOffset(body.cursor);
    const filter = normalizeSearchText(body.filterText);
    const parentGroupId = sanitizeGroupId(body.parentGroupId);
    const items = parentGroupId
      ? await listReferencesForProject(parentGroupId, body.timeRange)
      : await listProjectGroups(body.timeRange);
    const filtered = filter
      ? items.filter((item) => item.type === "group" ? matchesGroupSearch(item, filter) : item.reference.displayName.toLowerCase().includes(filter))
      : items;
    return paged(filtered, offset, limit);
  });

  server.post<{ Body: ReferenceSearchRequest }>("/tutti/references/search", async (request) => {
    const body = request.body ?? {};
    const query = normalizeSearchText(body.query);
    const filters = new Set((body.filters ?? []).filter((filter): filter is string => typeof filter === "string"));
    const limit = clampLimit(body.limit);
    const offset = cursorOffset(body.cursor);
    const references = await listAllReferences(body.timeRange);
    const filtered = references
      .filter((item) => matchesFilter(item.reference.displayName, filters))
      .filter((item) => !query || matchesReferenceSearch(item, query))
      .map((item) => ({
        ...item,
        reference: {
          ...item.reference,
          score: query ? scoreFileName(item.reference.displayName, query) : 0.6,
        },
      }))
      .sort((left, right) => (right.reference.score ?? 0) - (left.reference.score ?? 0) || (right.reference.mtimeMs ?? 0) - (left.reference.mtimeMs ?? 0));
    return paged(filtered, offset, limit);
  });
}

async function listProjectGroups(timeRange: ReferenceListRequest["timeRange"]): Promise<GroupItem[]> {
  const metadata = loadProjectMetadata();
  const groups: Array<GroupItem & { updatedAt: string }> = [];
  for (const [projectId, project] of metadata) {
    const references = await listReferencesForProject(projectId, timeRange);
    groups.push({
      type: "group",
      id: projectId,
      displayName: project.title.trim() || projectId,
      description: `${references.length} files`,
      referenceCount: references.length,
      updatedAt: project.updatedAt,
    });
  }
  return groups
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
    .map(({ updatedAt: _updatedAt, ...group }) => group);
}

async function listAllReferences(timeRange: ReferenceSearchRequest["timeRange"]) {
  const nested = await Promise.all([...loadProjectMetadata().keys()].map((projectId) => listReferencesForProject(projectId, timeRange)));
  return nested.flat();
}

async function listReferencesForProject(projectId: string, timeRange: ReferenceListRequest["timeRange"]): Promise<ReferenceItem[]> {
  const metadata = loadProjectMetadata().get(projectId);
  if (!metadata) return [];
  unbindProjectWorkspaceRoot(projectId);
  if (metadata.workspaceRoot) {
    if (!isWithinAppData(metadata.workspaceRoot)) return [];
    bindProjectWorkspaceRoot(projectId, metadata.workspaceRoot);
  }
  const parentGroupLabel = metadata.title.trim() || projectId;
  const exportsRoot = projectExportsRoot(projectId);
  const focusedPath = projectFocusedArtifactPath(projectId, metadata.type);
  const catalogByPath = catalogRecordsByAbsolutePath(projectId);
  const files = [...new Set([focusedPath, ...await listWorkspaceFiles(exportsRoot), ...catalogByPath.keys()])];
  const live = await Promise.all(files.map(async (absolutePath) => {
    if (!documentReferenceKind(absolutePath, metadata.type)) return null;
    const info = await stat(absolutePath).catch(() => null);
    if (!info?.isFile()) return null;
    const mtimeMs = Math.trunc(info.mtimeMs);
    if (!matchesTimeRange(mtimeMs, timeRange)) return null;
    const record = catalogByPath.get(absolutePath);
    const description = record?.description || (absolutePath === focusedPath
      ? basename(absolutePath)
      : join("exports", relative(exportsRoot, absolutePath)).split("\\").join("/"));
    const item: ReferenceItem = {
      type: "reference",
      reference: {
        kind: "file",
        displayName: record?.displayName || basename(absolutePath),
        description,
        location: { type: "app-data-relative", path: appDataRelativeReferencePath(appPaths.root, absolutePath) },
        sizeBytes: info.size,
        mtimeMs,
        mimeType: record?.mimeType || mimeTypeForFileName(absolutePath),
        parentGroupLabel,
      },
    };
    return item;
  }));
  return live.filter((item): item is ReferenceItem => item !== null).sort(
    (left, right) => (right.reference.mtimeMs ?? 0) - (left.reference.mtimeMs ?? 0)
      || left.reference.displayName.localeCompare(right.reference.displayName),
  );
}

function isWithinAppData(candidatePath: string) {
  const locator = relative(resolve(appPaths.root), resolve(candidatePath));
  return !isAbsolute(locator) && locator !== ".." && !locator.startsWith(`..${sep}`);
}

function catalogRecordsByAbsolutePath(projectId: string) {
  const records = new Map<string, WorkspaceReferenceRecord>();
  for (const record of listWorkspaceReferenceRecords(projectId)) {
    try {
      records.set(workspaceReferenceAbsolutePath(record.relativePath), record);
    } catch {
      // Ignore stale or invalid legacy catalog entries.
    }
  }
  return records;
}

function sanitizeGroupId(value: unknown) {
  return typeof value === "string" && /^[\w.-]+$/.test(value) ? value : "";
}

function clampLimit(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) return 20;
  return Math.max(1, Math.min(50, parsed));
}

function cursorOffset(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function paged<T>(items: T[], offset: number, limit: number) {
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return { items: page, nextCursor: nextOffset < items.length ? String(nextOffset) : null };
}

function normalizeSearchText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function loadProjectMetadata() {
  return new Map(
    rows<{ id: string; title: string; type: ProjectMetadata["type"]; updated_at: string; workspace_root: string | null }>(
      getDb().prepare(`SELECT id, title, type, updated_at, workspace_root FROM projects`).all(),
    ).map((project) => [project.id, {
      title: project.title,
      type: project.type,
      updatedAt: project.updated_at,
      workspaceRoot: project.workspace_root,
    }] as const),
  );
}

function matchesGroupSearch(group: GroupItem, query: string) {
  return [group.id, group.displayName].some((value) => value.toLowerCase().includes(query));
}

function matchesReferenceSearch(item: ReferenceItem, query: string) {
  return [item.reference.displayName, item.reference.description ?? "", item.reference.parentGroupLabel ?? ""].some((value) => value.toLowerCase().includes(query));
}

function matchesTimeRange(mtimeMs: number, timeRange: ReferenceListRequest["timeRange"]) {
  if (!timeRange) return true;
  if (typeof timeRange.fromMs === "number" && mtimeMs < timeRange.fromMs) return false;
  if (typeof timeRange.toMs === "number" && mtimeMs > timeRange.toMs) return false;
  return true;
}

function scoreFileName(fileName: string, query: string) {
  const normalized = fileName.toLowerCase();
  if (normalized === query) return 1;
  if (normalized.startsWith(query)) return 0.92;
  return normalized.includes(query) ? 0.78 : 0;
}

function matchesFilter(fileName: string, filters: Set<string>) {
  if (filters.size === 0) return true;
  return filters.has(fileCategory(fileName));
}

function fileCategory(fileName: string) {
  const extension = extname(fileName).slice(1).toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "heic"].includes(extension)) return "image";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(extension)) return "video";
  if (["pdf", "doc", "docx", "txt", "md", "markdown", "rtf", "odt", "pages", "key", "ppt", "pptx", "xls", "xlsx", "csv", "tsv", "numbers"].includes(extension)) return "document";
  if (["html", "htm", "mhtml", "url", "webloc"].includes(extension)) return "webpage";
  return "other";
}

function documentReferenceKind(fileName: string, type: ProjectMetadata["type"]) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".pdf") return "pdf";
  if (type === "html" && [".htm", ".html"].includes(extension)) return "html";
  if (type === "markdown" && [".markdown", ".md"].includes(extension)) return "markdown";
  if (type === "docx" && extension === ".docx") return "docx";
  return "";
}

function mimeTypeForFileName(fileName: string) {
  const extension = extname(fileName).slice(1).toLowerCase();
  if (extension === "html" || extension === "htm") return "text/html";
  if (extension === "md" || extension === "markdown") return "text/markdown";
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "json") return "application/json";
  return "application/octet-stream";
}
