import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourceJson = process.env.AI_DOC_TEMPLATE_JSON ?? path.join(appRoot, "templates", "tutti", "template.json");
const outputRoot = process.env.AI_DOC_TEMPLATE_ROOT ?? path.join(appRoot, "templates", "tutti");

function safeDirName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function uniqueDirName(template, used) {
  const base = safeDirName(template.id || template.name || "template") || "template";
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeScreenshotUrl(value) {
  if (typeof value !== "string" || !value) return undefined;
  return value.replaceAll("page.tuttisite.com", "page.gensparksite.com").replaceAll("cdn1.tutti.ai", "cdn1.genspark.ai");
}

function normalizeResourceUrl(value) {
  return value
    .replaceAll("page.tuttisite.com", "page.gensparksite.com")
    .replaceAll("page1.tutti.site", "page1.genspark.site")
    .replaceAll("cdn1.tutti.ai", "cdn1.genspark.ai");
}

function assetExtension(contentType) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("gif")) return "gif";
  return "png";
}

async function downloadTemplateScreenshot(url, templateDir) {
  if (!url) return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) throw new Error(`Expected image content, received ${contentType || "unknown content type"}`);
    const extension = assetExtension(contentType);
    const fileName = `screenshot.${extension}`;
    await writeFile(path.join(templateDir, fileName), Buffer.from(await response.arrayBuffer()));
    return fileName;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Unable to download screenshot for ${templateDir}: ${message}`);
    return undefined;
  }
}

function templateResourceUrls(html) {
  const urls = new Set();
  const pattern = /https:\/\/(?:page\.tuttisite\.com|page1\.tutti\.site|cdn1\.tutti\.ai)[^"'()\s<>\\]+/g;
  for (const match of html.matchAll(pattern)) {
    urls.add(match[0]);
  }
  return Array.from(urls);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function withDocumentTitle(html, title) {
  const titleTag = `<title>${escapeHtml(title)}</title>`;
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, titleTag);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}\n  ${titleTag}`);
  return `<!DOCTYPE html>\n<html><head>${titleTag}</head><body>${html}</body></html>`;
}

async function localizeTemplateHtmlResources(html, templateDir, templateId) {
  let localizedHtml = html;
  const urls = templateResourceUrls(html);
  if (!urls.length) return localizedHtml;

  const assetDir = path.join(templateDir, "assets");
  await mkdir(assetDir, { recursive: true });

  for (const sourceUrl of urls) {
    const downloadUrl = normalizeResourceUrl(sourceUrl);
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const contentType = response.headers.get("content-type") ?? "";
      const extension = assetExtension(contentType);
      const hash = createHash("sha256").update(downloadUrl).digest("hex").slice(0, 16);
      const fileName = `${hash}.${extension}`;
      const assetPath = `./assets/${fileName}`;
      await writeFile(path.join(assetDir, fileName), Buffer.from(await response.arrayBuffer()));
      localizedHtml = localizedHtml.replaceAll(sourceUrl, assetPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Unable to download resource ${downloadUrl}: ${message}`);
      localizedHtml = localizedHtml.replaceAll(sourceUrl, downloadUrl);
    }
  }

  return localizedHtml;
}

const raw = JSON.parse(await readFile(sourceJson, "utf8"));
if (!Array.isArray(raw)) throw new Error(`Expected ${sourceJson} to contain a JSON array`);

const existingEntries = await readdir(outputRoot, { withFileTypes: true }).catch(() => []);
for (const entry of existingEntries) {
  if (entry.isDirectory()) await rm(path.join(outputRoot, entry.name), { force: true, recursive: true });
}

const used = new Set();
let count = 0;
for (const item of raw) {
  if (!item?.id || !item?.name || !item?.content) continue;
  const dirName = uniqueDirName(item, used);
  const templateDir = path.join(outputRoot, dirName);
  const screenshotUrl = normalizeScreenshotUrl(item.screenshot_cdn_url);
  const templateName = String(item.name);
  await mkdir(templateDir, { recursive: true });
  const html = withDocumentTitle(await localizeTemplateHtmlResources(String(item.content), templateDir, String(item.id)), templateName);
  await writeFile(path.join(templateDir, "document.html"), html, "utf8");
  const screenshotFileName = await downloadTemplateScreenshot(screenshotUrl, templateDir);
  await writeFile(
    path.join(templateDir, "source.json"),
    `${JSON.stringify({ url: typeof item.url === "string" ? item.url : "" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(templateDir, "metadata.json"),
    `${JSON.stringify(
      {
        id: String(item.id),
        name: templateName,
        classification: String(item.classification || "Uncategorized"),
        html_cdn_url: "document.html",
        screenshot_cdn_url: screenshotFileName,
        screenshot_width: typeof item.screenshot_width === "number" ? item.screenshot_width : undefined,
        screenshot_height: typeof item.screenshot_height === "number" ? item.screenshot_height : undefined,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  count += 1;
}

console.log(`Synced ${count} doc templates from ${sourceJson} to ${outputRoot}`);
