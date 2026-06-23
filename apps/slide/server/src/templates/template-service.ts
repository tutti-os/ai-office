import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assetPathFromRelativeUrl, encodeAssetPath } from "@ai-app/shared/artifact-assets";
import { isSupportedDeckCanvas, type SlideTemplate } from "@ai-slide/shared";
import { slideTemplates as bundledSlideTemplates } from "../../../shared/src/generatedTemplates.js";

type TemplateProviderKind = "cloud" | "local";

export type TemplateDeckSource = {
  title: string;
  canvas: { width: number; height: number };
  slides: TemplateDeckSourceSlide[];
  assets: TemplateDeckSourceAsset[];
};

export type TemplateDeckSourceSlide = {
  fileName: string;
  html: string;
};

export type TemplateDeckSourceAsset = {
  path: string;
  bytes: Buffer;
};

interface CloudSlideTemplateManifest {
  schemaVersion: number;
  type: "slide";
  templates: CloudSlideTemplateManifestEntry[];
}

interface CloudSlideTemplateManifestEntry {
  id: string;
  enabled?: boolean;
  name?: string;
  slug?: string;
  category?: string;
  classification?: string;
  shortDescription?: string;
  description?: string;
  language?: string;
  lang?: string;
  tags?: string[];
  updatedAt?: string;
  updated_at?: string;
  slideCount?: number;
  canvas?: { width?: number; height?: number };
  coverImage?: string;
  coverUrl?: string;
  screenshotUrl?: string;
  stripImages?: string[];
  previewImages?: string[];
  thumbnailImages?: string[];
  metadataUrl?: string;
  sourceUrl?: string;
  deckUrl?: string;
  slidesUrl?: string;
  pagesBaseUrl?: string;
  assetsBaseUrl?: string;
  assets?: string[];
}

type CloudDeckManifest = {
  title?: string;
  metadata?: { title?: string };
  canvas?: { width?: number; height?: number };
  playlist?: unknown[];
  pages?: unknown[];
  slides?: unknown[];
  assets?: unknown[];
  files?: {
    pages?: unknown[];
    assets?: unknown[];
  };
};

type CloudSlideDescriptor = {
  fileName: string;
  pageUrl?: string;
};

const assetRoutePrefix = "/api/templates/assets";
const defaultCloudFrontBaseUrl = "https://d2ddkmrpvnj1wf.cloudfront.net";
const defaultManifestPath = "/office-templates/slide/template.json";
let cachedCloudManifest: { expiresAt: number; manifest: CloudSlideTemplateManifest } | null = null;
let staleCloudManifest: CloudSlideTemplateManifest | null = null;

export async function listTemplates(): Promise<SlideTemplate[]> {
  if (templateProviderKind() === "local") return listLocalTemplates();
  const manifest = await getCloudManifest();
  return manifest.templates
    .filter((template) => template.enabled !== false)
    .map(cloudTemplateToSlideTemplate)
    .filter((template) => isSupportedDeckCanvas(template.canvas));
}

export async function loadTemplateDeckSource(templateId: string): Promise<TemplateDeckSource | null> {
  return templateProviderKind() === "local" ? loadLocalTemplateDeckSource(templateId) : loadCloudTemplateDeckSource(templateId);
}

export function localTemplateSourceRoots() {
  const root = appRoot();
  return [
    process.env.AI_SLIDE_TEMPLATE_ROOT ? resolve(process.env.AI_SLIDE_TEMPLATE_ROOT) : "",
    resolve(root, "templates", "source"),
  ].filter(Boolean);
}

export function templateAssetRoot() {
  const roots = templateAssetRoots();
  return roots.find((root) => existsSync(root)) ?? roots[0];
}

export function safeTemplateAssetPath(routePath: string) {
  const normalized = normalize(routePath).replace(/^(\.\.[/\\])+/, "");
  if (normalized.startsWith("..") || normalized.includes(`..${sep}`)) throw new Error("Invalid template asset path");
  return normalized;
}

export async function ensureTemplateDirs() {
  if (templateProviderKind() !== "local") return;
  const root = templateAssetRoot();
  if (!existsSync(root)) await mkdir(root, { recursive: true });
}

