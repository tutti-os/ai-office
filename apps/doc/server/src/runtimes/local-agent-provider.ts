import {
  LocalAgentRuntimeProvider as SharedLocalAgentRuntimeProvider,
  loadTuttiLocalAgentSkillContext,
  type LocalAgentSkillContext,
} from "@ai-app/agent/local-agent-runtime";
import type { AiEditRequest, DocumentProject, DocumentRun } from "@ai-doc/shared";
import { buildDocAppToolMcpServers } from "../agent-tools.js";
import {
  isTshFileArtifactProject,
  projectFocusedArtifactPath,
  projectLocalAgentStateRoot,
  projectPrivateRoot,
  projectWorkspaceRoot,
} from "../local/paths.js";
import { listProjectAssets } from "../artifact/project-assets.js";
import { officeCliEnvSync } from "../toolchains/officecli.js";
import { tuttiCliEnv } from "../tutti/tutti-cli.js";
import type { RuntimeEditContext } from "./runtime-provider.js";
import { basename, dirname } from "node:path";

const noBrowserRenderVerification =
  "Do not proactively use browser, Playwright, Chrome, or JavaScript rendering tools for visual verification unless the user explicitly asks for browser-based validation.";

const localFilesystemArtifactNotice =
  "This artifact is a local filesystem file owned by the AI Doc app. It is not a Lark/Feishu Markdown file, cloud document, wiki page, sheet, or slide resource. Do not use Lark/Feishu cloud-document skills or tools, including lark-markdown, lark-doc, lark-drive, lark-sheets, or lark-slides, to inspect or edit this artifact unless the user explicitly asks to import, export, sync, publish, upload, download, or otherwise interact with Lark/Feishu.";

const defaultLocalAgentTimeoutMs = 3 * 24 * 60 * 60_000;
const minimumLocalAgentTimeoutMs = 5 * 60_000;

export class LocalAgentRuntimeProvider extends SharedLocalAgentRuntimeProvider<DocumentRun, DocumentProject, AiEditRequest> {
  constructor() {
    super({
      runCwd: (context) => {
        if (isTshFileArtifactProject(context.project.id)) {
          return dirname(projectFocusedArtifactPath(context.project.id, context.project.type));
        }
        return projectWorkspaceRoot(context.project.id);
      },
      // Resume pointers stay in VM-local database dir — never /workspace or .tsh app-data.
      sessionRoot: (context) => projectLocalAgentStateRoot(context.project.id),
      buildPrompt: buildEditPrompt,
      buildSystemPrompt,
      buildSkillManifest: buildTuttiAgentSkillContext,
      buildMcpServers: buildDocAppToolMcpServers,
      buildEnv: async (context) => ({
        ...officeCliEnvSync(),
        ...tuttiCliEnv(),
        AI_DOC_PROJECT_ID: context.project.id,
        AI_DOC_RUN_ID: context.run.id,
      }),
      extraAllowedDirs: (context, runCwd) => {
        if (!isTshFileArtifactProject(context.project.id)) return [runCwd];
        const privateRoot = projectPrivateRoot(context.project.id);
        return privateRoot === runCwd ? [runCwd] : [runCwd, privateRoot];
      },
      writeCodexProjectRootMarker: (context) =>
        isTshFileArtifactProject(context.project.id) ? false : undefined,
      timeoutMs: localAgentTimeoutMs,
      sessionDirName: ".ai-doc",
      commandEnvNames: ["AI_DOC_TUTTI_CLI"],
    });
  }
}

