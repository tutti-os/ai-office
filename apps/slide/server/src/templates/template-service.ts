import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { SlideTemplate } from "@ai-slide/shared";
import { slideTemplates as bundledSlideTemplates } from "../../../shared/src/generatedTemplates.js";

const assetRoutePrefix = "/api/templates/assets";

export function listTemplates(): SlideTemplate[] {
  return bundledSlideTemplates.map((template) => ({
    ...template,
    coverImage: template.coverImage ? templateAssetUrl(template.coverImage) : "",
    stripImages: template.stripImages.map(templateAssetUrl),
    previewImages: template.previewImages.map(templateAssetUrl),
    thumbnailImages: template.thumbnailImages.map(templateAssetUrl),
  }));
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
  const root = templateAssetRoot();
  if (!existsSync(root)) await mkdir(root, { recursive: true });
}

function templateAssetUrl(value: string) {
  const assetPath = value.replace(/^\/generated\/templates\//, "");
  return `${assetRoutePrefix}/${assetPath.split("/").map(encodeURIComponent).join("/")}`;
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

function templateAssetRoots() {
  return [
    process.env.AI_SLIDE_TEMPLATE_ASSET_ROOT ? resolve(process.env.AI_SLIDE_TEMPLATE_ASSET_ROOT) : "",
    resolve(appRoot(), "templates", "generated", "templates"),
  ].filter(Boolean);
}
