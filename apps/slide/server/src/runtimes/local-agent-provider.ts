import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { LocalAgentRuntimeProvider as SharedLocalAgentRuntimeProvider } from "@ai-app/agent/local-agent-runtime";
import type { AiEditRequest, SlideRun } from "@ai-slide/shared";
import type { SkillMaterializationFile, SkillMaterializationRecord } from "@tutti-os/agent-acp-kit";
import { projectWorkspaceRoot } from "../local/paths.js";
import { extractOoxmlTextPreview } from "../artifact/ooxml-text.js";
import { officeCliEnvSync } from "../toolchains/officecli.js";
import type { RuntimeEditContext, SlideRuntimeProject } from "./runtime-provider.js";

const noBrowserRenderVerification =
  "Do not proactively use browser, Playwright, Chrome, or JavaScript rendering tools for visual verification unless the user explicitly asks for browser-based validation.";

export class LocalAgentRuntimeProvider extends SharedLocalAgentRuntimeProvider<SlideRun, SlideRuntimeProject, AiEditRequest> {
  constructor() {
    super({
      workspaceRoot: (context) => projectWorkspaceRoot(context.project.id),
      buildPrompt: buildEditPrompt,
      buildSystemPrompt,
      buildSkillManifest: buildProjectSkillManifest,
      buildEnv: (context, workspaceRoot) => ({
        ...officeCliEnvSync(),
        AI_SLIDE_WORKSPACE: workspaceRoot,
        AI_SLIDE_PROJECT_ID: context.project.id,
        AI_SLIDE_RUN_ID: context.run.id,
      }),
      timeoutMs: () => Number(process.env.AI_SLIDE_LOCAL_AGENT_TIMEOUT_MS ?? 240_000),
      sessionDirName: ".ai-slide",
    });
  }
}

