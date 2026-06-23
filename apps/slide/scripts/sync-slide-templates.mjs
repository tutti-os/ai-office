import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const templateRoot = slideTemplateSourceRoot();
const publicRoot = path.join(projectRoot, "templates", "generated");
const outputPath = path.join(projectRoot, "shared", "src", "generatedTemplates.ts");
const supportedCanvas = { width: 1920, height: 1080 };

function publicPath(...parts) {
  return `/generated/${parts.map(encodeURIComponent).join("/")}`;
}

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyFirstExisting(templateDir, candidates, targetPath) {
  for (const candidate of candidates) {
    const source = path.join(templateDir, candidate);
    if (await fileExists(source)) {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await cp(source, targetPath);
      return candidate;
    }
  }
  return null;
}

function sortSlideAssets(items) {
  return [...items].sort((a, b) => {
    const left = Number.parseInt(path.basename(a), 10);
    const right = Number.parseInt(path.basename(b), 10);
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
    return a.localeCompare(b);
  });
}

function compactDescription(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isSupportedTemplateCanvas(canvas) {
  return (canvas?.width ?? supportedCanvas.width) === supportedCanvas.width && (canvas?.height ?? supportedCanvas.height) === supportedCanvas.height;
}

function metadataId(metadata, fallback) {
  return String(metadata.id ?? metadata.name ?? fallback);
}

function metadataTitle(metadata, fallback) {
  return String(metadata.title ?? metadata.display_name ?? metadata.name ?? fallback);
}

function metadataSummary(metadata) {
  return metadata.summary ?? metadata.short_description ?? metadata.description;
}

function metadataLocale(metadata) {
  return metadata.locale ?? metadata.lang ?? "en-US";
}

function metadataDeck(metadata) {
  return metadata.deck ?? {};
}

function slideTemplateSourceRoot() {
  const candidates = [
    process.env.AI_SLIDE_TEMPLATE_ROOT ? path.resolve(process.env.AI_SLIDE_TEMPLATE_ROOT) : "",
    path.join(projectRoot, "templates", "source"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

await rm(publicRoot, { force: true, recursive: true });
await mkdir(publicRoot, { recursive: true });
await mkdir(path.dirname(outputPath), { recursive: true });

const entries = await readdir(templateRoot, { withFileTypes: true });
const templates = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const templateDir = path.join(templateRoot, entry.name);
  const metadataPath = path.join(templateDir, "metadata.json");
  if (!(await fileExists(metadataPath))) continue;

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const templateId = metadataId(metadata, entry.name);
  const deck = metadataDeck(metadata);
  const canvas = deck.canvas ?? metadata.canvas;
  if (!isSupportedTemplateCanvas(canvas)) continue;
  const templatePublicDir = path.join(publicRoot, templateId);
  const previews = sortSlideAssets(deck.previews ?? metadata.files?.previews ?? []);
  const thumbnails = sortSlideAssets(deck.thumbnails ?? metadata.files?.thumbnails ?? []);
  const pages = sortSlideAssets(deck.pages ?? metadata.files?.pages ?? []);
  const coverSource =
    (await copyFirstExisting(templateDir, [...previews.slice(0, 1), ...thumbnails.slice(0, 1)], path.join(templatePublicDir, "cover.png"))) ??
    "";

  const stripImages = [];
  const previewImages = [];
  const thumbnailImages = [];
  for (const [index, source] of previews.entries()) {
    const copied = await copyFirstExisting(templateDir, [source], path.join(templatePublicDir, `preview-${index + 1}.png`));
    if (copied) previewImages.push(publicPath(templateId, `preview-${index + 1}.png`));
  }
  for (const [index, source] of thumbnails.entries()) {
    const copied = await copyFirstExisting(templateDir, [source], path.join(templatePublicDir, `thumb-${index + 1}.png`));
    if (copied) thumbnailImages.push(publicPath(templateId, `thumb-${index + 1}.png`));
  }
  stripImages.push(...thumbnailImages.slice(0, 4));

  templates.push({
    id: templateId,
    name: metadataTitle(metadata, templateId),
    slug: templateId,
    category: metadata.category ?? "uncategorized",
    shortDescription: compactDescription(metadataSummary(metadata)),
    description: compactDescription(metadata.description),
    language: metadataLocale(metadata),
    slideCount: pages.length,
    canvas: {
      width: canvas?.width ?? 1920,
      height: canvas?.height ?? 1080,
    },
    coverImage: coverSource ? publicPath(templateId, "cover.png") : "",
    stripImages,
    previewImages,
    thumbnailImages,
  });
}

templates.sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.name.localeCompare(b.name);
});

const source = `import type { SlideTemplate } from "./index.js";

export const slideTemplates: SlideTemplate[] = ${JSON.stringify(templates, null, 2)};
`;

await writeFile(outputPath, source, "utf8");
console.log(`Synced ${templates.length} slide templates from ${templateRoot}`);
