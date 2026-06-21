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
const type = "doc";
const sourceRoot = path.resolve(process.env.AI_DOC_TEMPLATE_ROOT ?? path.join(appRoot, "templates", "tutti"));
const stagingRoot = path.resolve(process.env.AI_OFFICE_TEMPLATE_STAGING_ROOT ?? "/tmp/ai-doc-office-templates-doc-publish");
const selectionPath = path.resolve(process.env.AI_OFFICE_TEMPLATE_SELECTION ?? path.join(scriptDir, "office-template-selection.json"));
const cloudFrontDistributionId = process.env.AI_OFFICE_TEMPLATE_CLOUDFRONT_DISTRIBUTION_ID ?? "E3QP4ZVQXB1XF5";
const upload = !process.argv.includes("--no-upload");
const dryRun = process.argv.includes("--dry-run");
const invalidate = process.argv.includes("--invalidate");

function trimSlashes(value) {
  return String(value).replace(/^\/+|\/+$/g, "");
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

function screenshotSize(metadata) {
  if (metadata.screenshot?.width && metadata.screenshot?.height) {
    return {
      width: Number(metadata.screenshot.width),
      height: Number(metadata.screenshot.height),
    };
  }
  if (metadata.screenshot_width && metadata.screenshot_height) {
    return {
      width: Number(metadata.screenshot_width),
      height: Number(metadata.screenshot_height),
    };
  }
  return undefined;
}

async function readSelection() {
  if (!(await fileExists(selectionPath))) return null;
  const selection = await readJson(selectionPath);
  if (selection.type && selection.type !== type) {
    throw new Error(`Selection file ${selectionPath} is for type ${selection.type}, expected ${type}`);
  }

  const orderedIds = [];
  const seen = new Set();
  for (const category of selection.categories ?? []) {
    for (const item of category.templates ?? []) {
      const id = String(item.id || "");
      if (!id) throw new Error(`Selection file ${selectionPath} contains a template without an id`);
      if (seen.has(id)) throw new Error(`Selection file ${selectionPath} contains duplicate template id ${id}`);
      seen.add(id);
      orderedIds.push(id);
    }
  }
  return orderedIds;
}

async function buildStaging() {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const templatesById = new Map();
  const selectedIds = await readSelection();

  await rm(stagingRoot, { force: true, recursive: true });
  await mkdir(path.join(stagingRoot, "templates"), { recursive: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const sourceDir = path.join(sourceRoot, entry.name);
    const metadataPath = path.join(sourceDir, "metadata.json");
    const sourceJsonPath = path.join(sourceDir, "source.json");
    const documentPath = path.join(sourceDir, "document.html");
    const screenshotPath = path.join(sourceDir, "screenshot.png");

    const required = [metadataPath, sourceJsonPath, documentPath, screenshotPath];
    const missing = [];
    for (const filePath of required) {
      if (!(await fileExists(filePath))) missing.push(path.relative(repoRoot, filePath));
    }
    if (missing.length) {
      throw new Error(`Template ${entry.name} is missing required files: ${missing.join(", ")}`);
    }

    const metadata = await readJson(metadataPath);
    const templateId = String(metadata.id || entry.name);
    if (!templateId) throw new Error(`Template ${entry.name} has no id`);

    const targetDir = path.join(stagingRoot, "templates", templateId);
    await cp(sourceDir, targetDir, { recursive: true, force: true });

    const basePath = templateBasePath(templateId);
    templatesById.set(templateId, {
      id: templateId,
      enabled: true,
      name: String(metadata.name || templateId),
      classification: String(metadata.classification || "Uncategorized"),
      metadataUrl: `${basePath}/metadata.json`,
      sourceUrl: `${basePath}/source.json`,
      documentUrl: `${basePath}/document.html`,
      screenshotUrl: `${basePath}/screenshot.png`,
      screenshot: screenshotSize(metadata),
      checksum: {
        documentHtml: await sha256File(documentPath),
        screenshot: await sha256File(screenshotPath),
      },
    });
  }

  const templates = selectedIds
    ? selectedIds.map((id) => {
        const template = templatesById.get(id);
        if (!template) throw new Error(`Selected template ${id} was not found under ${sourceRoot}`);
        return template;
      })
    : Array.from(templatesById.values()).sort(
        (left, right) => left.classification.localeCompare(right.classification) || left.name.localeCompare(right.name),
      );

  const manifest = {
    schemaVersion: 1,
    type,
    updatedAt: new Date().toISOString(),
    templates,
  };

  await writeFile(path.join(stagingRoot, "template.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, stagedTemplateCount: templatesById.size, selected: Boolean(selectedIds) };
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

const { manifest, stagedTemplateCount, selected } = await buildStaging();
console.log(
  `Prepared ${manifest.templates.length} ${type} manifest templates from ${stagedTemplateCount} staged templates in ${stagingRoot}${
    selected ? ` using ${path.relative(repoRoot, selectionPath)}` : ""
  }`,
);

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
      `/${prefix}/${type}/template.json`,
    ]);
  }

  console.log(`Published ${type} templates to ${destination}`);
}
