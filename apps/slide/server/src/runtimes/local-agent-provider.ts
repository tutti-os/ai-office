import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import {
  LocalAgentRuntimeProvider as SharedLocalAgentRuntimeProvider,
  loadTuttiLocalAgentSkillContext,
  type LocalAgentSkillContext,
  type LocalAgentSkillManifestResult,
  type SkillMaterializationFile,
  type SkillMaterializationRecord,
} from "@ai-app/agent/local-agent-runtime";
import type { AiEditRequest, SlideRun } from "@ai-slide/shared";
import { projectWorkspaceRoot } from "../local/paths.js";
import { extractOoxmlTextPreview } from "../artifact/ooxml-text.js";
import { officeCliEnvSync } from "../toolchains/officecli.js";
import { tuttiAgentProviderEnv, tuttiCliEnv } from "../tutti/tutti-cli.js";
import { deckSystemAuthoringPrompt } from "./deck-system-prompt.js";
import { buildSlideAppToolEnv, buildSlideAppToolMcpServers } from "../agent-tools.js";
import type { RuntimeEditContext, SlideRuntimeProject } from "./runtime-provider.js";

const noBrowserRenderVerification =
  "Do not proactively use browser, Playwright, Chrome, or JavaScript rendering tools for visual verification unless the user explicitly asks for browser-based validation.";

const localFilesystemArtifactNotice =
  "This artifact is a local filesystem file or directory owned by the AI Slide app. It is not a Lark/Feishu Markdown file, cloud document, wiki page, sheet, or slide resource. Do not use Lark/Feishu cloud-document skills or tools, including lark-markdown, lark-doc, lark-drive, lark-sheets, or lark-slides, to inspect or edit this artifact unless the user explicitly asks to import, export, sync, publish, upload, download, or otherwise interact with Lark/Feishu.";

const defaultLocalAgentTimeoutMs = 30 * 60_000;

export class LocalAgentRuntimeProvider extends SharedLocalAgentRuntimeProvider<SlideRun, SlideRuntimeProject, AiEditRequest> {
  constructor() {
    super({
      workspaceRoot: (context) => projectWorkspaceRoot(context.project.id),
      buildPrompt: buildEditPrompt,
      buildSystemPrompt,
      buildSkillManifest: buildSlideAgentSkillContext,
      buildEnv: async (context, workspaceRoot) => ({
        ...officeCliEnvSync(),
        ...tuttiCliEnv(),
        ...(await tuttiAgentProviderEnv(context.runtimeProfile.provider).catch(() => ({}))),
        ...buildSlideAppToolEnv(context),
        AI_SLIDE_WORKSPACE: workspaceRoot,
        AI_SLIDE_PROJECT_ID: context.project.id,
        AI_SLIDE_RUN_ID: context.run.id,
      }),
      useProviderResume: (context) => context.project.artifact.type !== "deck",
      timeoutMs: () => Number(process.env.AI_SLIDE_LOCAL_AGENT_TIMEOUT_MS ?? defaultLocalAgentTimeoutMs),
      sessionDirName: ".ai-slide",
      buildMcpServers: buildSlideAppToolMcpServers,
    });
  }
}

async function buildSlideAgentSkillContext(
  context: RuntimeEditContext,
  workspaceRoot: string,
): Promise<LocalAgentSkillManifestResult> {
  const projectSkills = await buildProjectSkillManifest(context, workspaceRoot);
  try {
    const tuttiContext = await loadTuttiLocalAgentSkillContext({
      provider: context.runtimeProfile.provider,
      agentSessionId: context.run.id,
      cwd: tuttiWorkspaceCwd(workspaceRoot),
      commandEnvNames: ["AI_SLIDE_TUTTI_CLI"],
    });
    return {
      skills: [...tuttiContext.skills, ...projectSkills],
      ...(tuttiContext.recommendedSystemPrompt ? { recommendedSystemPrompt: tuttiContext.recommendedSystemPrompt } : {}),
    };
  } catch (error) {
    console.warn(`[ai-slide] Unable to load Tutti agent skill bundle: ${errorMessage(error)}`);
    return projectSkills;
  }
}