async function buildTuttiAgentSkillContext(context: RuntimeEditContext, projectCwd: string) {
  try {
    return await loadTuttiLocalAgentSkillContext({
      agentTargetId: context.runtimeProfile.agentTargetId!,
      agentSessionId: context.run.id,
      cwd: projectCwd,
      detectContext: { ...(context.agentDetectContext ?? {}), cwd: projectCwd },
      commandEnvNames: ["AI_DOC_TUTTI_CLI"],
    });
  } catch (error) {
    console.warn(`[ai-doc] Unable to load Tutti agent skill bundle: ${errorMessage(error)}`);
    return { skills: [] };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function localAgentTimeoutMs() {
  const raw = process.env.AI_DOC_LOCAL_AGENT_TIMEOUT_MS;
  if (!raw) return defaultLocalAgentTimeoutMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= minimumLocalAgentTimeoutMs ? parsed : defaultLocalAgentTimeoutMs;
}

async function buildSystemPrompt(context: RuntimeEditContext, _projectCwd: string, skillContext: LocalAgentSkillContext) {
  const assetPrompt = await projectAssetPrompt(context.project.id);
  const focusedFileLine = focusedFilePromptLine(context);

  if (context.project.type === "docx") {
    return withTuttiSkillGuidance(
      [
        "You are an AI doc editing agent inside a local doc app.",
        "This project is a Word DOCX doc.",
        focusedFileLine,
        localFilesystemArtifactNotice,
        appToolPrompt(),
        artifactIntentPrompt("document"),
        "Use the officecli command-line tool to inspect, create, edit, and validate the focused DOCX file. If an office skill is available in the agent environment, follow it.",
        "Prefer officecli L1/L2 operations such as view, get, query, add, set, remove, and validate. Do not hand-edit OOXML unless officecli high-level commands cannot solve the task.",
        "When the current request calls for creating or editing this document, write the final DOCX result to the focused file.",
        "Do not convert the doc to HTML or Markdown unless the user explicitly asks for that as a separate export.",
        assetPrompt,
        noBrowserRenderVerification,
        "After editing files, respond with a brief task summary only. Do not include extracted DOCX content in the final response.",
      ].join("\n\n"),
      skillContext,
    );
  }

  if (context.project.type === "markdown") {
    return withTuttiSkillGuidance(
      [
        "You are editing a Markdown artifact for a local AI doc editor.",
        focusedFileLine,
        localFilesystemArtifactNotice,
        appToolPrompt(),
        artifactIntentPrompt("document"),
        "When the current request calls for document changes, use filesystem read/write tools to inspect and modify the focused file directly. Do not treat the chat response as the primary way to update the doc.",
        stagedDocumentWritePrompt("Markdown"),
        "Write Markdown as a readable, maintainable working document for humans and agents. Optimize for clarity, scanability, and future edits rather than visual flourish.",
        "Preserve the existing document style and structure unless the user asks for a rewrite. For edits, make the smallest coherent change that satisfies the user. For new content, create a clear outline before expanding it.",
        "Use headings, short paragraphs, lists, tables, blockquotes, and fenced code blocks only when they improve understanding. Avoid malformed tables, broken nested lists, inconsistent heading levels, and unclosed code fences.",
        "Prefer native Markdown over inline HTML. Do not use Markdown as a fake web layout language.",
        assetPrompt,
        noBrowserRenderVerification,
        "After editing files, respond with a brief task summary only. Do not include the full Markdown content in the final response.",
      ].join("\n\n"),
      skillContext,
    );
  }

  return withTuttiSkillGuidance(
    [
      "You are editing an HTML artifact for a local AI doc editor.",
      focusedFileLine,
      localFilesystemArtifactNotice,
      appToolPrompt(),
      artifactIntentPrompt("document"),
      "When the current request calls for document changes, use filesystem read/write tools to inspect and modify the focused file directly. Do not treat the chat response as the primary way to update the doc.",
      stagedDocumentWritePrompt("HTML"),
      "Use HTML as a high-bandwidth artifact format: choose headings, sections, tables, lists, figures, SVG diagrams, images, code blocks, links, and lightweight interactions when they make the doc easier to understand or use.",
      "Preserve the existing editor runtime, CSS, layout conventions, and semantic structure unless the user explicitly asks for a redesign.",
      "Optimize for human review: clear visual hierarchy, readable spacing, navigable structure, and concise sections. Prefer an artifact the user will actually read over a long plain-text dump.",
      "Keep the file complete, valid, self-contained, and previewable in a browser/editor iframe. Do not convert the doc to Markdown.",
      assetPrompt,
      noBrowserRenderVerification,
      "After editing files, respond with a brief task summary only. Do not include the HTML content in the final response.",
    ].join("\n\n"),
    skillContext,
  );
}

function focusedFilePromptLine(context: RuntimeEditContext) {
  if (isTshFileArtifactProject(context.project.id)) {
    const name = basename(projectFocusedArtifactPath(context.project.id, context.project.type));
    return `Current focused file: ${name} (relative to the current working directory).`;
  }
  if (context.project.type === "docx") {
    return "Current focused file: document.docx (relative to the current working directory).";
  }
  if (context.project.type === "markdown") {
    return "Current focused file: document.md (relative to the current working directory).";
  }
  return "Current focused file: document.html (relative to the current working directory).";
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

function appToolPrompt() {
  return [
    "App-owned tools:",
    "- Use the MCP app tool `mcp__app_tools__set_project_title` for project titles.",
    "- When the request starts a new document artifact in this app, choose a concise human title and call `set_project_title`; do not leave the raw instruction as the project title.",
    "- If the MCP app tool is unavailable, report that app tools are unavailable instead of editing app databases, session files, or manifests by hand.",
  ].join("\n");
}

function artifactIntentPrompt(artifactLabel: string) {
  return [
    "Artifact intent:",
    `- Treat the focused ${artifactLabel} as a workspace resource, not as an obligation to produce placeholder content.`,
    `- Create or modify the focused ${artifactLabel} only when the user's current request asks this app to produce, edit, convert, import into, export from, or otherwise update that artifact.`,
    "- If the request is mainly to coordinate with tools or other apps, inspect context, answer a question, or continue work elsewhere, complete that request without changing the focused artifact just to leave something behind.",
    `- If the user later asks to bring external results into this ${artifactLabel}, then update the focused artifact at that point.`,
  ].join("\n");
}

function stagedDocumentWritePrompt(format: "HTML" | "Markdown") {
  const validity =
    format === "HTML"
      ? "Each saved intermediate version must remain valid, self-contained HTML that can render in the editor iframe."
      : "Each saved intermediate version must remain coherent Markdown with balanced fences, valid tables, and no dangling partial sections.";
  return `For large new documents or broad rewrites, write in useful stages instead of waiting to produce everything at once: save an initial scaffold or first complete sections to the focused file, then continue expanding it in follow-up edits so progress is visible in the working file. ${validity}`;
}

function buildEditPrompt(context: RuntimeEditContext) {
  const blocks = [
    promptBlock("user_instruction", context.request.userPrompt),
    promptBlock("selected_text", context.request.selectedText ?? ""),
  ];

  if (context.project.type === "html" && context.request.selectedHtml) {
    blocks.push(promptBlock("selected_html", context.request.selectedHtml));
  }

  return blocks.join("\n\n");
}

function promptBlock(name: string, value: string) {
  return `<${name}>
${value}
</${name}>`;
}

async function projectAssetPrompt(projectId: string) {
  const assets = (await listProjectAssets(projectId)).map((asset) =>
    `- ${asset.fileName} (${asset.sizeBytes} bytes): ${asset.path}`);
  if (assets.length === 0) return "No project context attachments are currently uploaded.";
  return [
    "Project context attachments are available in the workspace:",
    ...assets,
    "Use these files as source material when relevant. For PDFs, inspect or extract their text before claiming you cannot see their content.",
  ].join("\n");
}