function listLocalTemplates(): SlideTemplate[] {
  const allowedTemplateIds = localTemplateIdFilter();
  return bundledSlideTemplates
    .filter((template) => !allowedTemplateIds || allowedTemplateIds.has(template.id))
    .filter((template) => isSupportedDeckCanvas(template.canvas))
    .map((template) => ({
      ...template,
      coverImage: template.coverImage ? templateAssetUrl(template.coverImage) : "",
      stripImages: template.stripImages.map(templateAssetUrl),
      previewImages: template.previewImages.map(templateAssetUrl),
      thumbnailImages: template.thumbnailImages.map(templateAssetUrl),
    }));
}

async function loadLocalTemplateDeckSource(templateId: string): Promise<TemplateDeckSource | null> {
  const templateDir = localTemplateSourceRoots().map((root) => join(root, templateId)).find((candidate) => existsSync(candidate));
  if (!templateDir) return null;
  const deckDir = join(templateDir, "deck.slides");
  const pagesDir = join(templateDir, "pages");
  if (!existsSync(deckDir) || !existsSync(pagesDir)) return null;
  const manifestPath = join(deckDir, "manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CloudDeckManifest;
  const slides = normalizeCloudSlides(manifest).filter((slide) => slide.fileName.endsWith(".html"));
  if (!slides.length) return null;
  const canvas = normalizeCanvas(manifest.canvas);
  if (!isSupportedDeckCanvas(canvas)) return null;
  const htmlSlides = await Promise.all(
    slides.map(async (slide) => ({
      fileName: slide.fileName,
      html: await readFile(join(pagesDir, slide.fileName), "utf8").catch(() => missingTemplateSlideHtml(slide.fileName)),
    })),
  );
  return {
    title: manifest.metadata?.title ?? manifest.title ?? "",
    canvas,
    slides: htmlSlides,
    assets: await readLocalTemplateAssets(join(templateDir, "assets")),
  };
}

async function readLocalTemplateAssets(assetsDir: string) {
  if (!existsSync(assetsDir)) return [];
  const paths = await listFilesRecursive(assetsDir);
  return Promise.all(
    paths.map(async (assetPath) => ({
      path: assetPath,
      bytes: await readFile(join(assetsDir, assetPath)),
    })),
  );
}

async function listFilesRecursive(root: string, current = ""): Promise<string[]> {
  const dir = join(root, current);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const results: string[] = [];
  for (const entry of entries) {
    const relativePath = current ? `${current}/${entry.name}` : entry.name;
    if (entry.isDirectory()) results.push(...(await listFilesRecursive(root, relativePath)));
    else if (entry.isFile()) results.push(relativePath);
  }
  return results;
}

async function loadCloudTemplateDeckSource(templateId: string): Promise<TemplateDeckSource | null> {
  const template = await getCloudTemplate(templateId);
  const deckUrl = template.deckUrl || template.slidesUrl || template.sourceUrl;
  if (!deckUrl) throw new Error(`Template source is missing for "${templateId}"`);
  const deckManifest = (await (await fetchCloudResource(deckUrl)).json()) as CloudDeckManifest;
  const slides = normalizeCloudSlides(deckManifest);
  if (!slides.length) throw new Error(`Template source has no slides for "${templateId}"`);
  const canvas = normalizeCanvas(deckManifest.canvas ?? template.canvas);
  if (!isSupportedDeckCanvas(canvas)) return null;

  const baseUrl = templateBaseUrl(template, deckUrl);
  const pageBaseUrl = template.pagesBaseUrl ? absoluteCloudUrl(template.pagesBaseUrl) : `${baseUrl}pages/`;
  const assetBaseUrl = template.assetsBaseUrl ? absoluteCloudUrl(template.assetsBaseUrl) : `${baseUrl}assets/`;
  const htmlSlides = await Promise.all(
    slides.map(async (slide) => ({
      fileName: slide.fileName,
      html: await (await fetchCloudResource(slide.pageUrl || `${pageBaseUrl}${encodeAssetPath(slide.fileName)}`)).text(),
    })),
  );
  const assetPaths = new Set(normalizeAssetList(deckManifest.assets ?? deckManifest.files?.assets ?? template.assets));
  for (const slide of htmlSlides) {
    for (const assetPath of extractTemplateAssetPaths(slide.html)) assetPaths.add(assetPath);
  }
  const assets = await Promise.all(
    Array.from(assetPaths, async (assetPath) => ({
      path: assetPath,
      bytes: Buffer.from(await (await fetchCloudResource(`${assetBaseUrl}${encodeAssetPath(assetPath)}`)).arrayBuffer()),
    })),
  );

  return {
    title: deckManifest.metadata?.title ?? deckManifest.title ?? template.name ?? "",
    canvas,
    slides: htmlSlides,
    assets,
  };
}

async function getCloudTemplate(templateId: string) {
  const manifest = await getCloudManifest();
  const template = manifest.templates.find((item) => item.id === templateId && item.enabled !== false);
  if (!template) throw new Error(`Template not found: ${templateId}`);
  return template;
}

async function getCloudManifest() {
  const now = Date.now();
  if (cachedCloudManifest && cachedCloudManifest.expiresAt > now) return cachedCloudManifest.manifest;
  try {
    const response = await fetch(absoluteCloudUrl(manifestPath()));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const manifest = (await response.json()) as CloudSlideTemplateManifest;
    validateCloudManifest(manifest);
    staleCloudManifest = manifest;
    cachedCloudManifest = {
      expiresAt: now + manifestCacheTtlMs(),
      manifest,
    };
    return manifest;
  } catch (error) {
    if (staleCloudManifest) return staleCloudManifest;
    const message = error instanceof Error ? error.message : "Unable to fetch template manifest";
    throw new Error(`Unable to fetch template manifest: ${message}`);
  }
}

async function fetchCloudResource(pathOrUrl: string) {
  const url = absoluteCloudUrl(pathOrUrl);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to fetch template resource ${url}: ${response.status} ${response.statusText}`);
  return response;
}

function validateCloudManifest(manifest: CloudSlideTemplateManifest) {
  if (manifest.schemaVersion !== 1 || manifest.type !== "slide" || !Array.isArray(manifest.templates)) {
    throw new Error("Invalid slide template manifest");
  }
}

function cloudTemplateToSlideTemplate(template: CloudSlideTemplateManifestEntry): SlideTemplate {
  const thumbnailImages = (template.thumbnailImages ?? []).map(absoluteCloudUrl);
  const previewImages = (template.previewImages ?? []).map(absoluteCloudUrl);
  return {
    id: template.id,
    name: template.name || template.slug || template.id,
    slug: template.slug || template.id,
    category: template.category || template.classification || "uncategorized",
    shortDescription: template.shortDescription || "",
    description: template.description || template.shortDescription || "",
    language: template.language || template.lang || "en-US",
    tags: Array.isArray(template.tags) ? template.tags : [],
    updatedAt: template.updatedAt || template.updated_at || "",
    slideCount: Number(template.slideCount ?? previewImages.length ?? thumbnailImages.length) || 0,
    canvas: normalizeCanvas(template.canvas),
    coverImage: absoluteCloudUrl(template.coverImage || template.coverUrl || template.screenshotUrl || ""),
    stripImages: (template.stripImages?.length ? template.stripImages : thumbnailImages.slice(0, 4)).map(absoluteCloudUrl),
    previewImages,
    thumbnailImages,
  };
}

function normalizeCloudSlides(manifest: CloudDeckManifest): CloudSlideDescriptor[] {
  const source = manifest.playlist ?? manifest.slides ?? manifest.pages ?? manifest.files?.pages ?? [];
  return source.map(normalizeCloudSlide).filter((slide): slide is CloudSlideDescriptor => Boolean(slide?.fileName));
}

function normalizeCloudSlide(item: unknown, index: number): CloudSlideDescriptor | null {
  if (typeof item === "string") return { fileName: item };
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  const fileName = stringValue(value.fileName) || stringValue(value.file) || stringValue(value.path) || stringValue(value.name) || `slide-${index + 1}.html`;
  return {
    fileName,
    pageUrl: stringValue(value.htmlUrl) || stringValue(value.pageUrl) || stringValue(value.url),
  };
}

function normalizeAssetList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : stringValue((item as Record<string, unknown>)?.path))).filter(Boolean);
}

function normalizeCanvas(canvas?: { width?: number; height?: number }) {
  return {
    width: Number.isFinite(canvas?.width) ? Number(canvas?.width) : 1920,
    height: Number.isFinite(canvas?.height) ? Number(canvas?.height) : 1080,
  };
}

function extractTemplateAssetPaths(html: string) {
  const assetPaths = new Set<string>();
  for (const url of extractCandidateUrls(html)) {
    const assetPath = assetPathFromRelativeUrl(url, ["../assets/", "./assets/", "assets/"]);
    if (assetPath) assetPaths.add(assetPath);
  }
  return assetPaths;
}

function extractCandidateUrls(html: string) {
  const urls: string[] = [];
  for (const match of html.matchAll(/\b(?:src|href|poster|data)\s*=\s*["']([^"']+)["']/gi)) {
    if (match[1]) urls.push(match[1]);
  }
  for (const match of html.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
    if (match[2]) urls.push(match[2]);
  }
  return urls;
}

function templateBaseUrl(template: CloudSlideTemplateManifestEntry, sourceUrl: string) {
  const url = absoluteCloudUrl(sourceUrl || template.sourceUrl || template.deckUrl || template.slidesUrl || "");
  if (url) return url.slice(0, url.lastIndexOf("/") + 1);
  return `${cloudFrontBaseUrl()}/office-templates/slide/templates/${encodeURIComponent(template.id)}/`;
}

function templateProviderKind(): TemplateProviderKind {
  return process.env.AI_SLIDE_TEMPLATE_PROVIDER === "local" ? "local" : "cloud";
}

function localTemplateIdFilter() {
  const inlineIds = process.env.AI_SLIDE_TEMPLATE_IDS?.split(",") ?? [];
  const fileIds = process.env.AI_SLIDE_TEMPLATE_ID_FILE && existsSync(process.env.AI_SLIDE_TEMPLATE_ID_FILE)
    ? readFileSync(process.env.AI_SLIDE_TEMPLATE_ID_FILE, "utf8").split(/\r?\n/)
    : [];
  const ids = [...inlineIds, ...fileIds].map((id) => id.trim()).filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

function templateAssetUrl(value: string) {
  const assetPath = value.replace(/^\/generated\/(?:templates\/)?/, "");
  return `${assetRoutePrefix}/${assetPath.split("/").map(encodeURIComponent).join("/")}`;
}

function templateAssetRoots() {
  return [
    process.env.AI_SLIDE_TEMPLATE_ASSET_ROOT ? resolve(process.env.AI_SLIDE_TEMPLATE_ASSET_ROOT) : "",
    resolve(appRoot(), "templates", "generated"),
  ].filter(Boolean);
}

function appRoot() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentDir, "../../../.."),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "apps", "slide"),
  ];
  return candidates.find((candidate) => existsSync(join(candidate, "package.json"))) ?? resolve(process.cwd(), "..");
}

function cloudFrontBaseUrl() {
  return (process.env.AI_SLIDE_TEMPLATE_BASE_URL || defaultCloudFrontBaseUrl).replace(/\/+$/, "");
}

function manifestPath() {
  return process.env.AI_SLIDE_TEMPLATE_MANIFEST_PATH || defaultManifestPath;
}

function manifestCacheTtlMs() {
  const value = Number(process.env.AI_SLIDE_TEMPLATE_CACHE_TTL_MS ?? 60_000);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

function absoluteCloudUrl(pathOrUrl: string) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${cloudFrontBaseUrl()}/${pathOrUrl.replace(/^\/+/, "")}`;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "";
}

function missingTemplateSlideHtml(fileName: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
</head>
<body>
  <section class="slide"></section>
</body>
</html>
`;
}
