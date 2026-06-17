import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourceJson = process.env.AI_DOC_TEMPLATE_JSON ?? path.join(appRoot, "templates", "genspark", "template.json");
const outputRoot = process.env.AI_DOC_TEMPLATE_ROOT ?? path.join(appRoot, "templates", "genspark");

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
  await mkdir(templateDir, { recursive: true });
  await writeFile(path.join(templateDir, "document.html"), String(item.content), "utf8");
  await writeFile(
    path.join(templateDir, "metadata.json"),
    `${JSON.stringify(
      {
        id: String(item.id),
        name: String(item.name),
        classification: String(item.classification || "Uncategorized"),
        url: typeof item.url === "string" ? item.url : undefined,
        html_cdn_url: typeof item.html_cdn_url === "string" ? item.html_cdn_url : undefined,
        screenshot_cdn_url: typeof item.screenshot_cdn_url === "string" ? item.screenshot_cdn_url : undefined,
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
