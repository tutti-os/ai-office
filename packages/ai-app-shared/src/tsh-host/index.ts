import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

export {
  TSH_CMD_ROUTING_BASH_ENV,
  TSH_ROUTING_LD_PRELOAD,
  tshAgentRoutingEnv,
} from "./agent-routing.js";

export const TSH_WORKSPACE_APP_ENV = "TSH_WORKSPACE_APP";
export const TSH_DEFAULT_PARENT_PATH = "/workspace";

const TSH_FILE_ARTIFACT_EXTENSIONS = new Set([".html", ".htm", ".md", ".markdown", ".docx"]);

export type TshDocumentArtifactType = "html" | "markdown" | "docx";

export type AllocateTshArtifactOptions = {
  now?: Date;
  /** Import/source stem. When set, allocate `{stem}{ext}` with `-2`, `-3`, … on conflict. */
  preferredStem?: string | null;
};

export function isTshWorkspaceAppHost(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TSH_WORKSPACE_APP_ENV]?.trim() === "1";
}

export function resolveTshParentPath(input?: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isTshWorkspaceAppHost(env)) return null;
  const raw = input?.trim() || TSH_DEFAULT_PARENT_PATH;
  return assertAllowedTshParentPath(raw);
}

/**
 * Directory artifact root (slide). Default: `slide-YYYY-MM-DD-<n>/`.
 * Import: `{preferredStem}/` with `-2`, `-3`, … on conflict.
 */
export function allocateTshArtifactRoot(parentPath: string, options: AllocateTshArtifactOptions = {}): string {
  const parent = assertAllowedTshParentPath(parentPath);
  const preferred = options.preferredStem?.trim();
  if (preferred) {
    return allocateUniquePath(parent, safeTshFileStem(preferred), "");
  }
  return allocateDatedPath(parent, formatTshArtifactDatedStem("slide", options.now), "");
}

export function ensureTshArtifactRoot(root: string): string {
  const resolved = assertAllowedTshParentPath(root);
  mkdirSync(resolved, { recursive: true });
  return resolved;
}

/**
 * Single-file artifact (doc). Default: `doc-YYYY-MM-DD-<n>.ext`.
 * Import: `{preferredStem}.ext` with `-2`, `-3`, … on conflict.
 */
export function allocateTshArtifactFile(
  parentPath: string,
  type: TshDocumentArtifactType,
  options: AllocateTshArtifactOptions = {},
): string {
  const parent = assertAllowedTshParentPath(parentPath);
  const extension = extensionForDocumentType(type);
  const preferred = options.preferredStem?.trim();
  if (preferred) {
    return allocateUniquePath(parent, safeTshFileStem(preferred), extension);
  }
  return allocateDatedPath(parent, formatTshArtifactDatedStem("doc", options.now), extension);
}

export function formatTshArtifactDateSlug(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `doc-YYYY-MM-DD` / `slide-YYYY-MM-DD` stem before the conflict index. */
export function formatTshArtifactDatedStem(prefix: "doc" | "slide", date: Date = new Date()): string {
  return `${prefix}-${formatTshArtifactDateSlug(date)}`;
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

/** Display title for a TSH artifact path: basename without file extension. */
export function tshArtifactDisplayTitle(pathValue: string): string {
  const resolved = resolve(pathValue.trim());
  const base = basename(resolved);
  if (isTshFileArtifactPath(resolved)) {
    return basename(base, extname(base)) || base;
  }
  return base;
}

/** Stem taken from an import source filename (extension stripped, then sanitized). */
export function tshImportStemFromFileName(fileName: string, fallback = "imported"): string {
  const raw = basename(safeDecodeURIComponent(fileName || fallback));
  const stem = basename(raw, extname(raw)).trim() || fallback;
  return safeTshFileStem(stem, fallback);
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

/**
 * Convert a visible TSH workspace path into the stable path carried by a
 * workspace-relative reference. Internal app/database state is deliberately
 * not addressable through this helper.
 */
export function toTshWorkspaceRelativePath(pathValue: string): string {
  const root = resolve(TSH_DEFAULT_PARENT_PATH);
  const resolved = resolve(pathValue.trim());
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error("Reference path must be inside /workspace");
  }
  const relativePath = relative(root, resolved).split(sep).join("/");
  if (!relativePath || relativePath.split("/").some((part) => part === ".tsh")) {
    throw new Error("Reference path cannot use /workspace/.tsh");
  }
  return relativePath;
}

/** Resolve a previously validated workspace-relative reference path. */
export function fromTshWorkspaceRelativePath(relativePath: string): string {
  const normalized = relativePath.trim().replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === ".." || part === ".tsh")) {
    throw new Error("Reference path must be a non-empty workspace-relative path");
  }
  return join(TSH_DEFAULT_PARENT_PATH, normalized);
}

/** `{prefix-YYYY-MM-DD}-1`, `-2`, … (+ optional file extension). */
function allocateDatedPath(parent: string, datedStem: string, extension: string): string {
  let index = 1;
  while (true) {
    const candidate = join(parent, `${datedStem}-${index}${extension}`);
    if (!existsSync(candidate)) return candidate;
    index += 1;
  }
}

/** `{stem}`, `{stem}-2`, `{stem}-3`, … (+ optional file extension). */
function allocateUniquePath(parent: string, stem: string, extension: string): string {
  let candidate = join(parent, `${stem}${extension}`);
  if (!existsSync(candidate)) return candidate;
  let index = 2;
  while (true) {
    candidate = join(parent, `${stem}-${index}${extension}`);
    if (!existsSync(candidate)) return candidate;
    index += 1;
  }
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
