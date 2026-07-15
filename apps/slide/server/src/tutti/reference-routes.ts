import { readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import type { FastifyInstance } from "fastify";
import { getDb, rows } from "../db/database.js";
import { appPaths } from "../local/paths.js";

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
  artifactType: "deck" | "pptx";
  updatedAt: string;
};

export function registerTuttiReferenceRoutes(server: FastifyInstance) {
  server.post<{ Body: ReferenceListRequest }>("/tutti/references/list", async (request) => {
    const body = request.body ?? {};
    const limit = clampLimit(body.limit);
    const offset = cursorOffset(body.cursor);
    const filter = normalizeSearchText(body.filterText);
    const timeRange = body.timeRange;
    const parentGroupId = sanitizeGroupId(body.parentGroupId);

    if (!parentGroupId) {
      const groups = await listProjectGroups(timeRange);
      const filtered = filter ? groups.filter((group) => matchesGroupSearch(group, filter)) : groups;
      return paged(filtered, offset, limit);
    }

    const references = await listReferencesForProject(parentGroupId, timeRange);
    const filtered = filter ? references.filter((item) => item.reference.displayName.toLowerCase().includes(filter)) : references;
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

async function listProjectGroups(timeRange: ReferenceListRequest["timeRange"]) {
  const entries = await safeReaddir(appPaths.projectsDir);
  const projectMetadata = loadProjectMetadata();
  const groups: Array<GroupItem & { updatedAt: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectId = entry.name;
    const metadata = projectMetadata.get(projectId);
    if (!metadata) continue;
    const displayName = projectDisplayName(projectId, projectMetadata);
    const references = await listReferencesForProject(projectId, timeRange, displayName, metadata);
    if (references.length === 0) continue;
    groups.push({
      type: "group",
      id: projectId,
      displayName,
      description: `${references.length} files`,
      referenceCount: references.length,
      updatedAt: projectUpdatedAt(projectId, projectMetadata),
    });
  }
  return groups
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
    .map(({ updatedAt: _updatedAt, ...group }) => group);
}

async function listAllReferences(timeRange: ReferenceSearchRequest["timeRange"]) {
  const groups = await safeReaddir(appPaths.projectsDir);
  const projectMetadata = loadProjectMetadata();
  const nested = await Promise.all(
    groups
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const metadata = projectMetadata.get(entry.name);
        if (!metadata) return [];
        return listReferencesForProject(entry.name, timeRange, projectDisplayName(entry.name, projectMetadata), metadata);
      }),
  );
  return nested.flat();
}

async function listReferencesForProject(
  projectId: string,
  timeRange: ReferenceListRequest["timeRange"],
  projectDisplayNameValue?: string,
  projectMetadataValue?: ProjectMetadata,
) {
  const root = join(appPaths.projectsDir, projectId);
  const projectMetadata = projectMetadataValue ?? loadProjectMetadata().get(projectId);
  if (!projectMetadata) return [];
  const files = await collectFiles(join(root, "exports"));
  const latestByKind = new Map<string, ReferenceItem>();
  const parentGroupLabel = projectDisplayNameValue ?? projectDisplayName(projectId, loadProjectMetadata());
  for (const file of files) {
    const exportKind = slideExportKind(file, projectMetadata.artifactType);
    if (!exportKind) continue;
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) continue;
    const mtimeMs = Math.trunc(info.mtimeMs);
    if (!isExportCurrent(mtimeMs, projectMetadata.updatedAt) || !matchesTimeRange(mtimeMs, timeRange)) continue;
    const relativeToProject = relative(root, file).split("\\").join("/");
    const item: ReferenceItem = {
      type: "reference",
      reference: {
        kind: "file",
        displayName: basename(file),
        description: relativeToProject,
        location: {
          type: "app-data-relative",
          path: `projects/${projectId}/${relativeToProject}`,
        },
        sizeBytes: info.size,
        mtimeMs,
        mimeType: mimeTypeForFileName(file),
        parentGroupLabel,
      },
    };
    const current = latestByKind.get(exportKind);
    if (!current || mtimeMs > (current.reference.mtimeMs ?? 0)) latestByKind.set(exportKind, item);
  }
  return [...latestByKind.values()].sort(
    (left, right) => (right.reference.mtimeMs ?? 0) - (left.reference.mtimeMs ?? 0)
      || left.reference.displayName.localeCompare(right.reference.displayName),
  );
}

async function collectFiles(root: string) {
  const entries = await safeReaddir(root);
  const files: string[] = [];
  for (const entry of entries) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(filePath));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function slideExportKind(fileName: string, artifactType: ProjectMetadata["artifactType"]) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".pdf") return "pdf";
  if (artifactType === "deck" && [".htm", ".html"].includes(extension)) return "html";
  if (artifactType === "pptx" && extension === ".pptx") return "pptx";
  return "";
}

function isExportCurrent(mtimeMs: number, projectUpdatedAt: string) {
  const projectUpdatedAtMs = Date.parse(projectUpdatedAt);
  return !Number.isFinite(projectUpdatedAtMs) || mtimeMs >= projectUpdatedAtMs;
}

async function safeReaddir(root: string) {
  try {
    return await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
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
  return {
    items: page,
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
  };
}

function normalizeSearchText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function loadProjectMetadata() {
  return new Map(
    rows<{ id: string; title: string; artifact_type: ProjectMetadata["artifactType"]; updated_at: string }>(
      getDb().prepare(
        `SELECT projects.id, projects.title, artifacts.type AS artifact_type, projects.updated_at
         FROM projects
         JOIN artifacts ON artifacts.id = projects.active_artifact_id AND artifacts.project_id = projects.id`,
      ).all(),
    ).map((project) => [
      project.id,
      {
        title: project.title,
        artifactType: project.artifact_type,
        updatedAt: project.updated_at,
      },
    ] as const),
  );
}

function projectDisplayName(projectId: string, projectMetadata: Map<string, ProjectMetadata>) {
  return projectMetadata.get(projectId)?.title.trim() || projectId;
}

function projectUpdatedAt(projectId: string, projectMetadata: Map<string, ProjectMetadata>) {
  return projectMetadata.get(projectId)?.updatedAt ?? "";
}

function matchesGroupSearch(group: GroupItem, query: string) {
  return [group.id, group.displayName].some((value) => value.toLowerCase().includes(query));
}

function matchesReferenceSearch(item: ReferenceItem, query: string) {
  const projectId = projectIdFromReferencePath(item.reference.location.path);
  return [item.reference.displayName, item.reference.parentGroupLabel ?? "", projectId].some((value) => value.toLowerCase().includes(query));
}

function projectIdFromReferencePath(pathValue: string) {
  const match = /^projects\/([^/]+)\//.exec(pathValue);
  return match?.[1] ?? "";
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

function mimeTypeForFileName(fileName: string) {
  const extension = extname(fileName).slice(1).toLowerCase();
  if (extension === "html" || extension === "htm") return "text/html";
  if (extension === "md" || extension === "markdown") return "text/markdown";
  if (extension === "json") return "application/json";
  if (extension === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}
