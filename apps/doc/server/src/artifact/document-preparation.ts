import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createEmptyDocxDocumentManifest, type DocumentProject } from "@ai-doc/shared";
import { retryProjectPreparationOperation, withProjectPreparationPhase } from "@ai-app/shared/project-preparation";
import { listProjectAssets } from "./project-assets.js";

export async function materializeDocumentProjectCore(root: string, project: DocumentProject) {
  await mkdir(root, { recursive: true });
  const path = documentCorePath(root, project);
  const content = project.type === "docx"
    ? project.content || JSON.stringify(createEmptyDocxDocumentManifest())
    : project.content;
  await retryProjectPreparationOperation({
    phase: "core_document",
    path,
    work: () => withProjectPreparationPhase("core_document", path, () => writeFile(path, content, "utf8")),
  });
}

/** TSH single-file: write html/md content (or docx private JSON) without a project directory product. */
export async function materializeDocumentArtifactFile(
  artifactPath: string,
  privateRoot: string,
  project: DocumentProject,
) {
  await mkdir(privateRoot, { recursive: true });
  if (project.type === "docx") {
    // Keep manifest in private state. Blank binary is seeded by DocumentService.ensureBlankDocxArtifact
    // (import writes bytes; agent edits the existing focused .docx).
    await materializeDocumentProjectCore(privateRoot, project);
    await mkdir(dirname(artifactPath), { recursive: true });
    return;
  }
  await retryProjectPreparationOperation({
    phase: "core_document",
    path: artifactPath,
    work: () => withProjectPreparationPhase("core_document", artifactPath, async () => {
      await mkdir(dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, project.content, "utf8");
    }),
  });
}

export async function prepareDocumentAgentContext(root: string, project: DocumentProject) {
  await mkdir(root, { recursive: true });
  const path = join(root, "AGENTS.md");
  await withProjectPreparationPhase("agent_instructions", path, async () => {
    const content = await projectAgentInstructions(project);
    const current = await readFile(path, "utf8").catch(() => null);
    if (current !== content) await writeFile(path, content, "utf8");
  });
}

export function documentAgentContextVersion(project: Pick<DocumentProject, "type">) {
  return ["doc-agent-context-v3", project.type].join(":");
}

function documentCorePath(root: string, project: DocumentProject) {
  return join(root, project.type === "docx" ? "document.json" : project.type === "markdown" ? "document.md" : "document.html");
}

async function projectAgentInstructions(project: DocumentProject) {
  if (project.type === "docx") return docxProjectAgentInstructions(project);
  if (project.type === "markdown") return markdownProjectAgentInstructions(project);
  return htmlProjectAgentInstructions(project);
}

async function htmlProjectAgentInstructions(project: DocumentProject) {
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a rich HTML doc with the local AI Doc app.",
    "Current focused file: document.html (relative to this project directory).",
    artifactIntentInstructions("document"),
    "When the current request calls for document changes, read and edit the focused file directly with filesystem tools. The app watches workspace files and refreshes the preview when content changes.",
    stagedProjectWriteInstructions("HTML"),
    await projectAssetInstructions(project.id),
  ].join("\n");
}

async function markdownProjectAgentInstructions(project: DocumentProject) {
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a Markdown doc with the local AI Doc app.",
    "Current focused file: document.md (relative to this project directory).",
    "Place local image assets under assets/ and reference them from Markdown as ./assets/<file-name>.",
    artifactIntentInstructions("document"),
    "When the current request calls for document changes, read and edit the focused file directly with filesystem tools. The app watches workspace files and refreshes the preview when content changes.",
    stagedProjectWriteInstructions("Markdown"),
    await projectAssetInstructions(project.id),
  ].join("\n");
}

async function docxProjectAgentInstructions(project: DocumentProject) {
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a Word doc project with the local AI Doc app.",
    "Current focused file: document.docx (relative to this project directory).",
    artifactIntentInstructions("document"),
    "When the current request calls for creating or editing this Word doc, write the final result to the focused file with filesystem tools.",
    "The app watches that file and refreshes the preview when its content changes.",
    await projectAssetInstructions(project.id),
  ].join("\n");
}

function artifactIntentInstructions(artifactLabel: string) {
  return [
    `Treat the focused ${artifactLabel} as a workspace resource, not as an obligation to produce placeholder content.`,
    `Create or modify it only when the user's current request asks this app to produce, edit, convert, import into, export from, or otherwise update that artifact.`,
    "If the request is mainly to coordinate with tools or other apps, inspect context, answer a question, or continue work elsewhere, complete that request without changing the focused artifact just to leave something behind.",
  ].join("\n");
}

async function projectAssetInstructions(projectId: string) {
  const assets = await listProjectAssets(projectId);
  if (assets.length === 0) return "";
  return [
    "",
    "Project context attachments:",
    ...assets.map((asset) => `- ${asset.fileName} (${asset.mimeType}, ${asset.sizeBytes} bytes): ${asset.path}`),
    "Use these files as source context when they are relevant to the user's request.",
  ].join("\n");
}

function stagedProjectWriteInstructions(format: "HTML" | "Markdown") {
  const validity = format === "HTML"
    ? "Keep each saved intermediate version valid, self-contained, and previewable."
    : "Keep each saved intermediate version coherent, with balanced code fences, valid tables, and no dangling partial sections.";
  return `For large generations or broad rewrites, save useful progress in stages: write an initial scaffold or first complete sections, then continue expanding the focused file so progress is visible in the working file. ${validity}`;
}
