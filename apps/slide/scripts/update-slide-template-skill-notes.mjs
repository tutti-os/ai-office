import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.resolve(process.env.AI_SLIDE_TEMPLATE_ROOT ?? path.join(appRoot, "templates", "source"));
const restyleScriptPath = path.join(scriptDir, "restyle-slide-template-batch.mjs");

const profiles = await loadProfiles();
const ids = parseIds(process.argv);
const templateIds = ids.length ? ids : await restyledTemplateIds();
const dryRun = process.argv.includes("--dry-run");

for (const id of templateIds) {
  const profile = profiles[id];
  if (!profile) throw new Error(`No restyle profile is defined for "${id}"`);
  const templateDir = path.join(sourceRoot, id);
  const skillPath = path.join(templateDir, "SKILL.md");
  const metadataPath = path.join(templateDir, "metadata.json");
  if (!existsSync(skillPath)) throw new Error(`Missing SKILL.md for ${id}`);
  if (!existsSync(metadataPath)) throw new Error(`Missing metadata.json for ${id}`);

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const previewPath = firstPreviewPath(metadata);
  const before = await readFile(skillPath, "utf8");
  const after = updateSkillMarkdown(before, id, profile, previewPath);
  const changed = before !== after;
  console.log(`${dryRun ? "Would update" : "Updated"} ${id} (${profile.name})${changed ? "" : " — already current"}`);
  if (changed && !dryRun) await writeFile(skillPath, after);
}

async function loadProfiles() {
  const source = await readFile(restyleScriptPath, "utf8");
  const match = source.match(/const profiles = (\{[\s\S]*?\n\});\n\nconst requestedIds/);
  if (!match) throw new Error(`Unable to parse profiles from ${restyleScriptPath}`);
  return Function(`"use strict"; return (${match[1]});`)();
}

async function restyledTemplateIds() {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(path.join(sourceRoot, id, ".restyle-profile.json")))
    .sort((a, b) => a.localeCompare(b));
}

function updateSkillMarkdown(source, id, profile, previewPath) {
  const localImage = `![${id} visual preview](${previewPath})`;
  let next = source.replace(
    /^!\[[^\]\n]*methodology illustration[^\]\n]*\]\(https?:\/\/[^\n]*genspark[^\n]*\)\n+/m,
    `${localImage}\n\n`,
  );
  if (next === source && !next.includes(localImage)) {
    next = next.replace(/(>\s+[^\n]+\n\n)/, `$1${localImage}\n\n`);
  }

  const block = visualLanguageBlock(profile);
  const markedBlock = `<!-- ai-office-restyle:start -->\n${block}\n<!-- ai-office-restyle:end -->`;
  if (/<!-- ai-office-restyle:start -->[\s\S]*?<!-- ai-office-restyle:end -->/.test(next)) {
    return next.replace(/<!-- ai-office-restyle:start -->[\s\S]*?<!-- ai-office-restyle:end -->/, markedBlock);
  }
  if (next.includes("## Why this skill works")) {
    return next.replace("## Why this skill works", `${markedBlock}\n\n## Why this skill works`);
  }
  return `${next.trimEnd()}\n\n${markedBlock}\n`;
}

function visualLanguageBlock(profile) {
  const fonts = [
    `body ${compactFont(profile.bodyFont)}`,
    profile.serifFont ? `serif ${compactFont(profile.serifFont)}` : "",
    `mono ${compactFont(profile.monoFont)}`,
  ].filter(Boolean);
  const accents = accentColors(profile).join(", ");
  const surface = surfaceColor(profile);
  const texture = profile.textureSize ? `subtle ${profile.textureSize} grid/noise texture` : "subtle texture";
  return `## Visual language

Use the refreshed visual system **${profile.name}** when generating or editing this template.

- **Typography:** ${fonts.join("; ")}. Keep the existing hierarchy and slide-specific scale; do not introduce new type ramps.
- **Color and surface:** primary accents ${accents || "from the refreshed palette"} on ${surface || "the refreshed warm-neutral surface"}. Preserve contrast for small captions, footnotes, chart labels, and legal/source text.
- **Background and texture:** use ${texture} as atmosphere only; it must never change the slide geometry or compete with photos, charts, or dense tables.
- **Layout contract:** keep the current page count, page order, component positions, and text lengths. Visual refreshes may tune color, typeface, rules, fills, and emphasis, but not the layout skeleton.
- **Asset rule:** reference local template assets/previews with relative paths. Do not add externally hosted images, remote CSS, or remote template assets.`;
}

function firstPreviewPath(metadata) {
  const previews = metadata.deck?.previews ?? metadata.files?.previews ?? metadata.previews ?? [];
  const first = previews.find((item) => typeof item === "string" && item.endsWith(".png"));
  return first || "previews/01-01-cover.png";
}

function compactFont(value = "") {
  const first = String(value)
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .find(Boolean);
  return first || "the template font";
}

function accentColors(profile) {
  const colors = Object.values(profile.replacements ?? {})
    .filter((value) => /^#[0-9A-Fa-f]{6}$/.test(value))
    .map((value) => value.toUpperCase());
  const seen = new Set();
  return colors
    .filter((color) => {
      if (seen.has(color)) return false;
      seen.add(color);
      return !isNearWhite(color) && !isNearBlack(color);
    })
    .slice(0, 5);
}

function surfaceColor(profile) {
  const matches = String(profile.backgroundCss ?? "").match(/#[0-9A-Fa-f]{6}/g) ?? [];
  return matches.at(-1)?.toUpperCase() ?? "";
}

function isNearWhite(hex) {
  const [r, g, b] = rgb(hex);
  return r > 235 && g > 235 && b > 225;
}

function isNearBlack(hex) {
  const [r, g, b] = rgb(hex);
  return r < 35 && g < 35 && b < 35;
}

function rgb(hex) {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

function parseIds(argv) {
  const value = optionValue(argv, "--ids");
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionValue(argv, name) {
  const index = argv.findIndex((arg) => arg === name);
  return index === -1 ? "" : String(argv[index + 1] ?? "");
}
