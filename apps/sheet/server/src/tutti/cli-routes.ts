import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { cliErrorOutput, cliJsonOutput, readCliInputBody } from "@ai-app/shared/tutti-cli";
import { resolveAgentTargetFromCatalog, runtimeProfileIdFromAgentTarget } from "@ai-app/shared/agent-providers";
import type { AiEditMode, OpenSheetCliResponse, SheetArtifact, SheetProject } from "@ai-sheet/shared";
import { getTuttiCliStatus, openTuttiAppRoute } from "./tutti-cli.js";
import type { SheetService } from "../artifact/sheet-service.js";
import { installOfficeCli } from "../toolchains/officecli.js";

type ManagedAgentHeaders = Record<string, string | string[] | undefined>;

export function registerTuttiCliRoutes(server: FastifyInstance, sheets: SheetService) {
  server.post("/tutti/cli/status", async (request, reply) => {
    const projects = sheets.listProjects().projects;
    const agents = await sheets.listLocalAgentTargets(request.headers).catch(() => ({ agents: [] }));
    const latestProject = projects[0] ?? null;
    return reply.send(cliJsonOutput({
      ok: true,
      appId: "ai-sheet",
      version: process.env.AI_SHEET_APP_VERSION ?? "0.0.0",
      projectCount: projects.length,
      agentTargetCount: agents.agents.length,
      latestProject: latestProject ? projectSummary(latestProject) : null,
      tuttiCli: await getTuttiCliStatus(),
    }));
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const limit = clampInteger(input.limit, 1, 100, 20);
    return reply.send(cliJsonOutput({ projects: sheets.listProjects().projects.slice(0, limit) }));
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/get", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(await sheets.getProject(projectId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "project_get_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/create", async (request, reply) => {
    return createProjectCliResponse(reply, sheets, readCliInputBody(request.body), request.headers);
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/open", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      const { project } = await sheets.getProject(projectId);
      return reply.send(cliJsonOutput(await openProjectCliOutput(project)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "project_open_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/workbook/get", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(await workbookCliOutput(sheets, projectId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "workbook_get_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/workspace/get", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(await workbookWorkspaceOutput(sheets, projectId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "workspace_get_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/exports/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      const { project, artifact } = await sheets.getProject(projectId);
      const workspace = sheets.projectWorkspaceContext(project.id, artifact);
      return reply.send(cliJsonOutput({
        project: projectSummary(project),
        artifact,
        workspace,
        exports: await listWorkspaceFiles(workspace.workspaceRoot, "exports"),
      }));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "exports_list_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/sessions/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(sheets.listConversationSessions(projectId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "sessions_list_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/sessions/create", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(sheets.createConversationSession(projectId, { title: optionalString(input, "title") })));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "session_create_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/messages/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    const sessionId = requiredString(input, "session-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    if (!sessionId) return sendCliError(reply, 400, "invalid_input", "session-id is required");
    try {
      return reply.send(cliJsonOutput(sheets.listConversationMessages({ projectId, sessionId })));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "messages_list_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/messages/create", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    const sessionId = requiredString(input, "session-id");
    const role = normalizeMessageRole(input.role);
    const content = requiredString(input, "content");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    if (!sessionId) return sendCliError(reply, 400, "invalid_input", "session-id is required");
    if (!role) return sendCliError(reply, 400, "invalid_input", "role must be user or assistant");
    if (!content) return sendCliError(reply, 400, "invalid_input", "content is required");
    try {
      return reply.send(cliJsonOutput(sheets.createConversationMessage({ projectId, sessionId, role, content })));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "message_create_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/run", async (request, reply) => {
    return agentRunCliResponse(reply, sheets, readCliInputBody(request.body), request.headers);
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/edit", async (request, reply) => {
    return agentRunCliResponse(reply, sheets, readCliInputBody(request.body), request.headers);
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/events", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const runId = requiredString(input, "run-id");
    if (!runId) return sendCliError(reply, 400, "invalid_input", "run-id is required");
    try {
      const result = sheets.listRunEvents(runId);
      return reply.send(cliJsonOutput({
        ...result,
        openTarget: result.run?.projectId ? projectOpenTarget(result.run.projectId) : null,
        guidance: finalOpenGuidance("AI Sheet"),
      }));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "agent_events_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/cancel", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const runId = requiredString(input, "run-id");
    if (!runId) return sendCliError(reply, 400, "invalid_input", "run-id is required");
    try {
      const result = await sheets.cancelRun(runId);
      if (!result) return sendCliError(reply, 404, "run_not_found", "Run not found");
      return reply.send(cliJsonOutput(result));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "agent_cancel_failed", errorMessage(error));
    }
  });

  server.post("/tutti/cli/officecli/install", async (_request, reply) => {
    try {
      return reply.send(cliJsonOutput({ officecli: await installOfficeCli() }));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "officecli_install_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/open", async (request, reply) => {
    const input = readCliInputBody(request.body);
    if (typeof input.path !== "string" || !input.path.trim()) {
      return sendCliError(reply, 400, "invalid_input", "path is required and must point to an .xlsx file");
    }
    try {
      const result = await sheets.importXlsxProject({
        path: input.path,
        title: typeof input.title === "string" ? input.title : undefined,
      });
      return reply.send(cliJsonOutput(openSheetCliOutput(sheets, result)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "open_failed", errorMessage(error));
    }
  });
}

async function workbookCliOutput(sheets: SheetService, projectId: string) {
  const detail = await sheets.getProject(projectId);
  const workspace = sheets.projectWorkspaceContext(detail.project.id, detail.artifact);
  return {
    project: projectSummary(detail.project),
    artifact: detail.artifact,
    contentMode: "local-file",
    xlsxManifest: detail.xlsxManifest,
    workspace,
    exports: await listWorkspaceFiles(workspace.workspaceRoot, "exports"),
    guidance: [
      "XLSX content is stored in the focused local file instead of being returned inline.",
      "Inspect the focusedPath with OfficeCLI or another local XLSX-aware tool.",
      modificationGuidance("sheet"),
    ],
  };
}

async function workbookWorkspaceOutput(sheets: SheetService, projectId: string) {
  const detail = await sheets.getProject(projectId);
  const workspace = sheets.projectWorkspaceContext(detail.project.id, detail.artifact);
  return {
    project: projectSummary(detail.project),
    artifact: detail.artifact,
    xlsxManifest: detail.xlsxManifest,
    workspace,
    assets: await listWorkspaceFiles(workspace.workspaceRoot, "assets"),
    exports: await listWorkspaceFiles(workspace.workspaceRoot, "exports"),
    guidance: [
      "Use focusedPath for local inspection when content is too large or binary for inline CLI output.",
      modificationGuidance("sheet"),
    ],
  };
}

async function createProjectCliResponse(
  reply: FastifyReply,
  sheets: SheetService,
  input: Record<string, unknown>,
  headers: ManagedAgentHeaders,
) {
  const prompt = optionalString(input, "prompt");
  const mode = normalizeAiMode(input.mode);
  if (!mode) return sendCliError(reply, 400, "invalid_input", "mode must be write or rewrite");
  try {
    const runtimeProfileId = await runtimeProfileIdFromCliInput(input, sheets, headers);
    if (runtimeProfileId.error) return sendCliError(reply, 400, "invalid_input", runtimeProfileId.error);
    const result = await sheets.createProject({
      title: typeof input.title === "string" ? input.title : undefined,
    });
    const run = prompt
      ? (await sheets.startAiEdit(result.project.id, {
          userPrompt: prompt,
          mode,
          selectedText: "",
          selectedHtml: "",
          selectionType: "write",
          selectionPath: "",
          runtimeProfileId: runtimeProfileId.value,
        }, headers)).run
      : null;
    return reply.send(cliJsonOutput({
      ok: true,
      project: result.project,
      artifact: result.artifact,
      xlsxManifest: result.xlsxManifest,
      run,
      openTarget: projectOpenTarget(result.project.id),
      workspace: sheets.projectWorkspaceContext(result.project.id, result.artifact),
      guidance: finalOpenGuidance("AI Sheet"),
    }));
  } catch (error) {
    return sendCliError(reply, cliErrorStatus(error), "project_create_failed", errorMessage(error));
  }
}

async function agentRunCliResponse(
  reply: FastifyReply,
  sheets: SheetService,
  input: Record<string, unknown>,
  headers: ManagedAgentHeaders,
) {
  const projectId = requiredString(input, "project-id");
  const prompt = requiredString(input, "prompt");
  const mode = normalizeAiMode(input.mode);
  if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
  if (!prompt) return sendCliError(reply, 400, "invalid_input", "prompt is required");
  if (!mode) return sendCliError(reply, 400, "invalid_input", "mode must be write or rewrite");
  try {
    const runtimeProfileId = await runtimeProfileIdFromCliInput(input, sheets, headers);
    if (runtimeProfileId.error) return sendCliError(reply, 400, "invalid_input", runtimeProfileId.error);
    await sheets.getProject(projectId);
    const result = await sheets.startAiEdit(projectId, {
      userPrompt: prompt,
      mode,
      selectedText: "",
      selectedHtml: "",
      selectionType: "write",
      selectionPath: "",
      sessionId: optionalString(input, "session-id"),
      runtimeProfileId: runtimeProfileId.value,
    }, headers);
    return reply.send(cliJsonOutput({
      ...result,
      openTarget: projectOpenTarget(projectId),
      guidance: finalOpenGuidance("AI Sheet"),
    }));
  } catch (error) {
    return sendCliError(reply, cliErrorStatus(error), "agent_run_failed", errorMessage(error));
  }
}

function sendCliError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send(cliErrorOutput(code, message));
}

function requiredString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function optionalString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function runtimeProfileIdFromCliInput(
  input: Record<string, unknown>,
  sheets: SheetService,
  headers: ManagedAgentHeaders,
): Promise<{ value?: string; error?: string }> {
  const agentTargetId = optionalString(input, "agent-id");
  const provider = optionalString(input, "provider");
  const runtimeProfileId = optionalString(input, "runtime-profile-id");
  if (runtimeProfileId && (agentTargetId || provider)) {
    return { error: "provide agent-id, deprecated provider, or runtime-profile-id, not more than one" };
  }
  if (runtimeProfileId) return { value: runtimeProfileId };
  if (!agentTargetId && !provider) return { value: undefined };
  const { agents } = await sheets.listLocalAgentTargets(headers);
  const target = resolveAgentTargetFromCatalog({ agents, agentTargetId, legacyProvider: provider, useDefault: false });
  if (target.error || !target.value) return { error: target.error ?? "agent-id is required" };
  return runtimeProfileIdFromAgentTarget(target.value.agentTargetId);
}

function normalizeMessageRole(value: unknown): "user" | "assistant" | null {
  if (value === "user" || value === "assistant") return value;
  return null;
}

function normalizeAiMode(value: unknown): AiEditMode | null {
  if (value === undefined || value === null || value === "") return "write";
  if (value === "write" || value === "rewrite") return value;
  return null;
}

function openSheetCliOutput(
  sheets: SheetService,
  input: { sourcePath: string; project: SheetProject; artifact: SheetArtifact },
): OpenSheetCliResponse {
  return {
    ok: true,
    action: "imported",
    sourcePath: input.sourcePath,
    project: input.project,
    artifact: input.artifact,
    openTarget: projectOpenTarget(input.project.id),
    workspace: sheets.projectWorkspaceContext(input.project.id, input.artifact),
  };
}

async function openProjectCliOutput(project: SheetProject) {
  const route = projectRoute(project.id);
  const appOpen = await openTuttiAppRoute(appId(), route);
  if (appOpen.error) {
    throw new Error(appOpen.error);
  }
  return {
    ok: true,
    project: projectSummary(project),
    openRequested: true,
    openTarget: projectOpenTarget(project.id),
    tuttiAppOpen: appOpen,
  };
}

function projectOpenTarget(projectId: string) {
  return {
    kind: "tutti-cli-command" as const,
    appId: appId(),
    directOpenSupported: true as const,
    label: "Open in AI Sheet",
    projectId,
    userFacing: false as const,
    command: {
      scope: "sheet",
      path: ["projects", "open"],
      input: { "project-id": projectId },
      display: `sheet projects open --project-id ${projectId}`,
    },
  };
}

function finalOpenGuidance(appName: string) {
  return `Do not display openTarget internals or any raw app route as a user-facing link. When the task is complete, tell the user they can view the result in ${appName} and ask whether they want you to open it directly. If they confirm, call the returned openTarget command.`;
}

function projectSummary(project: SheetProject) {
  return {
    id: project.id,
    title: project.title,
    type: "xlsx",
    templateName: project.templateName,
    updatedAt: project.updatedAt,
    "updated-at": project.updatedAt,
  };
}

function modificationGuidance(scope: "sheet") {
  return `To modify project content through CLI, start an app-owned agent edit with ${scope} agent edit. Do not write raw content updates through external CLI commands.`;
}

async function listWorkspaceFiles(workspaceRoot: string, relativeDir: string) {
  const root = join(workspaceRoot, relativeDir);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const absolutePath = join(root, entry.name);
      const info = await stat(absolutePath).catch(() => null);
      return {
        fileName: entry.name,
        path: absolutePath,
        relativePath: `${relativeDir}/${entry.name}`.split("\\").join("/"),
        sizeBytes: info?.size ?? null,
        mtimeMs: info ? Math.trunc(info.mtimeMs) : null,
        mimeType: mimeTypeForFileName(entry.name),
      };
    }));
  return files.sort((left, right) => String(left.fileName).localeCompare(String(right.fileName)));
}

function mimeTypeForFileName(fileName: string) {
  const extension = extname(fileName).slice(1).toLowerCase();
  if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "csv") return "text/csv";
  if (extension === "tsv") return "text/tab-separated-values";
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function projectRoute(projectId: string) {
  return `/sheet/${encodeURIComponent(projectId)}`;
}

function appId() {
  return process.env.TUTTI_APP_ID?.trim() || "ai-sheet";
}

function cliErrorStatus(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("officecli")) return 503;
  if (message.includes("no such file") || message.includes("enoent")) return 404;
  return 400;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unable to open workbook");
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
