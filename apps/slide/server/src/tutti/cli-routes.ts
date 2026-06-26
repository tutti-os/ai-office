import type { FastifyInstance, FastifyReply } from "fastify";
import { cliErrorOutput, cliJsonOutput, readCliInputBody } from "@ai-app/shared/tutti-cli";
import type { AiEditMode, OpenSlideCliResponse, SlideArtifact, SlideArtifactType, SlideProject } from "@ai-slide/shared";
import { getTuttiCliStatus, openTuttiAppRoute } from "./tutti-cli.js";
import type { ProjectService } from "../artifact/project-service.js";
import { installOfficeCli } from "../toolchains/officecli.js";

export function registerTuttiCliRoutes(server: FastifyInstance, projects: ProjectService) {
  server.post("/tutti/cli/status", async (_request, reply) => {
    const projectRows = projects.listProjects().projects;
    const providers = await projects.listLocalAgentProviders().catch(() => ({ providers: [] }));
    const latestProject = projectRows[0] ?? null;
    return reply.send(cliJsonOutput({
      ok: true,
      appId: "ai-slide",
      version: process.env.AI_SLIDE_APP_VERSION ?? "0.0.0",
      projectCount: projectRows.length,
      runtimeProviderCount: providers.providers.length,
      latestProject: latestProject ? projectSummary(latestProject) : null,
      tuttiCli: await getTuttiCliStatus(),
    }));
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const limit = clampInteger(input.limit, 1, 100, 20);
    return reply.send(cliJsonOutput({ projects: projects.listProjects().projects.slice(0, limit) }));
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/get", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(await projects.getProject(projectId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "project_get_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/create", async (request, reply) => {
    return createProjectCliResponse(reply, projects, readCliInputBody(request.body));
  });

  server.post<{ Body: unknown }>("/tutti/cli/sessions/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(projects.listConversationSessions(projectId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "sessions_list_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/sessions/create", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(projects.createConversationSession(projectId, { title: optionalString(input, "title") })));
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
      return reply.send(cliJsonOutput(projects.listConversationMessages({ projectId, sessionId })));
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
      return reply.send(cliJsonOutput(projects.createConversationMessage({ projectId, sessionId, role, content })));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "message_create_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/run", async (request, reply) => {
    return agentRunCliResponse(reply, projects, readCliInputBody(request.body));
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/events", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const runId = requiredString(input, "run-id");
    if (!runId) return sendCliError(reply, 400, "invalid_input", "run-id is required");
    try {
      return reply.send(cliJsonOutput(projects.listRunEvents(runId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "agent_events_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/cancel", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const runId = requiredString(input, "run-id");
    if (!runId) return sendCliError(reply, 400, "invalid_input", "run-id is required");
    try {
      const result = await projects.cancelRun(runId);
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
      return sendCliError(reply, 400, "invalid_input", "path is required and must point to a .pptx file");
    }
    try {
      const result = await projects.importPptxProject({
        path: input.path,
        title: typeof input.title === "string" ? input.title : undefined,
      });
      return reply.send(cliJsonOutput(await openSlideCliOutput(projects, result)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "open_failed", errorMessage(error));
    }
  });
}

async function createProjectCliResponse(reply: FastifyReply, projects: ProjectService, input: Record<string, unknown>) {
  const artifactType = normalizeArtifactType(input["artifact-type"] ?? input.artifactType);
  if (!artifactType) return sendCliError(reply, 400, "invalid_input", "artifactType must be deck or pptx");
  const prompt = optionalString(input, "prompt");
  const mode = normalizeAiMode(input.mode);
  if (!mode) return sendCliError(reply, 400, "invalid_input", "mode must be write or rewrite");
  try {
    const result = await projects.createProject({
      title: typeof input.title === "string" ? input.title : undefined,
      artifactType,
    });
    const run = prompt
      ? (await projects.startAiEdit(result.project.id, {
          userPrompt: prompt,
          mode,
          artifactType,
          selectedText: "",
          selectedHtml: "",
          selectionType: "write",
          selectionPath: "",
          runtimeProfileId: optionalString(input, "runtime-profile-id"),
        })).run
      : null;
    const route = projectRoute(result.project.id);
    return reply.send(cliJsonOutput({
      ok: true,
      project: result.project,
      artifact: result.artifact,
      run,
      route,
      url: `${appBaseUrl()}${route}`,
      workspace: projects.projectWorkspaceContext(result.project.id, result.artifact),
    }));
  } catch (error) {
    return sendCliError(reply, cliErrorStatus(error), "project_create_failed", errorMessage(error));
  }
}

async function agentRunCliResponse(reply: FastifyReply, projects: ProjectService, input: Record<string, unknown>) {
  const projectId = requiredString(input, "project-id");
  const prompt = requiredString(input, "prompt");
  const mode = normalizeAiMode(input.mode);
  if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
  if (!prompt) return sendCliError(reply, 400, "invalid_input", "prompt is required");
  if (!mode) return sendCliError(reply, 400, "invalid_input", "mode must be write or rewrite");
  try {
    const { artifact } = await projects.getProject(projectId);
    return reply.send(cliJsonOutput(await projects.startAiEdit(projectId, {
      userPrompt: prompt,
      mode,
      artifactType: artifact.type,
      selectedText: "",
      selectedHtml: "",
      selectionType: "write",
      selectionPath: "",
      sessionId: optionalString(input, "session-id"),
      runtimeProfileId: optionalString(input, "runtime-profile-id"),
    })));
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

function normalizeMessageRole(value: unknown): "user" | "assistant" | null {
  if (value === "user" || value === "assistant") return value;
  return null;
}

function normalizeAiMode(value: unknown): AiEditMode | null {
  if (value === undefined || value === null || value === "") return "write";
  if (value === "write" || value === "rewrite") return value;
  return null;
}

async function openSlideCliOutput(
  projects: ProjectService,
  input: { sourcePath: string; project: SlideProject; artifact: SlideArtifact },
): Promise<OpenSlideCliResponse> {
  const route = projectRoute(input.project.id);
  return {
    ok: true,
    action: "imported",
    sourcePath: input.sourcePath,
    project: input.project,
    artifact: input.artifact,
    route,
    url: `${appBaseUrl()}${route}`,
    workspace: projects.projectWorkspaceContext(input.project.id, input.artifact),
    tuttiAppOpen: await openTuttiAppRoute(appId(), route),
  };
}

function projectSummary(project: SlideProject) {
  return {
    id: project.id,
    title: project.title,
    template: project.templateName,
    templateName: project.templateName,
    updatedAt: project.updatedAt,
    "updated-at": project.updatedAt,
  };
}

function projectRoute(projectId: string) {
  return `/slide/${encodeURIComponent(projectId)}`;
}

function appId() {
  return process.env.TUTTI_APP_ID?.trim() || "ai-slide";
}

function appBaseUrl() {
  const configured = process.env.AI_SLIDE_SERVER_URL?.trim();
  if (configured) return configured.replace(/\/+$/g, "");
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const port = process.env.PORT?.trim() || "8791";
  return `http://${host}:${port}`;
}

function cliErrorStatus(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("officecli")) return 503;
  if (message.includes("no such file") || message.includes("enoent")) return 404;
  return 400;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unable to open presentation");
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeArtifactType(value: unknown): SlideArtifactType | undefined {
  if (value === undefined || value === null || value === "") return "deck";
  if (value === "deck" || value === "pptx") return value;
  return undefined;
}
