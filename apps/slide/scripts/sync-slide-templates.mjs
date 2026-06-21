import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const templateRoot = slideTemplateSourceRoot();
const publicRoot = path.join(projectRoot, "templates", "generated", "templates");
const outputPath = path.join(projectRoot, "shared", "src", "generatedTemplates.ts");

function publicPath(...parts) {
  return `/generated/templates/${parts.map(encodeURIComponent).join("/")}`;
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

function slideTemplateSourceRoot() {
  const candidates = [
    process.env.AI_SLIDE_TEMPLATE_ROOT ? path.resolve(process.env.AI_SLIDE_TEMPLATE_ROOT) : "",
    path.join(projectRoot, "templates", "source"),
    path.resolve(projectRoot, "../../tutti/slide/template"),
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
  const templatePublicDir = path.join(publicRoot, metadata.name);
  const previews = sortSlideAssets(metadata.files?.previews ?? []);
  const thumbnails = sortSlideAssets(metadata.files?.thumbnails ?? []);
  const pages = sortSlideAssets(metadata.files?.pages ?? []);
  const coverSource =
    (await copyFirstExisting(templateDir, [...previews.slice(0, 1), ...thumbnails.slice(0, 1)], path.join(templatePublicDir, "cover.png"))) ??
    "";

  const stripImages = [];
  const previewImages = [];
  const thumbnailImages = [];
  for (const [index, source] of previews.entries()) {
    const copied = await copyFirstExisting(templateDir, [source], path.join(templatePublicDir, `preview-${index + 1}.png`));
    if (copied) previewImages.push(publicPath(metadata.name, `preview-${index + 1}.png`));
  }
  for (const [index, source] of thumbnails.entries()) {
    const copied = await copyFirstExisting(templateDir, [source], path.join(templatePublicDir, `thumb-${index + 1}.png`));
    if (copied) thumbnailImages.push(publicPath(metadata.name, `thumb-${index + 1}.png`));
  }
  stripImages.push(...thumbnailImages.slice(0, 4));

  templates.push({
    id: metadata.name,
    name: metadata.display_name ?? metadata.name,
    slug: metadata.name,
    category: metadata.category ?? "uncategorized",
    shortDescription: compactDescription(metadata.short_description ?? metadata.description),
    description: compactDescription(metadata.description),
    language: metadata.lang ?? "en-US",
    tags: metadata.tags ?? [],
    updatedAt: metadata.updated_at ?? "",
    slideCount: pages.length,
    canvas: {
      width: metadata.canvas?.width ?? 1920,
      height: metadata.canvas?.height ?? 1080,
    },
    coverImage: coverSource ? publicPath(metadata.name, "cover.png") : "",
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
