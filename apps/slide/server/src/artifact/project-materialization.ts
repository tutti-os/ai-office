import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import {
  createBlankDeckManifest,
  createEmptyPptxManifest,
  type DeckManifest,
  type SlideArtifact,
  type SlideProject,
} from "@ai-slide/shared";
import { ensureProjectDirs, projectWorkspaceRoot } from "../local/paths.js";
import { loadTemplateDeckSource, localTemplateSourceRoots, type TemplateDeckSource } from "../templates/template-service.js";
import { defaultDeckSkillFiles, defaultDeckSkillSlug } from "./default-deck-skill.js";
import { mimeTypeForAssetFileName, projectAssetRelativePath } from "./project-file-names.js";

export function materializeDeckProject(root: string, project: SlideProject, artifact: SlideArtifact, templateSource: TemplateDeckSource | null = null) {
  const deckRoot = join(root, artifact.fileRef);
  const manifestPath = join(deckRoot, "manifest.json");
  const createdAt = project.createdAt;
  mkdirSync(join(deckRoot, "slides"), { recursive: true });
  mkdirSync(join(deckRoot, "assets"), { recursive: true });
  mkdirSync(join(deckRoot, "previews"), { recursive: true });
  mkdirSync(join(deckRoot, "thumbnails"), { recursive: true });
  if (project.templateId && templateSource && materializeTemplateDeckSource(deckRoot, project, templateSource)) return;
  if (!existsSync(manifestPath)) {
    const manifest = createBlankDeckManifest({ title: project.title, createdAt });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
  const stylesPath = join(deckRoot, "assets", "styles.css");
  if (!existsSync(stylesPath)) {
    writeFileSync(
      stylesPath,
      `html, body { margin: 0; width: 100%; height: 100%; }\nbody { font-family: Lexend, ui-sans-serif, system-ui, sans-serif; }\n.slide { width: 1920px; height: 1080px; box-sizing: border-box; padding: 96px; }\n`,
      "utf8",
    );
  }
  const coverPath = join(deckRoot, "slides", "01-cover.html");
  if (!existsSync(coverPath)) {
    writeFileSync(
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
      "utf8",
    );
  }
}

export function materializeTemplateDeckSource(deckRoot: string, project: SlideProject, source: TemplateDeckSource) {
  rmSync(deckRoot, { force: true, recursive: true });
  mkdirSync(join(deckRoot, "slides"), { recursive: true });
  mkdirSync(join(deckRoot, "assets"), { recursive: true });
  mkdirSync(join(deckRoot, "previews"), { recursive: true });
  mkdirSync(join(deckRoot, "thumbnails"), { recursive: true });

  for (const asset of source.assets) {
    const assetPath = safeTemplateProjectAssetPath(asset.path);
    const targetPath = join(deckRoot, "assets", assetPath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, asset.bytes);
  }

  const slides = source.slides.map((slide, index) => {
    const destinationFile = slide.fileName.replace(/[\\/]/g, "-");
    const destinationPage = join(deckRoot, "slides", destinationFile);
    writeFileSync(destinationPage, slide.html || missingTemplateSlideHtml(project.title, slide.fileName), "utf8");
    return {
      id: `slide-${String(index + 1).padStart(3, "0")}`,
      file: `slides/${destinationFile}`,
    };
  });

  const now = new Date().toISOString();
  const manifest: DeckManifest = {
    schemaVersion: "ai-slide.deck.v1",
    title: source.title || project.title,
    canvas: source.canvas,
    slides,
    createdAt: project.createdAt,
    updatedAt: now,
  };
  writeFileSync(join(deckRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return true;
}

export async function requireTemplateDeckSource(templateId: string) {
  const source = await loadTemplateDeckSource(templateId);
  if (!source) throw new Error(`Template HTML source is missing for "${templateId}". Check the slide template provider or set AI_SLIDE_TEMPLATE_PROVIDER=local with AI_SLIDE_TEMPLATE_ROOT.`);
  return source;
}

export function syncProjectTemplateSkill(projectRoot: string, project: SlideProject, artifact: SlideArtifact) {
  if (artifact.type !== "deck" || !project.templateId) return;
  const sourceDir = readTemplateSkillSource(project.templateId);
  if (!sourceDir) return;
  const skillRoot = join(projectRoot, ".ai-slide", "skills", safeSkillSlug(project.templateId));
  rmSync(skillRoot, { force: true, recursive: true });
  mkdirSync(skillRoot, { recursive: true });
  cpSync(join(sourceDir, "SKILL.md"), join(skillRoot, "SKILL.md"));
}

export function syncDefaultDeckSkill(projectRoot: string, project: SlideProject, artifact: SlideArtifact) {
  if (artifact.type !== "deck") return;
  const skillRoot = join(projectRoot, ".ai-slide", "skills", defaultDeckSkillSlug);
  if (project.templateId) {
    rmSync(skillRoot, { force: true, recursive: true });
    return;
  }
  rmSync(skillRoot, { force: true, recursive: true });
  for (const file of defaultDeckSkillFiles) {
    const targetPath = join(skillRoot, file.path);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, file.content, "utf8");
  }
}

export function materializePptxProject(root: string, project: SlideProject, artifact: SlideArtifact) {
  const manifestPath = join(root, `${artifact.fileRef}.manifest.json`);
  if (!existsSync(manifestPath)) {
    const manifest = createEmptyPptxManifest();
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, title: project.title }, null, 2)}\n`, "utf8");
  }
}

export function isBlankDeckManifest(manifestPath: string) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<DeckManifest>;
    return manifest.schemaVersion === "ai-slide.deck.v1" && manifest.slides?.length === 1 && manifest.slides[0]?.file === "slides/01-cover.html";
  } catch {
    return true;
  }
}

export function isGeneratedImageTemplateDeck(deckRoot: string, manifestPath: string) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<DeckManifest>;
    const firstSlideFile = manifest.slides?.[0]?.file;
    if (!firstSlideFile) return false;
    const normalizedFile = normalize(firstSlideFile);
    if (normalizedFile.startsWith("..") || normalizedFile.includes(`..${sep}`)) return false;
    const html = readFileSync(join(deckRoot, normalizedFile), "utf8");
    return html.includes('data-ai-slide-object-id="template-image-') || html.includes("assets/template-images/");
  } catch {
    return false;
  }
}

export function writeProjectAgentInstructions(project: SlideProject, artifact: SlideArtifact) {
  const root = ensureProjectDirs(project.id);
  writeFileSync(join(root, "AGENTS.md"), projectAgentInstructions(artifact), "utf8");
}

function projectAgentInstructions(artifact: SlideArtifact) {
  const projectAssets = projectAssetInstructions(artifact.projectId);
  if (artifact.type === "pptx") {
    const targetPptxPath = join(projectWorkspaceRoot(artifact.projectId), artifact.fileRef);
    return [
      "# AI Slide Workspace",
      "",
      "You are editing a slide presentation with the local AI Slide app.",
      `Current focused file: ${targetPptxPath}`,
      artifactIntentInstructions("presentation"),
      progressiveSlideAuthoringInstructions("presentation"),
      "When the current request calls for creating or editing this PPTX presentation, write the final file to the focused file with filesystem tools.",
      projectAssets,
    ].join("\n");
  }
  const targetDeckPath = join(projectWorkspaceRoot(artifact.projectId), artifact.fileRef);
  return [
    "# AI Slide Workspace",
    "",
    "You are editing a slide deck with the local AI Slide app.",
    `Current focused directory: ${targetDeckPath}`,
    artifactIntentInstructions("deck"),
    progressiveSlideAuthoringInstructions("deck"),
    "Use `slides/*.html` as the editable source for individual slides. Slide files must use indexed names such as `01-cover.html`.",
    "Mark editable slide elements with `data-object=\"true\"`. Text or mixed content blocks should use `data-object-type=\"textbox\"`; standalone images should use `data-object-type=\"image\"`.",
    "Use `manifest.json` for app-maintained title, canvas, and the current playlist; do not manually edit `manifest.slides` for ordering.",
    "After adding, deleting, renaming, or reordering slide files, call the `reorder_slides` app tool.",
    "Before finishing, review every slide you changed against the fixed canvas contract: no browser scrolling, no meaningful content outside the canvas, no clipped text, and no overlapping body content.",
    "If the content does not fit comfortably, split it into additional indexed slides instead of shrinking text below readable size or hiding overflow.",
    "To rename the project, call the `set_project_title` app tool.",
    "If MCP app tools are not visible, call the run-scoped HTTP fallback with `$AI_APP_TOOL_GATEWAY_URL` and `$AI_APP_TOOL_TOKEN` instead of editing app databases or importing server repositories directly.",
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

function projectAssetInstructions(projectId: string) {
  const assets = listProjectAssets(projectId);
  if (assets.length === 0) return "";
  return [
    "",
    "Project context attachments:",
    ...assets.map((asset) => `- ${asset.fileName} (${asset.mimeType}, ${asset.sizeBytes} bytes): ${asset.path}`),
    "Use these files as source context when they are relevant to the user's request.",
  ].join("\n");
}

function listProjectAssets(projectId: string) {
  const assetsDir = join(projectWorkspaceRoot(projectId), "assets");
  if (!existsSync(assetsDir)) return [];
  return readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolutePath = join(assetsDir, entry.name);
      return {
        fileName: entry.name,
        path: projectAssetRelativePath(entry.name),
        mimeType: mimeTypeForAssetFileName(entry.name),
        sizeBytes: statSync(absolutePath).size,
      };
    });
}

function readTemplateSkillSource(templateId: string | null) {
  if (!templateId) return null;
  const templateDir = localTemplateSourceRoots().map((root) => join(root, templateId)).find((candidate) => existsSync(candidate));
  if (!templateDir) return null;
  return existsSync(join(templateDir, "SKILL.md")) ? templateDir : null;
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
