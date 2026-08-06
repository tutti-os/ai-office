import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import {
  createBlankDeckManifest,
  type DeckManifest,
  type SlideArtifact,
  type SlideProject,
} from "@ai-slide/shared";
import { projectWorkspaceRoot } from "../local/paths.js";
import { retryProjectPreparationOperation, withProjectPreparationPhase } from "@ai-app/shared/project-preparation";
import { loadTemplateDeckSource, localTemplateSourceRoots, type TemplateDeckSource } from "../templates/template-service.js";
import { defaultDeckSkillFiles, defaultDeckSkillSlug } from "./default-deck-skill.js";
import { mimeTypeForAssetFileName, projectAssetRelativePath } from "./project-file-names.js";

export async function materializeDeckProject(root: string, project: SlideProject, artifact: SlideArtifact, templateSource: TemplateDeckSource | null = null) {
  const deckRoot = join(root, artifact.fileRef);
  if (project.templateId && templateSource) {
    await materializeTemplateDeckSource(deckRoot, project, templateSource);
    return;
  }
  await retryProjectPreparationOperation({
    phase: "core_deck",
    path: deckRoot,
    work: async () => {
      // FabricFS/NFS can fail when sibling directories and their first files are
      // created concurrently. These are the project core files, so keep their
      // creation ordered and make a retry repair only the missing member.
      await mkdir(deckRoot, { recursive: true });
      await mkdir(join(deckRoot, "slides"), { recursive: true });
      await mkdir(join(deckRoot, "assets"), { recursive: true });

      const manifestPath = join(deckRoot, "manifest.json");
      const stylesPath = join(deckRoot, "assets", "styles.css");
      const coverPath = join(deckRoot, "slides", "01-cover.html");
      const manifest = createBlankDeckManifest({ title: project.title, createdAt: project.createdAt });
      await writeFileIfMissing(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await writeFileIfMissing(
        stylesPath,
        `html, body { margin: 0; width: 100%; height: 100%; }\nbody { font-family: Lexend, ui-sans-serif, system-ui, sans-serif; }\n.slide { width: 1920px; height: 1080px; box-sizing: border-box; padding: 96px; }\n`,
      );
      await writeFileIfMissing(
        coverPath,
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="../assets/styles.css">
  <title>${escapeHtml(project.title)}</title>
</head>
<body>
  <section class="slide"></section>
</body>
</html>
`,
      );
      await verifyNonEmptyFiles([manifestPath, stylesPath, coverPath]);
    },
  });
}

export async function materializeTemplateDeckSource(deckRoot: string, project: SlideProject, source: TemplateDeckSource) {
  return retryProjectPreparationOperation({
    phase: "template_deck",
    path: deckRoot,
    work: async () => {
      // Do not remove a partially created deck before retrying: all writes below
      // are deterministic, so the retry can fill in the missing files safely.
      await mkdir(deckRoot, { recursive: true });
      await mkdir(join(deckRoot, "slides"), { recursive: true });
      await mkdir(join(deckRoot, "assets"), { recursive: true });

      const slides = source.slides.map((slide, index) => {
        const destinationFile = slide.fileName.replace(/[\\/]/g, "-");
        return {
          id: `slide-${String(index + 1).padStart(3, "0")}`,
          file: `slides/${destinationFile}`,
        };
      });
      const fileWrites = [
        ...source.assets.map((asset) => async () => {
          const assetPath = safeTemplateProjectAssetPath(asset.path);
          const targetPath = join(deckRoot, "assets", assetPath);
          await mkdir(dirname(targetPath), { recursive: true });
          await writeFileIfMissing(targetPath, asset.bytes);
        }),
        ...source.slides.map((slide) => async () => {
          const destinationFile = slide.fileName.replace(/[\\/]/g, "-");
          await writeFileIfMissing(join(deckRoot, "slides", destinationFile), slide.html || missingTemplateSlideHtml(project.title, slide.fileName));
        }),
      ];
      await mapWithConcurrency(fileWrites, templateFileWriteConcurrency, (write) => write());

      const manifestPath = join(deckRoot, "manifest.json");
      const manifest: DeckManifest = {
        schemaVersion: "ai-slide.deck.v1",
        title: source.title || project.title,
        canvas: source.canvas,
        slides,
        createdAt: project.createdAt,
        updatedAt: new Date().toISOString(),
      };
      // This function is also used to recover a partial remote write. Never
      // replace a completed user file during recovery; only missing or zero-byte
      // files are safe to repair.
      await writeFileIfMissing(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await verifyNonEmptyFiles([manifestPath, ...slides.map((slide) => join(deckRoot, slide.file))]);
      return true;
    },
  });
}

export async function requireTemplateDeckSource(templateId: string) {
  const source = await loadTemplateDeckSource(templateId);
  if (!source) throw new Error(`Template HTML source is missing for "${templateId}". Check the slide template provider or set AI_SLIDE_TEMPLATE_PROVIDER=local with AI_SLIDE_TEMPLATE_ROOT.`);
  return source;
}

export function prepareProjectAgentFiles(projectRoot: string, project: SlideProject, artifact: SlideArtifact) {
  return Promise.all([
    withProjectPreparationPhase("default_skill", join(projectRoot, ".ai-slide", "skills", defaultDeckSkillSlug), () => syncDefaultDeckSkill(projectRoot, project, artifact)),
    withProjectPreparationPhase("template_skill", join(projectRoot, ".ai-slide", "skills", safeSkillSlug(project.templateId ?? "template")), () => syncProjectTemplateSkill(projectRoot, project, artifact)),
    withProjectPreparationPhase("agent_instructions", join(projectRoot, "AGENTS.md"), () => writeProjectAgentInstructions(projectRoot, artifact)),
  ]);
}

export function projectAgentInstructionsVersion(project: SlideProject, artifact: SlideArtifact) {
  return ["slide-agent-context-v4", project.templateId ?? "", artifact.id, artifact.type, artifact.fileRef].join(":");
}

export async function syncProjectTemplateSkill(projectRoot: string, project: SlideProject, artifact: SlideArtifact) {
  if (artifact.type !== "deck" || !project.templateId) return;
  const sourceDir = await readTemplateSkillSource(project.templateId);
  if (!sourceDir) return;
  const skillRoot = join(projectRoot, ".ai-slide", "skills", safeSkillSlug(project.templateId));
  await mkdir(skillRoot, { recursive: true });
  await copyFileIfChanged(join(sourceDir, "SKILL.md"), join(skillRoot, "SKILL.md"));
}

export async function syncDefaultDeckSkill(projectRoot: string, project: SlideProject, artifact: SlideArtifact) {
  if (artifact.type !== "deck") return;
  const skillRoot = join(projectRoot, ".ai-slide", "skills", defaultDeckSkillSlug);
  if (project.templateId) {
    await rm(skillRoot, { force: true, recursive: true });
    return;
  }
  await mapWithConcurrency(defaultDeckSkillFiles, fileWriteConcurrency, async (file) => {
    const targetPath = join(skillRoot, file.path);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFileIfChanged(targetPath, file.content);
  });
}

export async function materializePptxProject(root: string, _project: SlideProject, _artifact: SlideArtifact) {
  // PPTX starts as an empty project directory. The agent creates slides.pptx;
  // do not seed user-visible sidecars like slides.pptx.manifest.json.
  await mkdir(root, { recursive: true });
}

export async function isBlankDeckManifest(manifestPath: string) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Partial<DeckManifest>;
    return manifest.schemaVersion === "ai-slide.deck.v1" && manifest.slides?.length === 1 && manifest.slides[0]?.file === "slides/01-cover.html";
  } catch {
    // A transient FabricFS read or parse failure is not proof that this is a
    // blank deck. Treat it as unknown so callers do not rewrite user content.
    return false;
  }
}

export async function isGeneratedImageTemplateDeck(deckRoot: string, manifestPath: string) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Partial<DeckManifest>;
    const firstSlideFile = manifest.slides?.[0]?.file;
    if (!firstSlideFile) return false;
    const normalizedFile = normalize(firstSlideFile);
    if (normalizedFile.startsWith("..") || normalizedFile.includes(`..${sep}`)) return false;
    const html = await readFile(join(deckRoot, normalizedFile), "utf8");
    return html.includes('data-ai-slide-object-id="template-image-') || html.includes("assets/template-images/");
  } catch {
    return false;
  }
}

export async function writeProjectAgentInstructions(projectRoot: string, artifact: SlideArtifact) {
  await writeFileIfChanged(join(projectRoot, "AGENTS.md"), await projectAgentInstructions(artifact));
}

async function projectAgentInstructions(artifact: SlideArtifact) {
  const projectAssets = await projectAssetInstructions(artifact.projectId);
  if (artifact.type === "pptx") {
    return [
      "# AI Slide Workspace",
      "",
      "You are editing a slide presentation with the local AI Slide app.",
      `Current focused file: ${artifact.fileRef} (relative to this project directory).`,
      artifactIntentInstructions("presentation"),
      progressiveSlideAuthoringInstructions("presentation"),
      "When the current request calls for creating or editing this PPTX presentation, write the final file to the focused file with filesystem tools.",
      "Use `set_project_title` for the human-readable project display name. Display title and on-disk directory name are independent.",
      projectAssets,
    ].join("\n");
  }
  return [
    "# AI Slide Workspace",
    "",
    "You are editing a slide deck with the local AI Slide app.",
    `Current focused directory: ${artifact.fileRef} (relative to this project directory).`,
    artifactIntentInstructions("deck"),
    progressiveSlideAuthoringInstructions("deck"),
    "Use `slides/*.html` as the editable source for individual slides. Slide files must use indexed names such as `01-cover.html`.",
    "Mark editable slide elements with `data-object=\"true\"`. Text or mixed content blocks should use `data-object-type=\"textbox\"`; standalone images should use `data-object-type=\"image\"`.",
    "Use `manifest.json` for app-maintained title, canvas, and the current playlist; do not manually edit `manifest.slides` for ordering.",
    "After adding, deleting, renaming, or reordering slide files, call the `reorder_slides` app tool.",
    "Before finishing, review every slide you changed against the fixed canvas contract: no browser scrolling, no meaningful content outside the canvas, no clipped text, and no overlapping body content.",
    "If the content does not fit comfortably, split it into additional indexed slides instead of shrinking text below readable size or hiding overflow.",
    "Use `set_project_title` for the human-readable project display name. Display title and on-disk directory name are independent.",
    "If MCP app tools are unavailable, report that app tools are unavailable instead of editing app databases, session files, or manifest playlists by hand.",
    "Do not collapse the deck into a single HTML file.",
    projectAssets,
  ].join("\n");
}

function artifactIntentInstructions(artifactLabel: string) {
  return [
    `Treat the focused ${artifactLabel} as a workspace resource, not as an obligation to produce placeholder content.`,
    `Create or modify it only when the user's current request asks this app to produce, edit, convert, import into, export from, or otherwise update that artifact.`,
    "If the request is mainly to coordinate with tools or other apps, inspect context, answer a question, or continue work elsewhere, complete that request without changing the focused artifact just to leave something behind.",
  ].join("\n");
}

function progressiveSlideAuthoringInstructions(artifactLabel: "deck" | "presentation") {
  const saveGuidance =
    artifactLabel === "presentation"
      ? "Because PPTX is a single package, each saved intermediate version must still be a valid presentation file that can be opened and previewed."
      : "For HTML decks, save completed slide HTML files and synchronize ordering as you add slides so the app can refresh the visible deck.";
  return [
    "For multi-slide creation or broad redesigns, work in visible increments instead of waiting until the entire presentation is finished.",
    "Start from a compact outline, then complete and save the first useful slide before continuing.",
    "Continue one slide at a time, or in the smallest coherent batch when slides strongly depend on each other.",
    saveGuidance,
    "Avoid leaving half-written slides, broken layouts, or invalid intermediate files merely to show progress; each saved increment should be reviewable.",
  ].join("\n");
}

async function projectAssetInstructions(projectId: string) {
  const assets = await listProjectAssets(projectId);
  if (assets.length === 0) return "";
  return [
    "",
    "Project context attachments:",
    ...assets.map((asset) => `- ${asset.fileName} (${asset.mimeType}, ${asset.sizeBytes} bytes): ${asset.path}`),
    "Use these files as source context when they are relevant to the user's request.",
  ].join("\n");
}

async function listProjectAssets(projectId: string) {
  const assetsDir = join(projectWorkspaceRoot(projectId), "assets");
  const entries = await readdir(assetsDir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile()).sort((left, right) => left.name.localeCompare(right.name));
  const assets = new Array<{ fileName: string; path: string; mimeType: string; sizeBytes: number }>(files.length);
  await mapWithConcurrency(files.map((entry, index) => ({ entry, index })), fileWriteConcurrency, async ({ entry, index }) => {
    assets[index] = {
      fileName: entry.name,
      path: projectAssetRelativePath(entry.name),
      mimeType: mimeTypeForAssetFileName(entry.name),
      sizeBytes: (await stat(join(assetsDir, entry.name))).size,
    };
  });
  return assets;
}

const fileWriteConcurrency = 6;
const templateFileWriteConcurrency = 1;

async function verifyNonEmptyFiles(paths: readonly string[]) {
  for (const path of paths) {
    const file = await stat(path);
    if (!file.isFile() || file.size === 0) throw new Error(`Expected project core file is missing or empty: ${path}`);
  }
}

async function writeFileIfMissing(path: string, content: string | Buffer) {
  try {
    await writeFile(path, content, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // A failed remote create can leave a zero-byte inode behind. It is not a
    // completed core file, so repair it while preserving every non-empty file.
    const existing = await readFile(path);
    if (existing.byteLength === 0) await writeFile(path, content);
  }
}

async function writeFileIfChanged(path: string, content: string | Buffer) {
  const current = await readFile(path).catch(() => null);
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (current?.equals(next)) return;
  await writeFile(path, next);
}

async function copyFileIfChanged(source: string, target: string) {
  const [sourceContent, targetContent] = await Promise.all([
    readFile(source),
    readFile(target).catch(() => null),
  ]);
  if (targetContent?.equals(sourceContent)) return;
  await copyFile(source, target);
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

async function readTemplateSkillSource(templateId: string | null) {
  if (!templateId) return null;
  const candidates = localTemplateSourceRoots().map((root) => join(root, templateId));
  const availability = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    available: await stat(join(candidate, "SKILL.md")).then((value) => value.isFile()).catch(() => false),
  })));
  const templateDir = availability.find((item) => item.available)?.candidate;
  if (!templateDir) return null;
  return templateDir;
}

function safeTemplateProjectAssetPath(value: string) {
  const normalized = normalize(value).replace(/^(\.\.[/\\])+/, "");
  if (!normalized || normalized.startsWith("..") || normalized.includes(`..${sep}`)) throw new Error(`Invalid template asset path: ${value}`);
  return normalized;
}

function safeSkillSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "template";
}

function missingTemplateSlideHtml(title: string, fileName: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)}</title>
</head>
<body>
  <section style="width:1920px;height:1080px;box-sizing:border-box;padding:96px;font-family:Lexend,system-ui,sans-serif;">
    <p style="margin:0 0 24px;color:#667085;font-size:28px;font-weight:700;">${escapeHtml(title)}</p>
    <h1 style="margin:0;color:#111827;font-size:72px;line-height:1.1;">Missing template slide: ${escapeHtml(fileName)}</h1>
  </section>
</body>
</html>
`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
