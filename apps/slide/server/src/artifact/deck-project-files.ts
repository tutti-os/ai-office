import { readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, normalize, sep } from "node:path";
import {
  createEmptyPptxManifest,
  parsePptxManifest,
  serializePptxManifest,
  type DeckManifest,
  type PptxManifest,
  type SlideArtifact,
} from "@ai-slide/shared";
import { projectWorkspaceRoot } from "../local/paths.js";

export function pptxFilePath(projectId: string, artifact: SlideArtifact) {
  return join(projectWorkspaceRoot(projectId), artifact.fileRef);
}

export function pptxManifestPath(projectId: string, artifact: SlideArtifact) {
  return join(projectWorkspaceRoot(projectId), `${artifact.fileRef}.manifest.json`);
}

export async function readPptxManifestFromFile(projectId: string, artifact: SlideArtifact): Promise<PptxManifest> {
  try {
    const filePath = pptxFilePath(projectId, artifact);
    const [fileStat, bytes] = await Promise.all([stat(filePath), readFile(filePath)]);
    if (!fileStat.isFile()) return createEmptyPptxManifest();
    return {
      kind: "pptx",
      fileName: "slides.pptx",
      exists: true,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      updatedAt: fileStat.mtime.toISOString(),
    };
  } catch {
    return createEmptyPptxManifest();
  }
}

export async function readStoredPptxManifest(projectId: string, artifact: SlideArtifact) {
  try {
    return parsePptxManifest(await readFile(pptxManifestPath(projectId, artifact), "utf8"));
  } catch {
    return createEmptyPptxManifest();
  }
}

export function writeStoredPptxManifest(projectId: string, artifact: SlideArtifact, manifest: PptxManifest) {
  return writeFile(pptxManifestPath(projectId, artifact), `${serializePptxManifest(manifest)}\n`, "utf8");
}

export function writeDeckManifest(projectId: string, artifact: SlideArtifact, manifest: DeckManifest) {
  return writeFile(join(projectWorkspaceRoot(projectId), artifact.fileRef, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function resolveDeckSlidePath(projectId: string, artifact: SlideArtifact, file: string) {
  const deckRoot = join(projectWorkspaceRoot(projectId), artifact.fileRef);
  const normalizedFile = normalize(file);
  if (normalizedFile.startsWith("..") || normalizedFile.includes(`${sep}..${sep}`) || normalizedFile.startsWith(sep)) {
    throw new Error("Invalid slide path");
  }
  return join(deckRoot, normalizedFile);
}

export function normalizeSlideListItem(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Slide file names cannot be empty");
  if (trimmed.split(/[\\/]+/).includes("..")) throw new Error(`Invalid slide file path "${value}". Parent directories are not allowed.`);
  const normalized = normalize(trimmed).replace(/\\/g, "/");
  const withoutPrefix = normalized.startsWith("slides/") ? normalized.slice("slides/".length) : normalized;
  if (withoutPrefix.startsWith("/") || withoutPrefix.startsWith("../") || withoutPrefix.includes("/../") || withoutPrefix.includes("/")) {
    throw new Error(`Invalid slide file path "${value}". Use file names like "01-cover.html" or "slides/01-cover.html".`);
  }
  if (!withoutPrefix.toLowerCase().endsWith(".html")) throw new Error(`Slide file must be an HTML file: "${value}"`);
  return withoutPrefix;
}

export function assertIndexedSlideNames(slides: string[]) {
  const invalid = slides.find((fileName) => !/^\d{2,}[-_][^/]+\.html$/i.test(fileName));
  if (invalid) {
    throw new Error(`Slide files must use an indexed name like "01-cover.html"; invalid file: "${invalid}"`);
  }
}

export function assertSameSlideSet(filesystemSlides: string[], requestedSlides: string[]) {
  const filesystemSet = new Set(filesystemSlides);
  const requestedSet = new Set(requestedSlides);
  if (requestedSet.size !== requestedSlides.length) throw new Error("Slide order contains duplicate file names");
  const missing = filesystemSlides.filter((fileName) => !requestedSet.has(fileName));
  const unknown = requestedSlides.filter((fileName) => !filesystemSet.has(fileName));
  if (missing.length || unknown.length) {
    const parts = [];
    if (missing.length) parts.push(`missing from requested order: ${missing.join(", ")}`);
    if (unknown.length) parts.push(`not found on disk: ${unknown.join(", ")}`);
    throw new Error(`Slide order must match files in deck.slides/slides (${parts.join("; ")}).`);
  }
}

export function compareIndexedSlideNames(left: string, right: string) {
  const leftIndex = slideNameIndex(left);
  const rightIndex = slideNameIndex(right);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.localeCompare(right);
}

function slideNameIndex(fileName: string) {
  const match = /^(\d+)/.exec(fileName);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function nextSlideId(usedIds: Set<string>, preferredIndex: number) {
  let index = preferredIndex + 1;
  while (true) {
    const id = `slide-${String(index).padStart(3, "0")}`;
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
    index += 1;
  }
}