async function buildProjectSkillManifest(context: RuntimeEditContext, workspaceRoot: string): Promise<SkillMaterializationRecord[]> {
  if (context.project.artifact.type !== "deck") return [];
  const skillsRoot = join(workspaceRoot, ".ai-slide", "skills");
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: SkillMaterializationRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const root = join(skillsRoot, slug);
    let content = "";
    try {
      content = await readFile(join(root, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    skills.push({
      skillId: `ai-slide-template:${slug}`,
      slug,
      content,
      deliveryMode: "materialized-files",
      materializedPath: join(".local-agent", "skills", slug),
      files: await readSkillMaterializationFiles(root),
    });
  }
  return skills;
}

async function readSkillMaterializationFiles(root: string): Promise<SkillMaterializationFile[]> {
  const files: SkillMaterializationFile[] = [];
  await readSkillMaterializationFilesInto(root, root, files);
  return files;
}

async function readSkillMaterializationFilesInto(root: string, dir: string, files: SkillMaterializationFile[]) {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    const relativePath = relative(root, absolutePath);
    if (entry.isDirectory()) {
      await readSkillMaterializationFilesInto(root, absolutePath, files);
      continue;
    }
    if (!entry.isFile() || relativePath === "SKILL.md" || !isTextSkillFile(entry.name)) continue;
    files.push({
      path: relativePath,
      content: await readFile(absolutePath, "utf8"),
    });
  }
}

function isTextSkillFile(fileName: string) {
  return new Set([".md", ".mdx", ".txt", ".json", ".yaml", ".yml"]).has(extname(fileName).toLowerCase());
}

function buildSystemPrompt(context: RuntimeEditContext) {
  if (context.project.artifact.type === "pptx") {
    const targetPptxPath = resolve(projectWorkspaceRoot(context.project.id), "slides.pptx");
    return [
      "You are an AI slide editing agent inside a local presentation app.",
      "This project is a PowerPoint PPTX presentation.",
      `Current focused file: ${targetPptxPath}`,
      "Use the officecli command-line tool to inspect, create, edit, and validate the focused PPTX file. If an office skill is available in the agent environment, follow it.",
      "Prefer officecli L1/L2 operations such as view, get, query, add, set, remove, and validate. Do not hand-edit OOXML unless officecli high-level commands cannot solve the task.",
      "When asked to create or edit the presentation, write the final PPTX result to the focused file.",
      "Do not convert the presentation to Markdown or a single HTML document unless explicitly asked for a separate export.",
      noBrowserRenderVerification,
      "After editing files, respond with a brief task summary only. Do not include extracted PPTX content in the final response.",
    ].join("\n\n");
  }

  return [
    "You are an AI slide editing agent inside a local presentation app.",
    "You are working in a project workspace on the local filesystem. The app refreshes the deck from workspace files after you edit them, so the primary way to change the artifact is to read and write files directly in this workspace.",
    "The current artifact is an HTML-based slide deck, not a PowerPoint `.pptx` file and not a single HTML document.",
    [
      "The canonical editable deck is the `deck.slides/` directory in the current working directory.",
      "",
      "Deck structure:",
      "- `deck.slides/manifest.json` is the source of truth for deck metadata, canvas size, and slide ordering.",
      "- `deck.slides/slides/*.html` contains the editable HTML for individual slides.",
      "- `deck.slides/assets/` contains shared images, stylesheets, fonts, and other assets referenced by slide HTML.",
      "- `deck.slides/previews/` and `deck.slides/thumbnails/` are generated preview assets and should not be treated as the primary editable source.",
      "",
      "Editing rules:",
      "- Edit the deck files directly under `deck.slides/`.",
      "- Do not collapse the deck into a single HTML file.",
      "- Do not convert the deck to Markdown or PPTX unless the user explicitly asks for an export or conversion.",
      "- Preserve the canvas size from `manifest.json` unless the user explicitly asks to change the deck format.",
      "- Preserve existing relative asset paths when possible.",
      "- When adding a new slide, create a slide HTML file under `deck.slides/slides/` and update `manifest.json`.",
      "- When deleting or reordering slides, update `manifest.json` consistently.",
      "- Do not create orphan slide files that are not referenced by `manifest.json`.",
      "- Do not edit generated previews or thumbnails as the source of truth.",
    ].join("\n"),
    noBrowserRenderVerification,
  ].join("\n\n");
}

function buildEditPrompt(context: RuntimeEditContext) {
  const selection = [
    `selection_type: ${context.request.selectionType ?? "write"}`,
    `selection_path: ${context.request.selectionPath ?? ""}`,
    `selected_text: ${context.request.selectedText ?? ""}`,
    `selected_html: ${context.request.selectedHtml ?? ""}`,
  ].join("\n");

  if (context.project.artifact.type === "pptx") {
    const focusedPath = resolve(projectWorkspaceRoot(context.project.id), "slides.pptx");
    return `<slide_agent_context>
project_id: ${context.project.id}
title: ${context.project.title}
artifact_type: pptx
mode: ${context.request.mode}
focused_pptx_path: ${focusedPath}
canonical_pptx_path: slides.pptx
${selection}
</slide_agent_context>

<current_pptx_manifest>
${JSON.stringify(context.project.pptxManifest ?? null, null, 2)}
</current_pptx_manifest>

<current_pptx_text_preview>
${extractOoxmlTextPreview(resolve(projectWorkspaceRoot(context.project.id), "slides.pptx"), {
  pathPattern: /^ppt\/slides\/slide\d+\.xml$/,
})}
</current_pptx_text_preview>

<user_instruction>
${context.request.userPrompt}
</user_instruction>

Use officecli to inspect and edit the focused PPTX when possible. Create or edit the PPTX file at slides.pptx.`;
  }

  return `<slide_agent_context>
project_id: ${context.project.id}
title: ${context.project.title}
artifact_type: deck
mode: ${context.request.mode}
canonical_deck_dir: deck.slides
${selection}
</slide_agent_context>

<current_deck_manifest>
${JSON.stringify(context.project.deckManifest ?? null, null, 2)}
</current_deck_manifest>

<current_deck_slide_html_previews>
${JSON.stringify(context.project.deckSlides ?? [], null, 2)}
</current_deck_slide_html_previews>

<user_instruction>
${context.request.userPrompt}
</user_instruction>

Edit the deck files in deck.slides directly.`;
}
