import { existsSync } from "node:fs";
import { access, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentLibraryTemplate } from "@ai-doc/shared";
import { assetPathFromRelativeUrl, encodeAssetPath } from "@ai-app/shared/artifact-assets";

type TemplateProviderKind = "cloud" | "local";

interface CloudTemplateManifest {
  schemaVersion: number;
  type: "doc";
  templates: CloudTemplateManifestEntry[];
}

interface CloudTemplateManifestEntry {
  id: string;
  enabled?: boolean;
  name: string;
  classification: string;
  documentUrl: string;
  screenshotUrl?: string;
  screenshot?: {
    width?: number;
    height?: number;
  };
}

interface LocalTemplateMetadata {
  id?: string;
  name?: string;
  classification?: string;
  screenshot_width?: number;
  screenshot_height?: number;
  screenshot?: {
    width?: number;
    height?: number;
  };
}

interface LoadedTemplateDocument {
  id: string;
  name: string;
  content: string;
}

const defaultCloudFrontBaseUrl = "https://d2ddkmrpvnj1wf.cloudfront.net";
const defaultManifestPath = "/office-templates/doc/template.json";
let cachedCloudManifest: { expiresAt: number; manifest: CloudTemplateManifest } | null = null;
let staleCloudManifest: CloudTemplateManifest | null = null;

export async function listTemplates(): Promise<DocumentLibraryTemplate[]> {
  if (templateProviderKind() === "local") return listLocalTemplates();
  const manifest = await getCloudManifest();
  return manifest.templates
    .filter((template) => template.enabled !== false)
    .map((template) => ({
      id: template.id,
      name: template.name,
      classification: template.classification || "Uncategorized",
      content: "",
      screenshot_cdn_url: template.screenshotUrl ? absoluteCloudUrl(template.screenshotUrl) : undefined,
      screenshot_width: template.screenshot?.width,
      screenshot_height: template.screenshot?.height,
    }));
}

export function getTemplateScreenshotFile(templateId: string) {
  if (templateProviderKind() !== "local") return null;
  const filePath = join(localTemplateRoot(), templateId, "screenshot.png");
  return { filePath, fileName: "screenshot.png" };
}

export async function loadTemplateProjectSeed(templateId: string): Promise<LoadedTemplateDocument> {
  if (templateProviderKind() === "local") return loadLocalTemplateProjectSeed(templateId);
  const template = await getCloudTemplate(templateId);
  const response = await fetchCloudResource(template.documentUrl);
  return {
    id: template.id,
    name: template.name,
    content: await response.text(),
  };
}

export async function materializeTemplateAssetsToProject(templateId: string, projectAssetsDir: string, html?: string) {
  if (templateProviderKind() === "local") {
    await copyLocalTemplateAssetsToProject(templateId, projectAssetsDir);
    return;
  }
  const template = await getCloudTemplate(templateId);
  const content = html ?? (await (await fetchCloudResource(template.documentUrl)).text());
  const assetPaths = extractTemplateAssetPaths(content);
  if (assetPaths.size === 0) return;
  const templateUrl = absoluteCloudUrl(template.documentUrl);
  const templateBaseUrl = templateUrl.slice(0, templateUrl.lastIndexOf("/") + 1);
  await mapWithConcurrency(Array.from(assetPaths), 6, async (assetPath) => {
      const response = await fetch(`${templateBaseUrl}assets/${encodeAssetPath(assetPath)}`);
      if (!response.ok) throw new Error(`Unable to fetch template asset ${assetPath}: ${response.status} ${response.statusText}`);
      const targetPath = join(projectAssetsDir, assetPath);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
  });
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
    const manifest = (await response.json()) as CloudTemplateManifest;
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

function validateCloudManifest(manifest: CloudTemplateManifest) {
  if (manifest.schemaVersion !== 1 || manifest.type !== "doc" || !Array.isArray(manifest.templates)) {
    throw new Error("Invalid doc template manifest");
  }
}

async function listLocalTemplates(): Promise<DocumentLibraryTemplate[]> {
  const root = localTemplateRoot();
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const templates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<DocumentLibraryTemplate | null> => {
        const templateId = entry.name;
        const templateDir = join(root, templateId);
        const metadata = await readLocalMetadata(templateDir);
        if (!metadata) return null;
        const content = await readFile(join(templateDir, "document.html"), "utf8").catch(() => "");
        if (!content) return null;
        return {
          id: metadata.id || templateId,
          name: metadata.name || "Untitled Template",
          classification: metadata.classification || "Uncategorized",
          content,
          screenshot_cdn_url: `/api/templates/${encodeURIComponent(templateId)}/screenshot`,
          screenshot_width: metadata.screenshot?.width ?? metadata.screenshot_width,
          screenshot_height: metadata.screenshot?.height ?? metadata.screenshot_height,
        } satisfies DocumentLibraryTemplate;
      }),
  );
  return templates.filter((template): template is DocumentLibraryTemplate => Boolean(template)).sort((a, b) => a.name.localeCompare(b.name));
}

async function loadLocalTemplateProjectSeed(templateId: string): Promise<LoadedTemplateDocument> {
  const templateDir = join(localTemplateRoot(), templateId);
  const metadata = await readLocalMetadata(templateDir);
  if (!metadata) throw new Error(`Template not found: ${templateId}`);
  return {
    id: metadata.id || templateId,
    name: metadata.name || "Untitled Template",
    content: await readFile(join(templateDir, "document.html"), "utf8"),
  };
}

async function copyLocalTemplateAssetsToProject(templateId: string, projectAssetsDir: string) {
  const assetsDir = join(localTemplateRoot(), templateId, "assets");
  try {
    await access(assetsDir);
  } catch {
    return;
  }
  await mkdir(projectAssetsDir, { recursive: true });
  await cp(assetsDir, projectAssetsDir, { recursive: true });
}

async function readLocalMetadata(templateDir: string) {
  try {
    return JSON.parse(await readFile(join(templateDir, "metadata.json"), "utf8")) as LocalTemplateMetadata;
  } catch {
    return null;
  }
}

function extractTemplateAssetPaths(html: string) {
  const assetPaths = new Set<string>();
  for (const url of extractCandidateUrls(html)) {
    const assetPath = assetPathFromRelativeUrl(url, ["./assets/", "assets/"]);
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

async function mapWithConcurrency<T>(items: readonly T[], concurrency: number, work: (item: T) => Promise<void>) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await work(item);
    }
  }));
}

function templateProviderKind(): TemplateProviderKind {
  return process.env.AI_DOC_TEMPLATE_PROVIDER === "local" ? "local" : "cloud";
}

function localTemplateRoot() {
  return process.env.AI_DOC_TEMPLATE_ROOT ? resolve(process.env.AI_DOC_TEMPLATE_ROOT) : resolve(appRoot(), "templates", "tutti");
}

function appRoot() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentDir, "../../../.."),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "apps", "doc"),
  ];
  return candidates.find((candidate) => existsSync(join(candidate, "package.json"))) ?? resolve(process.cwd(), "..");
}

function cloudFrontBaseUrl() {
  return (process.env.AI_DOC_TEMPLATE_BASE_URL || defaultCloudFrontBaseUrl).replace(/\/+$/, "");
}

function manifestPath() {
  return process.env.AI_DOC_TEMPLATE_MANIFEST_PATH || defaultManifestPath;
}

function manifestCacheTtlMs() {
  const value = Number(process.env.AI_DOC_TEMPLATE_CACHE_TTL_MS ?? 60_000);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

function absoluteCloudUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${cloudFrontBaseUrl()}/${pathOrUrl.replace(/^\/+/, "")}`;
}
