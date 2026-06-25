import { extname } from "node:path";
import { resolveWorkspaceImportSourcePath } from "@ai-app/shared/import-source";

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function resolveImportSourcePath(inputPath: string) {
  return resolveWorkspaceImportSourcePath(inputPath, {
    workspaceEnvVars: ["AI_DOC_WORKSPACE_ROOT", "TUTTI_WORKSPACE_ROOT"],
  });
}

export function mimeTypeForImportFileName(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".docx") return docxMimeType;
  if (extension === ".md" || extension === ".markdown") return "text/markdown";
  if (extension === ".html" || extension === ".htm") return "text/html";
  return "application/octet-stream";
}
