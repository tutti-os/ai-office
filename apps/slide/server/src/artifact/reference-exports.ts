import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DeckManifest, SlideArtifact, SlideProject } from "@ai-slide/shared";
import { pptxMimeType } from "@ai-slide/shared";
import { replacePublishedReferenceExports, type ReferenceExportDescriptor } from "@ai-app/shared/reference-exports";
import { ensureProjectDirs } from "../local/paths.js";
import { writeDeckHtmlExportToDirectory } from "./deck-html-export.js";

export function publishSlideReferenceExports(project: SlideProject, artifact: SlideArtifact) {
  const projectRoot = ensureProjectDirs(project.id);
  try {
    return replacePublishedReferenceExports({
      projectRoot,
      sourceVersion: project.updatedAt,
      write: (directory) => writeSlideReferenceExport(directory, projectRoot, project, artifact),
    });
  } catch (error) {
    console.error(`[ai-slide] Unable to publish reference exports for project ${project.id}`, error);
    return [];
  }
}

function writeSlideReferenceExport(
  directory: string,
  projectRoot: string,
  project: SlideProject,
  artifact: SlideArtifact,
): ReferenceExportDescriptor[] {
  if (artifact.type === "pptx") {
    const sourcePath = join(projectRoot, artifact.fileRef);
    if (!existsSync(sourcePath)) return [];
    cpSync(sourcePath, join(directory, "slides.pptx"));
    return [{ kind: "pptx", mimeType: pptxMimeType, path: "slides.pptx" }];
  }
  const manifestPath = join(projectRoot, artifact.fileRef, "manifest.json");
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DeckManifest;
  writeDeckHtmlExportToDirectory({
    artifact,
    manifest,
    projectId: project.id,
    projectTitle: project.title,
  }, directory);
  return [{ kind: "html", mimeType: "text/html", path: "index.html" }];
}
