import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { LocalAgentRuntimeProvider as SharedLocalAgentRuntimeProvider } from "@ai-app/agent/local-agent-runtime";
import type { AiEditRequest, DocumentProject, DocumentRun } from "@ai-doc/shared";
import { projectWorkspaceRoot } from "../local/paths.js";
import { officeCliEnvSync } from "../toolchains/officecli.js";
import type { RuntimeEditContext } from "./runtime-provider.js";

const noBrowserRenderVerification =
  "Do not proactively use browser, Playwright, Chrome, or JavaScript rendering tools for visual verification unless the user explicitly asks for browser-based validation.";

const defaultLocalAgentTimeoutMs = 30 * 60_000;

export class LocalAgentRuntimeProvider extends SharedLocalAgentRuntimeProvider<DocumentRun, DocumentProject, AiEditRequest> {
  constructor() {
    super({
      workspaceRoot: (context) => projectWorkspaceRoot(context.project.id),
      buildPrompt: buildEditPrompt,
      buildSystemPrompt,
      buildEnv: (context, workspaceRoot) => ({
        ...officeCliEnvSync(),
        AI_DOC_WORKSPACE: workspaceRoot,
        AI_DOC_PROJECT_ID: context.project.id,
        AI_DOC_RUN_ID: context.run.id,
      }),
      timeoutMs: () => Number(process.env.AI_DOC_LOCAL_AGENT_TIMEOUT_MS ?? defaultLocalAgentTimeoutMs),
      sessionDirName: ".ai-doc",
    });
  }
}

function buildSystemPrompt(context: RuntimeEditContext) {
  const workspaceRoot = projectWorkspaceRoot(context.project.id);

  if (context.project.type === "docx") {
    return [
      "You are an AI doc editing agent inside a local doc app.",
      "This project is a Word DOCX doc.",
      `Current focused file: ${resolve(workspaceRoot, "document.docx")}`,
      "Use the officecli command-line tool to inspect, create, edit, and validate the focused DOCX file. If an office skill is available in the agent environment, follow it.",
      "Prefer officecli L1/L2 operations such as view, get, query, add, set, remove, and validate. Do not hand-edit OOXML unless officecli high-level commands cannot solve the task.",
      "When asked to create or edit the doc, write the final DOCX result to the focused file.",
      "Do not convert the doc to HTML or Markdown unless the user explicitly asks for that as a separate export.",
      projectAssetPrompt(workspaceRoot),
      noBrowserRenderVerification,
      "After editing files, respond with a brief task summary only. Do not include extracted DOCX content in the final response.",
    ].join("\n\n");
  }

  if (context.project.type === "markdown") {
    const targetMarkdownPath = resolve(workspaceRoot, "document.md");
    return [
      "You are editing a Markdown artifact for a local AI doc editor.",
      `Current focused file: ${targetMarkdownPath}`,
      "Use filesystem read/write tools to inspect and modify the focused file directly. Do not treat the chat response as the primary way to update the doc.",
      "Write Markdown as a readable, maintainable working document for humans and agents. Optimize for clarity, scanability, and future edits rather than visual flourish.",
      "Preserve the existing document style and structure unless the user asks for a rewrite. For edits, make the smallest coherent change that satisfies the user. For new content, create a clear outline before expanding it.",
      "Use headings, short paragraphs, lists, tables, blockquotes, and fenced code blocks only when they improve understanding. Avoid malformed tables, broken nested lists, inconsistent heading levels, and unclosed code fences.",
      "Prefer native Markdown over inline HTML. Do not use Markdown as a fake web layout language.",
      projectAssetPrompt(workspaceRoot),
      noBrowserRenderVerification,
      "After editing files, respond with a brief task summary only. Do not include the full Markdown content in the final response.",
    ].join("\n\n");
  }

  const targetHtmlPath = resolve(workspaceRoot, "document.html");
  return [
    "You are editing an HTML artifact for a local AI doc editor.",
    `Current focused file: ${targetHtmlPath}`,
    "Use filesystem read/write tools to inspect and modify the focused file directly. Do not treat the chat response as the primary way to update the doc.",
    "Use HTML as a high-bandwidth artifact format: choose headings, sections, tables, lists, figures, SVG diagrams, images, code blocks, links, and lightweight interactions when they make the doc easier to understand or use.",
    "Preserve the existing editor runtime, CSS, layout conventions, and semantic structure unless the user explicitly asks for a redesign.",
    "Optimize for human review: clear visual hierarchy, readable spacing, navigable structure, and concise sections. Prefer an artifact the user will actually read over a long plain-text dump.",
    "Keep the file complete, valid, self-contained, and previewable in a browser/editor iframe. Do not convert the doc to Markdown.",
    projectAssetPrompt(workspaceRoot),
    noBrowserRenderVerification,
    "After editing files, respond with a brief task summary only. Do not include the HTML content in the final response.",
  ].join("\n\n");
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

function projectAssetPrompt(workspaceRoot: string) {
  const assetsDir = resolve(workspaceRoot, "assets");
  if (!existsSync(assetsDir)) return "No project context attachments are currently uploaded.";
  const assets = readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(assetsDir, entry.name);
      return `- ${entry.name} (${statSync(path).size} bytes): ${path}`;
    });
  if (assets.length === 0) return "No project context attachments are currently uploaded.";
  return [
    "Project context attachments are available in the workspace:",
    ...assets,
    "Use these files as source material when relevant. For PDFs, inspect or extract their text before claiming you cannot see their content.",
  ].join("\n");
}
