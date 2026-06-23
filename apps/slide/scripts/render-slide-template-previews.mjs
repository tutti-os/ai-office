import { createRequire } from "node:module";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.resolve(process.env.AI_SLIDE_TEMPLATE_ROOT ?? path.join(appRoot, "templates", "source"));
const nodeModuleRoots = [
  ...String(process.env.NODE_PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean),
  process.env.AI_OFFICE_NODE_MODULES,
].filter(Boolean);

const ids = parseIds(process.argv);
const limit = positiveInt(optionValue("--limit"), Number.POSITIVE_INFINITY);
const waitMs = positiveInt(optionValue("--wait-ms"), 350);
const dryRun = process.argv.includes("--dry-run");

const { chromium } = await loadPackage("playwright");
const sharp = await loadPackage("sharp");
const browser = dryRun
  ? null
  : await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });

try {
  const templateIds = ids.length ? ids : await allTemplateIds();
  for (const id of templateIds) {
    await renderTemplate(browser, sharp, id);
  }
} finally {
  await browser?.close();
}

async function renderTemplate(browser, sharp, id) {
  const templateDir = path.join(sourceRoot, id);
  const metadataPath = path.join(templateDir, "metadata.json");
  if (!existsSync(metadataPath)) throw new Error(`Missing metadata.json for ${id}`);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const pages = (await canonicalPagePaths(templateDir)) ?? metadata.deck?.pages ?? metadata.files?.pages ?? [];
  const previews = metadata.deck?.previews ?? metadata.files?.previews ?? [];
  const thumbnails = metadata.deck?.thumbnails ?? metadata.files?.thumbnails ?? [];
  if (!pages.length) throw new Error(`Template ${id} has no pages`);

  const count = Math.min(pages.length, previews.length || pages.length, thumbnails.length || pages.length, limit);
  console.log(`${dryRun ? "Would render" : "Rendering"} ${id}: ${count}/${pages.length} pages`);
  if (dryRun) return;

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30_000);
  for (let index = 0; index < count; index += 1) {
    const pagePath = path.join(templateDir, pages[index]);
    const previewPath = path.join(templateDir, previews[index] ?? previewNameFor(pages[index], index));
    const thumbnailPath = path.join(templateDir, thumbnails[index] ?? thumbnailNameFor(previewPath));
    await mkdir(path.dirname(previewPath), { recursive: true });
    await mkdir(path.dirname(thumbnailPath), { recursive: true });

    await page.goto(pathToFileURL(pagePath).href, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({
      content:
        "*{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;} html,body{width:1920px;height:1080px;}",
    });
    await page.waitForTimeout(waitMs);
    await page.screenshot({ path: previewPath, type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    await sharp(previewPath).resize(480, 270, { fit: "fill" }).png().toFile(thumbnailPath);
  }
  await page.close();
}

async function canonicalPagePaths(templateDir) {
  const manifestPath = path.join(templateDir, "deck.slides", "manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const playlist = Array.isArray(manifest.playlist) ? manifest.playlist.filter((item) => typeof item === "string" && item.endsWith(".html")) : [];
  if (!playlist.length) return null;
  return playlist.map((item) => (item.startsWith("pages/") ? item : `pages/${item}`));
}

async function loadPackage(name) {
  try {
    return await import(name);
  } catch (importError) {
    const require = createRequire(import.meta.url);
    for (const root of nodeModuleRoots) {
      try {
        return require(require.resolve(name, { paths: [root] }));
      } catch {
        // Try the next configured module root.
      }
    }
    throw importError;
  }
}

async function allTemplateIds() {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}

function parseIds(argv) {
  const value = optionValue("--ids");
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionValue(name) {
  const index = process.argv.findIndex((arg) => arg === name);
  return index === -1 ? "" : String(process.argv[index + 1] ?? "");
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function previewNameFor(pagePath, index) {
  const pageName = path.basename(pagePath, ".html");
  return `previews/${String(index + 1).padStart(2, "0")}-${pageName}.png`;
}

function thumbnailNameFor(previewPath) {
  return previewPath.replace(/^previews\//, "thumbnails/");
}
