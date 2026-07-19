import { extname } from "node:path";
import { resolveAbsoluteImportSourcePath } from "@ai-app/shared/import-source";

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function resolveImportSourcePath(inputPath: string) {
  return resolveAbsoluteImportSourcePath(inputPath);
}

export function mimeTypeForImportFileName(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".docx") return docxMimeType;
  if (extension === ".md" || extension === ".markdown") return "text/markdown";
  if (extension === ".html" || extension === ".htm") return "text/html";
  return "application/octet-stream";
}
