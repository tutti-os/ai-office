import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalAgentRuntimeProvider as SharedLocalAgentRuntimeProvider } from "@ai-app/agent/local-agent-runtime";
import type { AiEditRequest, DocumentProject, DocumentRun } from "@ai-doc/shared";
import { projectWorkspaceRoot } from "../local/paths.js";
import type { RuntimeEditContext } from "./runtime-provider.js";

export class LocalAgentRuntimeProvider extends SharedLocalAgentRuntimeProvider<DocumentRun, DocumentProject, AiEditRequest> {
  constructor() {
    super({
      workspaceRoot: (context) => projectWorkspaceRoot(context.project.id),
      buildPrompt: buildEditPrompt,
      buildSystemPrompt,
      buildMcpServers,
      buildEnv: (context, workspaceRoot) => ({
        AI_DOC_WORKSPACE: workspaceRoot,
        AI_DOC_PROJECT_ID: context.project.id,
        AI_DOC_RUN_ID: context.run.id,
        AI_DOC_TOOL_BASE_URL: localToolBaseUrl(),
      }),
      timeoutMs: () => Number(process.env.AI_DOC_LOCAL_AGENT_TIMEOUT_MS ?? 180_000),
      sessionDirName: ".ai-doc",
    });
  }
}

function buildSystemPrompt(context: RuntimeEditContext) {
  if (context.project.type === "docx") {
    return [
      "You are an AI document editing agent inside a local document app.",
      "This project is a Word DOCX document.",
      "The canonical file is `document.docx` in the current working directory.",
      "When asked to create or edit the document, write the final DOCX result to `document.docx`.",
      "Do not convert the document to HTML or Markdown unless the user explicitly asks for that as a separate export.",
    ].join("\n\n");
  }

  return [
    "You are an AI document editing agent inside a local rich text editor.",
    "The canonical runtime is a full HTML document. Do not convert it to Markdown.",
    "Preserve existing CSS, layout intent, semantic headings, and editable HTML structure unless the user explicitly asks for a redesign.",
    "When asked to edit, return one complete updated HTML document as your final answer.",
    "Do not explain the changes outside the HTML. If you use tools, still ensure the final answer contains the complete updated HTML.",
  ].join("\n\n");
}

function buildEditPrompt(context: RuntimeEditContext) {
  if (context.project.type === "docx") {
    return `<docs_agent_context>
project_id: ${context.project.id}
title: ${context.project.title}
document_type: ${context.project.type}
mode: ${context.request.mode}
selection_type: ${context.request.selectionType ?? "write"}
selection_path: ${context.request.selectionPath ?? ""}
canonical_docx_path: document.docx
</docs_agent_context>

<user_instruction>
${context.request.userPrompt}
</user_instruction>

<selected_text>
${context.request.selectedText ?? ""}
</selected_text>

<current_docx_manifest>
${context.project.content}
</current_docx_manifest>

Create or edit the DOCX file at document.docx.`;
  }

  return `<docs_agent_context>
project_id: ${context.project.id}
title: ${context.project.title}
document_type: ${context.project.type}
mode: ${context.request.mode}
selection_type: ${context.request.selectionType ?? "write"}
selection_path: ${context.request.selectionPath ?? ""}
</docs_agent_context>

<user_instruction>
${context.request.userPrompt}
</user_instruction>

<selected_text>
${context.request.selectedText ?? ""}
</selected_text>

<selected_html>
${context.request.selectedHtml ?? ""}
</selected_html>

<current_html>
${context.request.htmlContent || context.project.content}
</current_html>

Return the complete updated HTML document only.`;
}

function buildMcpServers(context: RuntimeEditContext) {
  if (!context.toolAccess?.token) return [];
  return [
    {
      name: "ai-doc",
      type: "stdio" as const,
      command: process.execPath,
      args: [resolveLocalAgentHostScript("tools-mcp.mjs")],
      env: {
        AI_DOC_TOOL_BASE_URL: localToolBaseUrl(),
        AI_DOC_TOOL_TOKEN: context.toolAccess.token,
        AI_DOC_PROJECT_ID: context.project.id,
        AI_DOC_RUN_ID: context.run.id,
      },
    },
  ];
}

function resolveLocalAgentHostScript(filename: string) {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, "..", "local-agent-host", filename);
}

function localToolBaseUrl() {
  return process.env.AI_DOC_SERVER_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8790}`;
}
