import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentLibraryTemplate } from "@ai-doc/shared";

export function listTemplates(): DocumentLibraryTemplate[] {
  const root = templateRoot();
  if (!existsSync(root)) return [];
  const templates: DocumentLibraryTemplate[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const template = readTemplateDir(join(root, entry.name));
    if (template) templates.push(template);
  }
  return templates
    .sort((left, right) => left.classification.localeCompare(right.classification) || left.name.localeCompare(right.name));
}

function templateRoot() {
  return process.env.AI_DOC_TEMPLATE_ROOT ? resolve(process.env.AI_DOC_TEMPLATE_ROOT) : resolve(appRoot(), "templates", "genspark");
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

function readTemplateDir(templateDir: string) {
  const metadataPath = join(templateDir, "metadata.json");
  const htmlPath = join(templateDir, "document.html");
  if (!existsSync(metadataPath) || !existsSync(htmlPath)) return null;
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as Partial<DocumentLibraryTemplate>;
  const content = readFileSync(htmlPath, "utf8");
  if (!metadata.id || !metadata.name || !content) return null;
  return {
    id: String(metadata.id),
    name: String(metadata.name),
    classification: String(metadata.classification || "Uncategorized"),
    content,
    screenshot_cdn_url: typeof metadata.screenshot_cdn_url === "string" ? metadata.screenshot_cdn_url : undefined,
    screenshot_width: typeof metadata.screenshot_width === "number" ? metadata.screenshot_width : undefined,
    screenshot_height: typeof metadata.screenshot_height === "number" ? metadata.screenshot_height : undefined,
  };
}
