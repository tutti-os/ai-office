import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { projectWorkspaceRoot } from "../local/paths.js";

export async function listProjectAssets(projectId: string) {
  const assetsDir = join(projectWorkspaceRoot(projectId), "assets");
  const entries = await readdir(assetsDir, { withFileTypes: true }).catch(() => []);
  return Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => ({
    fileName: entry.name,
    path: projectAssetRelativePath(entry.name),
    mimeType: mimeTypeForAssetFileName(entry.name),
    sizeBytes: (await stat(join(assetsDir, entry.name))).size,
  })));
}

export function mimeTypeForAssetFileName(fileName: string) {
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

export function projectAssetRelativePath(fileName: string) {
  return `./assets/${fileName}`;
}
