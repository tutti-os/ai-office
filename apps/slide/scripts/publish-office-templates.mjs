import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");

const bucket = process.env.AI_OFFICE_TEMPLATE_BUCKET ?? "tsh-office-templates";
const prefix = trimSlashes(process.env.AI_OFFICE_TEMPLATE_PREFIX ?? "office-templates");
const type = "slide";
const sourceRoot = path.resolve(process.env.AI_SLIDE_TEMPLATE_ROOT ?? path.join(appRoot, "templates", "source"));
const stagingRoot = path.resolve(process.env.AI_OFFICE_TEMPLATE_STAGING_ROOT ?? "/tmp/ai-slide-office-templates-slide-publish");
const cloudFrontDistributionId = process.env.AI_OFFICE_TEMPLATE_CLOUDFRONT_DISTRIBUTION_ID ?? "E3QP4ZVQXB1XF5";
const limitPerCategory = positiveInt(process.env.AI_SLIDE_TEMPLATE_CATEGORY_LIMIT, 5);
const upload = !process.argv.includes("--no-upload");
const dryRun = process.argv.includes("--dry-run");
const invalidate = process.argv.includes("--invalidate");

function trimSlashes(value) {
  return String(value).replace(/^\/+|\/+$/g, "");
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function sha256File(filePath) {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function templateBasePath(templateId) {
  return `/${prefix}/${type}/templates/${encodeURIComponent(templateId)}`;
}

function manifestPath() {
  return `/${prefix}/${type}/template.json`;
}

function encodePathParts(value) {
  return String(value).split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function templateFileUrl(templateId, relativePath) {
  return `${templateBasePath(templateId)}/${encodePathParts(relativePath)}`;
}

async function listFilesRecursive(root, current = "") {
  const dir = path.join(root, current);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const results = [];
  for (const entry of entries) {
    const relativePath = current ? `${current}/${entry.name}` : entry.name;
    if (entry.isDirectory()) results.push(...(await listFilesRecursive(root, relativePath)));
    else if (entry.isFile()) results.push(relativePath);
  }
  return results;
}

function sortSlideAssets(items) {
  return [...(items ?? [])].sort((a, b) => {
    const left = Number.parseInt(path.basename(a), 10);
    const right = Number.parseInt(path.basename(b), 10);
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
    return String(a).localeCompare(String(b));
  });
}

function compactDescription(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCanvas(canvas) {
  return {
    width: Number.isFinite(canvas?.width) ? Number(canvas.width) : 1920,
    height: Number.isFinite(canvas?.height) ? Number(canvas.height) : 1080,
  };
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

function metadataUpdatedAt(metadata) {
  return metadata.updatedAt ?? metadata.updated_at ?? "";
}

function metadataDeck(metadata) {
  return metadata.deck ?? {};
}

async function readDeckManifest(templateDir) {
  const deckDir = path.join(templateDir, "deck");
  const entries = await readdir(deckDir, { withFileTypes: true }).catch(() => []);
  const slidesDirName = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(".slides"))?.name;
  if (!slidesDirName) return null;
  const manifestPath = path.join(deckDir, slidesDirName, "manifest.json");
  if (!(await fileExists(manifestPath))) return null;
  return readJson(manifestPath);
}

async function collectCandidates() {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceDir = path.join(sourceRoot, entry.name);
    const metadataPath = path.join(sourceDir, "metadata.json");
    if (!(await fileExists(metadataPath))) continue;
    const metadata = await readJson(metadataPath);
    const deck = await readDeckManifest(sourceDir);
    const playlist = (deck?.playlist ?? []).filter((item) => typeof item === "string" && item.endsWith(".html"));
    if (!playlist.length) continue;
    const templateId = metadataId(metadata, entry.name);
    candidates.push({
      id: templateId,
      sourceDir,
      metadata,
      deck,
      playlist,
      category: String(metadata.category || "uncategorized"),
      name: metadataTitle(metadata, templateId),
    });
  }
  return candidates;
}

function selectTemplates(candidates) {
  const byCategory = new Map();
  for (const candidate of candidates) {
    const items = byCategory.get(candidate.category) ?? [];
    items.push(candidate);
    byCategory.set(candidate.category, items);
  }
  const selected = [];
  for (const category of [...byCategory.keys()].sort((a, b) => a.localeCompare(b))) {
    selected.push(
      ...byCategory
        .get(category)
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(0, limitPerCategory),
    );
  }
  return selected;
}

async function stageTemplate(candidate) {
  const targetDir = path.join(stagingRoot, "templates", candidate.id);
  await cp(candidate.sourceDir, targetDir, { recursive: true, force: true });

  const assets = (await listFilesRecursive(path.join(candidate.sourceDir, "assets"))).sort((a, b) => a.localeCompare(b));
  const metadataDeckInfo = metadataDeck(candidate.metadata);
  const canvas = normalizeCanvas(candidate.deck?.canvas ?? metadataDeckInfo.canvas ?? candidate.metadata.canvas);
  const deck = {
    schemaVersion: "ai-slide.template.deck.v1",
    title: candidate.deck?.metadata?.title || candidate.name,
    canvas,
    playlist: candidate.playlist,
    assets,
  };
  await writeFile(path.join(targetDir, "deck.json"), `${JSON.stringify(deck, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(targetDir, "source.json"),
    `${JSON.stringify({ schemaVersion: "ai-slide.template.source.v1", deckUrl: `${templateBasePath(candidate.id)}/deck.json` }, null, 2)}\n`,
    "utf8",
  );

  const previews = sortSlideAssets(metadataDeckInfo.previews ?? candidate.metadata.files?.previews ?? []);
  const thumbnails = sortSlideAssets(metadataDeckInfo.thumbnails ?? candidate.metadata.files?.thumbnails ?? []);
  const coverImage = previews[0] || thumbnails[0] || "";
  const previewImages = previews.map((item) => templateFileUrl(candidate.id, item));
  const thumbnailImages = thumbnails.map((item) => templateFileUrl(candidate.id, item));

  return {
    id: candidate.id,
    enabled: true,
    name: candidate.name,
    slug: candidate.id,
    category: candidate.category,
    shortDescription: compactDescription(metadataSummary(candidate.metadata)),
    description: compactDescription(candidate.metadata.description),
    language: metadataLocale(candidate.metadata),
    tags: candidate.metadata.tags ?? [],
    updatedAt: metadataUpdatedAt(candidate.metadata),
    slideCount: candidate.playlist.length,
    canvas,
    metadataUrl: templateFileUrl(candidate.id, "metadata.json"),
    sourceUrl: templateFileUrl(candidate.id, "source.json"),
    deckUrl: templateFileUrl(candidate.id, "deck.json"),
    pagesBaseUrl: `${templateBasePath(candidate.id)}/pages/`,
    assetsBaseUrl: `${templateBasePath(candidate.id)}/assets/`,
    assets,
    coverImage: coverImage ? templateFileUrl(candidate.id, coverImage) : "",
    stripImages: thumbnailImages.slice(0, 4),
    previewImages,
    thumbnailImages,
    checksum: {
      deck: await sha256File(path.join(targetDir, "deck.json")),
      metadata: await sha256File(path.join(targetDir, "metadata.json")),
    },
  };
}

async function buildStaging() {
  const candidates = await collectCandidates();
  const selected = selectTemplates(candidates);

  await rm(stagingRoot, { force: true, recursive: true });
  await mkdir(path.join(stagingRoot, "templates"), { recursive: true });

  const templates = [];
  for (const candidate of selected) {
    templates.push(await stageTemplate(candidate));
  }

  const manifest = {
    schemaVersion: 1,
    type,
    updatedAt: new Date().toISOString(),
    templates,
  };
  await writeFile(path.join(stagingRoot, "template.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, sourceCount: candidates.length };
}

function runAws(args) {
  const command = ["aws", ...args];
  console.log(command.join(" "));
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}`);
  }
}

const { manifest, sourceCount } = await buildStaging();
console.log(`Prepared ${manifest.templates.length} ${type} manifest templates from ${sourceCount} source templates in ${stagingRoot}`);

if (upload) {
  const destination = `s3://${bucket}/${prefix}/${type}/`;
  const syncArgs = [
    "s3",
    "sync",
    `${stagingRoot}/`,
    destination,
    "--delete",
    "--only-show-errors",
    "--cache-control",
    "max-age=300, must-revalidate",
  ];
  if (dryRun) syncArgs.push("--dryrun");
  runAws(syncArgs);

  const manifestArgs = [
    "s3",
    "cp",
    path.join(stagingRoot, "template.json"),
    `${destination}template.json`,
    "--content-type",
    "application/json",
    "--only-show-errors",
    "--cache-control",
    "max-age=60, must-revalidate",
  ];
  if (dryRun) manifestArgs.push("--dryrun");
  runAws(manifestArgs);

  if (invalidate) {
    runAws([
      "cloudfront",
      "create-invalidation",
      "--distribution-id",
      cloudFrontDistributionId,
      "--paths",
      manifestPath(),
    ]);
  }

  console.log(`Published ${type} templates to ${destination}`);
}
