import type { FastifyInstance, FastifyReply } from "fastify";
import type { OpenSlideCliResponse, SlideArtifact, SlideArtifactType, SlideProject } from "@ai-slide/shared";
import { getTuttiCliStatus } from "./tutti-cli.js";
import type { ProjectService } from "../artifact/project-service.js";

interface CliInvokeEnvelope {
  input?: Record<string, unknown>;
}

export function registerTuttiCliRoutes(server: FastifyInstance, projects: ProjectService) {
  server.post("/tutti/cli/status", async (_request, reply) => {
    const projectRows = projects.listProjects().projects;
    const providers = await projects.listLocalAgentProviders().catch(() => ({ providers: [] }));
    const latestProject = projectRows[0] ?? null;
    return reply.send(jsonOutput({
      ok: true,
      appId: "ai-slide",
      version: process.env.AI_SLIDE_APP_VERSION ?? "0.0.0",
      projectCount: projectRows.length,
      runtimeProviderCount: providers.providers.length,
      latestProject: latestProject ? projectSummary(latestProject) : null,
      tuttiCli: await getTuttiCliStatus(),
    }));
  });

  server.post<{ Body: CliInvokeEnvelope | Record<string, unknown> }>("/tutti/cli/list-projects", async (request, reply) => {
    const input = commandInput(request.body);
    const limit = clampInteger(input.limit, 1, 100, 20);
    const rows = projects.listProjects().projects.slice(0, limit).map(projectSummary);
    return reply.send({
      kind: "table",
      columns: [
        { key: "title", label: "Title" },
        { key: "template", label: "Template" },
        { key: "updated-at", label: "Updated" },
      ],
      rows,
    });
  });

  server.post<{ Body: CliInvokeEnvelope | Record<string, unknown> }>("/tutti/cli/open", async (request, reply) => {
    const input = commandInput(request.body);
    if (typeof input.path !== "string" || !input.path.trim()) {
      return sendCliError(reply, 400, "invalid_input", "path is required and must point to a .pptx file");
    }
    try {
      const result = await projects.importPptxProject({
        path: input.path,
        title: typeof input.title === "string" ? input.title : undefined,
      });
      return reply.send(jsonOutput(openSlideCliOutput(projects, result)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "open_failed", errorMessage(error));
    }
  });

  server.post<{ Body: CliInvokeEnvelope | Record<string, unknown> }>("/tutti/cli/create", async (request, reply) => {
    const input = commandInput(request.body);
    const artifactType = normalizeArtifactType(input["artifact-type"] ?? input.artifactType);
    if (!artifactType) return sendCliError(reply, 400, "invalid_input", "artifactType must be deck or pptx");
    const result = await projects.createProject({
      title: typeof input.title === "string" ? input.title : undefined,
      artifactType,
    });
    return reply.send(jsonOutput({ ok: true, project: result.project, artifact: result.artifact }));
  });
}

function commandInput(body: CliInvokeEnvelope | Record<string, unknown> | undefined) {
  if (body && typeof body === "object" && "input" in body && body.input && typeof body.input === "object") {
    return body.input as Record<string, unknown>;
  }
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function jsonOutput(value: unknown) {
  return { kind: "json", value };
}

function sendCliError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({ error: { code, message } });
}

function openSlideCliOutput(
  projects: ProjectService,
  input: { sourcePath: string; project: SlideProject; artifact: SlideArtifact },
): OpenSlideCliResponse {
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
