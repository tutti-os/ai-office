import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentProject } from "@ai-doc/shared";
import { replacePublishedReferenceExports, type ReferenceExportDescriptor } from "@ai-app/shared/reference-exports";
import { ensureProjectDirs } from "../local/paths.js";

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function publishDocumentReferenceExports(project: DocumentProject) {
  const projectRoot = ensureProjectDirs(project.id);
  try {
    return replacePublishedReferenceExports({
      projectRoot,
      sourceVersion: project.updatedAt,
      write: (directory) => writeDocumentReferenceExport(directory, projectRoot, project),
    });
  } catch (error) {
    console.error(`[ai-doc] Unable to publish reference exports for project ${project.id}`, error);
    return [];
  }
}

function writeDocumentReferenceExport(directory: string, projectRoot: string, project: DocumentProject): ReferenceExportDescriptor[] {
  if (project.type === "docx") {
    const sourcePath = join(projectRoot, "document.docx");
    if (!existsSync(sourcePath)) return [];
    cpSync(sourcePath, join(directory, "document.docx"));
    return [{ kind: "docx", mimeType: docxMimeType, path: "document.docx" }];
  }

  const assetsDir = join(projectRoot, "assets");
  if (existsSync(assetsDir)) {
    mkdirSync(join(directory, "assets"), { recursive: true });
    cpSync(assetsDir, join(directory, "assets"), { recursive: true });
  }
  if (project.type === "markdown") {
    writeFileSync(join(directory, "document.md"), project.content, "utf8");
    return [{ kind: "markdown", mimeType: "text/markdown", path: "document.md" }];
  }
  writeFileSync(join(directory, "document.html"), project.content, "utf8");
  return [{ kind: "html", mimeType: "text/html", path: "document.html" }];
}
