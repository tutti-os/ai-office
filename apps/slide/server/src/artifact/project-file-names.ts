import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { pptxMimeType } from "@ai-slide/shared";

const htmlMimeType = "text/html";

export function uniqueAssetFileName(assetsDir: string, requestedName: string, mimeType: string) {
  const parsed = safeAssetFileName(requestedName, mimeType);
  const ext = extname(parsed);
  const stem = basename(parsed, ext);
  let candidate = parsed;
  let index = 2;
  while (existsSync(join(assetsDir, candidate))) {
    candidate = `${stem}-${index}${ext}`;
    index += 1;
  }
  return candidate;
}

export function uniqueExportFileName(exportsDir: string, requestedName: string, mimeType: string) {
  const parsed = safeExportFileName(requestedName, mimeType);
  const ext = extname(parsed);
  const stem = basename(parsed, ext);
  let candidate = parsed;
  let index = 2;
  while (existsSync(join(exportsDir, candidate))) {
    candidate = `${stem}-${index}${ext}`;
    index += 1;
  }
  return candidate;
}

export function importedProjectTitle(fileName: string) {
  const clean = safeBaseName(fileName || "slides");
  const baseName = basename(clean, extname(clean));
  return baseName.trim() || "Imported Presentation";
}

export function projectAssetRelativePath(fileName: string) {
  return `./assets/${fileName}`;
}

export function mimeTypeForAssetFileName(fileName: string) {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".csv") return "text/csv";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".gif") return "image/gif";
  if (ext === ".htm" || ext === ".html") return "text/html";
  if (ext === ".jpeg" || ext === ".jpg") return "image/jpeg";
  if (ext === ".json") return "application/json";
  if (ext === ".md" || ext === ".markdown") return "text/markdown";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".ppt") return "application/vnd.ms-powerpoint";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === ".rtf") return "application/rtf";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".txt") return "text/plain";
  if (ext === ".webp") return "image/webp";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

function safeAssetFileName(fileName: string, mimeType: string) {
  const fallbackExt = extensionForMimeType(mimeType);
  const clean = safeBaseName(fileName || "image");
  const ext = extname(clean) || fallbackExt;
  const stem = safeFileStem(basename(clean, ext), "image");
  return `${stem}${ext}`;
}

function safeExportFileName(fileName: string, mimeType: string) {
  const clean = safeBaseName(fileName || "slides");
  const cleanExt = extname(clean).toLowerCase();
  const ext = cleanExt === ".pptx" || cleanExt === ".pdf" ? cleanExt : extensionForExportMimeType(mimeType);
  const stem = safeFileStem(basename(clean, extname(clean)), "slides");
  return `${stem}${ext}`;
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

function safeFileStem(value: string, fallback: string) {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80) || fallback;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "application/json") return ".json";
  if (mimeType === "application/msword") return ".doc";
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "application/rtf") return ".rtf";
  if (mimeType === "application/vnd.ms-excel") return ".xls";
  if (mimeType === "application/vnd.ms-powerpoint") return ".ppt";
  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return ".pptx";
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return ".xlsx";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/svg+xml") return ".svg";
  if (mimeType === "text/csv") return ".csv";
  if (mimeType === "text/html") return ".html";
  if (mimeType === "text/markdown") return ".md";
  if (mimeType === "text/plain") return ".txt";
  return ".bin";
}

function extensionForExportMimeType(mimeType: string) {
  if (mimeType === pptxMimeType) return ".pptx";
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === htmlMimeType) return ".html";
  return ".pptx";
}
