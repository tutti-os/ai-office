import { mkdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";

export const TSH_WORKSPACE_APP_ENV = "TSH_WORKSPACE_APP";
export const TSH_DEFAULT_PARENT_PATH = "/workspace";

const TSH_FILE_ARTIFACT_EXTENSIONS = new Set([".html", ".htm", ".md", ".markdown", ".docx"]);

export type TshDocumentArtifactType = "html" | "markdown" | "docx";

export function isTshWorkspaceAppHost(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TSH_WORKSPACE_APP_ENV]?.trim() === "1";
}

export function resolveTshParentPath(input?: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isTshWorkspaceAppHost(env)) return null;
  const raw = input?.trim() || TSH_DEFAULT_PARENT_PATH;
  return assertAllowedTshParentPath(raw);
}

/** Legacy directory artifact root (still used by slide). */
export function allocateTshArtifactRoot(parentPath: string, title: string, projectId: string): string {
  const parent = assertAllowedTshParentPath(parentPath);
  // Keep Unicode letters (e.g. Chinese titles) — do not use ASCII-only safePathSegment.
  const slug = safeTshFileStem(title.trim() || "untitled").slice(0, 48);
  const shortId = projectId.replace(/-/g, "").slice(0, 8) || "project";
  return join(parent, `${slug}-${shortId}`);
}

/** Rename a TSH directory artifact root while preserving the trailing short id. */
export function allocateRenamedTshArtifactRoot(currentRoot: string, title: string): string {
  const resolved = resolve(currentRoot.trim());
  const parent = dirname(resolved);
  assertAllowedTshParentPath(parent);
  const base = basename(resolved);
  const shortIdMatch = base.match(/-([a-f0-9]{8})$/i);
  const shortId = shortIdMatch?.[1] || "project";
  let stem = title.trim();
  stem = stem.replace(new RegExp(`-${shortId}$`, "i"), "");
  const slug = safeTshFileStem(stem);
  return join(parent, `${slug}-${shortId}`);
}

export function ensureTshArtifactRoot(root: string): string {
  const resolved = assertAllowedTshParentPath(root);
  mkdirSync(resolved, { recursive: true });
  return resolved;
}

/** Single-file artifact path for TSH doc products: `YYYY-MM-DD-<id8>.ext`. */
export function allocateTshArtifactFile(
  parentPath: string,
  _title: string,
  projectId: string,
  type: TshDocumentArtifactType,
  now: Date = new Date(),
): string {
  const parent = assertAllowedTshParentPath(parentPath);
  const dateSlug = formatTshArtifactDateSlug(now);
  const shortId = projectId.replace(/-/g, "").slice(0, 8) || "project";
  return join(parent, `${dateSlug}-${shortId}${extensionForDocumentType(type)}`);
}

export function formatTshArtifactDateSlug(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Stem for TSH filenames. Keeps Unicode letters/numbers so Chinese titles do not
 * collapse into underscores (unlike ASCII-only `safePathSegment`).
 */
export function safeTshFileStem(value: string, fallback = formatTshArtifactDateSlug()): string {
  const cleaned = value
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

/** Rename a TSH file artifact while preserving the trailing short id and extension. */
export function allocateRenamedTshArtifactFile(currentFilePath: string, title: string): string {
  const resolved = resolve(currentFilePath.trim());
  if (!isTshFileArtifactPath(resolved)) {
    throw new Error("Current path is not a TSH file artifact");
  }
  const parent = dirname(resolved);
  assertAllowedTshParentPath(parent);
  const extension = extname(resolved);
  const base = basename(resolved, extension);
  const shortIdMatch = base.match(/-([a-f0-9]{8})$/i);
  const shortId = shortIdMatch?.[1] || "project";
  let stem = title.trim();
  if (stem.toLowerCase().endsWith(extension.toLowerCase())) {
    stem = stem.slice(0, -extension.length);
  }
  stem = stem.replace(new RegExp(`-${shortId}$`, "i"), "");
  const slug = safeTshFileStem(stem);
  return join(parent, `${slug}-${shortId}${extension}`);
}

export function ensureTshArtifactFile(filePath: string): string {
  const resolved = resolve(filePath.trim());
  if (!isTshFileArtifactPath(resolved)) {
    throw new Error("Artifact path must be an .html, .md, or .docx file under /workspace");
  }
  assertAllowedTshParentPath(dirname(resolved));
  mkdirSync(dirname(resolved), { recursive: true });
  return resolved;
}

export function isTshFileArtifactPath(pathValue: string): boolean {
  const base = pathValue.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return TSH_FILE_ARTIFACT_EXTENSIONS.has(base.slice(dot));
}

export function extensionForDocumentType(type: TshDocumentArtifactType): string {
  if (type === "docx") return ".docx";
  if (type === "markdown") return ".md";
  return ".html";
}

export function assertAllowedTshParentPath(pathValue: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed) throw new Error("Parent path is required");
  if (trimmed.includes("\0")) throw new Error("Parent path is invalid");
  const resolved = resolve(trimmed);
  const root = resolve(TSH_DEFAULT_PARENT_PATH);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error("Parent path must be inside /workspace");
  }
  const blocked = join(root, ".tsh");
  if (resolved === blocked || resolved.startsWith(blocked + sep)) {
    throw new Error("Parent path cannot use /workspace/.tsh");
  }
  return resolved;
}
