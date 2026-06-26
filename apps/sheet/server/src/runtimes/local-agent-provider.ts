import { resolve } from "node:path";
import {
  LocalAgentRuntimeProvider as SharedLocalAgentRuntimeProvider,
  loadTuttiLocalAgentSkillContext,
  type LocalAgentSkillContext,
} from "@ai-app/agent/local-agent-runtime";
import type { AiEditRequest, SheetRun } from "@ai-sheet/shared";
import { projectWorkspaceRoot } from "../local/paths.js";
import { officeCliEnvSync } from "../toolchains/officecli.js";
import { tuttiCliEnv } from "../tutti/tutti-cli.js";
import type { RuntimeEditContext, SheetRuntimeProject } from "./runtime-provider.js";

const defaultLocalAgentTimeoutMs = 30 * 60_000;

const localFilesystemArtifactNotice =
  "This artifact is a local filesystem file owned by the AI Sheet app. It is not a Lark/Feishu cloud sheet or document. Do not use Lark/Feishu cloud-document skills or tools unless the user explicitly asks to import, export, sync, publish, upload, download, or otherwise interact with Lark/Feishu.";

export class LocalAgentRuntimeProvider extends SharedLocalAgentRuntimeProvider<SheetRun, SheetRuntimeProject, AiEditRequest> {
  constructor() {
    super({
      workspaceRoot: (context) => projectWorkspaceRoot(context.project.id),
      buildPrompt: buildEditPrompt,
      buildSystemPrompt,
      buildSkillManifest: buildTuttiAgentSkillContext,
      buildEnv: (context, workspaceRoot) => ({
        ...officeCliEnvSync(),
        ...tuttiCliEnv(),
        AI_SHEET_WORKSPACE: workspaceRoot,
        AI_SHEET_PROJECT_ID: context.project.id,
        AI_SHEET_RUN_ID: context.run.id,
      }),
      useProviderResume: () => true,
      timeoutMs: () => Number(process.env.AI_SHEET_LOCAL_AGENT_TIMEOUT_MS ?? defaultLocalAgentTimeoutMs),
      sessionDirName: ".ai-sheet",
    });
  }
}

async function buildTuttiAgentSkillContext(context: RuntimeEditContext, workspaceRoot: string) {
  try {
    return await loadTuttiLocalAgentSkillContext({
      provider: context.runtimeProfile.provider,
      agentSessionId: context.run.id,
      cwd: tuttiWorkspaceCwd(workspaceRoot),
      commandEnvNames: ["AI_SHEET_TUTTI_CLI"],
    });
  } catch (error) {
    console.warn(`[ai-sheet] Unable to load Tutti agent skill bundle: ${errorMessage(error)}`);
    return { skills: [] };
  }
}

function tuttiWorkspaceCwd(fallback: string) {
  return process.env.TUTTI_WORKSPACE_ROOT?.trim() || process.env.AI_SHEET_WORKSPACE_ROOT?.trim() || fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildSystemPrompt(context: RuntimeEditContext, _workspaceRoot: string, skillContext: LocalAgentSkillContext) {
  const targetXlsxPath = resolve(projectWorkspaceRoot(context.project.id), "workbook.xlsx");
  return withTuttiSkillGuidance(
    [
      "You are an AI spreadsheet editing agent inside a local workbook app.",
      "The project is an XLSX workbook.",
      `Current focused file: ${targetXlsxPath}`,
      localFilesystemArtifactNotice,
      "Use the officecli command-line tool to inspect, create, edit, and validate the focused XLSX file. If an office skill is available in the agent environment, follow it.",
      "Prefer officecli L1/L2 operations such as view, get, query, add, set, remove, import, and validate. Do not hand-edit OOXML unless officecli high-level commands cannot solve the task.",
      "When asked to create or edit spreadsheet content, write the final XLSX result to workbook.xlsx.",
      "Do not convert the workbook to Markdown, CSV, or HTML unless explicitly asked for a separate export.",
      "After editing files, respond with a brief task summary only. Do not include extracted workbook content in the final response.",
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

function buildEditPrompt(context: RuntimeEditContext) {
  const focusedPath = resolve(projectWorkspaceRoot(context.project.id), "workbook.xlsx");
  const selection = [
    `selection_type: ${context.request.selectionType ?? "write"}`,
    `selection_path: ${context.request.selectionPath ?? ""}`,
    `selected_text: ${context.request.selectedText ?? ""}`,
    `selected_html: ${context.request.selectedHtml ?? ""}`,
  ].join("\n");

  return `<sheet_agent_context>
project_id: ${context.project.id}
title: ${context.project.title}
artifact_type: xlsx
mode: ${context.request.mode}
focused_xlsx_path: ${focusedPath}
canonical_xlsx_path: workbook.xlsx
${selection}
</sheet_agent_context>

<current_xlsx_manifest>
${JSON.stringify(context.project.xlsxManifest ?? null, null, 2)}
</current_xlsx_manifest>

<user_instruction>
${context.request.userPrompt}
</user_instruction>

Use officecli to inspect and edit the focused XLSX when possible. Create or edit the XLSX file at workbook.xlsx.`;
}
