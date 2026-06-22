import type { FastifyInstance, FastifyReply } from "fastify";
import type { SlideArtifactType, SlideProject } from "@ai-slide/shared";
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

  server.post<{ Body: CliInvokeEnvelope | Record<string, unknown> }>("/tutti/cli/create", async (request, reply) => {
    const input = commandInput(request.body);
    const artifactType = normalizeArtifactType(input.artifactType);
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