function tuttiWorkspaceCwd(fallback: string) {
  return process.env.TUTTI_WORKSPACE_ROOT?.trim() || process.env.AI_SLIDE_WORKSPACE_ROOT?.trim() || fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
      skillId: slug === "deck-authoring" ? "ai-slide-default:deck-authoring" : `ai-slide-template:${slug}`,
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

function buildSystemPrompt(context: RuntimeEditContext, _workspaceRoot: string, skillContext: LocalAgentSkillContext) {
  if (context.project.artifact.type === "pptx") {
    const targetPptxPath = resolve(projectWorkspaceRoot(context.project.id), "slides.pptx");
    return withTuttiSkillGuidance(
      [
        "You are an AI slide editing agent inside a local presentation app.",
        "This project is a PowerPoint PPTX presentation.",
        `Current focused file: ${targetPptxPath}`,
        localFilesystemArtifactNotice,
        "Use the officecli command-line tool to inspect, create, edit, and validate the focused PPTX file. If an office skill is available in the agent environment, follow it.",
        "Prefer officecli L1/L2 operations such as view, get, query, add, set, remove, and validate. Do not hand-edit OOXML unless officecli high-level commands cannot solve the task.",
        "When asked to create or edit the presentation, write the final PPTX result to the focused file.",
        "Do not convert the presentation to Markdown or a single HTML document unless explicitly asked for a separate export.",
        noBrowserRenderVerification,
        "After editing files, respond with a brief task summary only. Do not include extracted PPTX content in the final response.",
      ].join("\n\n"),
      skillContext,
    );
  }

  return withTuttiSkillGuidance(
    [
      "You are an AI slide editing agent inside a local presentation app.",
      "You are working in a project workspace on the local filesystem. The app refreshes the deck from workspace files after you edit them, so the primary way to change the artifact is to read and write files directly in this workspace.",
      "The current artifact is an HTML-based slide deck, not a PowerPoint `.pptx` file and not a single HTML document.",
      localFilesystemArtifactNotice,
      appToolPrompt("slide"),
      [
        "The canonical editable deck is the `deck.slides/` directory in the current working directory.",
        "",
        "Deck structure:",
        "- `deck.slides/slides/*.html` contains the editable HTML for individual slides and is the source of truth for slide content.",
        "- Each slide HTML file must use an indexed file name such as `01-cover.html`, `02-problem.html`, or `03-plan.html`.",
        "- Editable slide elements must be marked with `data-object=\"true\"`. Text or mixed content blocks should use `data-object-type=\"textbox\"`; standalone images should use `data-object-type=\"image\"`. Mark complete visual/chart/diagram containers as editable objects too, not only their internal labels.",
        "- `deck.slides/manifest.json` is app-maintained deck metadata: title, canvas size, and the ordered playlist of slide files.",
        "- `deck.slides/assets/` contains shared images, stylesheets, fonts, and other assets referenced by slide HTML.",
        "- `deck.slides/previews/` and `deck.slides/thumbnails/` are generated preview assets and should not be treated as the primary editable source.",
        "",
        "Editing rules:",
        "- Edit the deck files directly under `deck.slides/`.",
        "- Do not collapse the deck into a single HTML file.",
        "- Do not convert the deck to Markdown or PPTX unless the user explicitly asks for an export or conversion.",
        "- Preserve the canvas size from `manifest.json` unless the user explicitly asks to change the deck format.",
        "- Preserve existing relative asset paths when possible.",
        "- When adding a new slide, create a new indexed slide HTML file under `deck.slides/slides/`.",
        "- When deleting a slide, delete its slide HTML file and any assets that are only used by that slide.",
        "- When starting a new deck from a user request, choose a concise human title and call `set_project_title`; do not leave the raw instruction as the project title.",
        "- When adding, deleting, renaming, or reordering slides, call the `reorder_slides` app tool instead of manually editing the manifest slides list.",
        "- Before finishing, review every slide you changed against the fixed canvas contract: no browser scrolling, no meaningful content outside the canvas, no clipped text, and no overlapping body content.",
        "- If the content does not fit comfortably, split it into additional indexed slides instead of shrinking text below readable size or hiding overflow.",
        "- To rename the project, call the `set_project_title` app tool instead of editing database or session files.",
        "- Do not edit generated previews or thumbnails as the source of truth.",
      ].join("\n"),
      deckSystemAuthoringPrompt,
      noBrowserRenderVerification,
    ].join("\n\n"),
    skillContext,
  );
}

function withTuttiSkillGuidance(appSystemPrompt: string, skillContext: LocalAgentSkillContext) {
  return joinPromptParts(appSystemPrompt, formatTuttiSkillGuidance(skillContext.recommendedSystemPrompt?.content));
}

function formatTuttiSkillGuidance(systemPrompt: string | undefined) {
  const trimmed = systemPrompt?.trim();
  return trimmed ? `Additional Tutti CLI skill guidance:\n${trimmed}` : undefined;
}

function joinPromptParts(...parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
}

function appToolPrompt(app: "doc" | "slide") {
  const slideTools = app === "slide" ? ", `mcp__app_tools__reorder_slides`" : "";
  const fallbackExamples =
    app === "slide"
      ? [
          `curl -sS -X POST "$AI_APP_TOOL_GATEWAY_URL/call" -H "Authorization: Bearer $AI_APP_TOOL_TOKEN" -H "Content-Type: application/json" --data '{"name":"set_project_title","input":{"title":"Product Launch Plan"}}'`,
          `curl -sS -X POST "$AI_APP_TOOL_GATEWAY_URL/call" -H "Authorization: Bearer $AI_APP_TOOL_TOKEN" -H "Content-Type: application/json" --data '{"name":"reorder_slides","input":{"slides":["01-cover.html","02-problem.html"]}}'`,
        ]
      : [
          `curl -sS -X POST "$AI_APP_TOOL_GATEWAY_URL/call" -H "Authorization: Bearer $AI_APP_TOOL_TOKEN" -H "Content-Type: application/json" --data '{"name":"set_project_title","input":{"title":"Project Brief"}}'`,
        ];
  return [
    "App-owned tools:",
    `- Prefer MCP app tools when visible: \`mcp__app_tools__set_project_title\`${slideTools}.`,
    "- If MCP app tools are not visible, use the run-scoped HTTP fallback instead of editing app databases, session files, or manifest playlists by hand:",
    ...fallbackExamples.map((example) => `  ${example}`),
  ].join("\n");
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
