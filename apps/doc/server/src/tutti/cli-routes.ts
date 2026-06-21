import type { FastifyInstance, FastifyReply } from "fastify";
import type { DocumentProject, DocumentType } from "@ai-doc/shared";
import { getTuttiCliStatus } from "./tutti-cli.js";
import type { DocumentService } from "../artifact/document-service.js";

interface CliInvokeEnvelope {
  input?: Record<string, unknown>;
}

export function registerTuttiCliRoutes(server: FastifyInstance, documents: DocumentService) {
  server.post("/tutti/cli/status", async (_request, reply) => {
    const projects = documents.listProjects().projects;
    const providers = await documents.listLocalAgentProviders().catch(() => ({ providers: [] }));
    const latestProject = projects[0] ?? null;
    return reply.send(jsonOutput({
      ok: true,
      appId: "ai-doc",
      version: process.env.AI_DOC_APP_VERSION ?? "0.0.0",
      projectCount: projects.length,
      runtimeProviderCount: providers.providers.length,
      latestProject: latestProject ? projectSummary(latestProject) : null,
      tuttiCli: await getTuttiCliStatus(),
    }));
  });

  server.post<{ Body: CliInvokeEnvelope | Record<string, unknown> }>("/tutti/cli/list-projects", async (request, reply) => {
    const input = commandInput(request.body);
    const limit = clampInteger(input.limit, 1, 100, 20);
    const rows = documents.listProjects().projects.slice(0, limit).map(projectSummary);
    return reply.send({
      kind: "table",
      columns: [
        { key: "title", label: "Title" },
        { key: "type", label: "Type" },
        { key: "updatedAt", label: "Updated" },
      ],
      rows,
    });
  });

  server.post<{ Body: CliInvokeEnvelope | Record<string, unknown> }>("/tutti/cli/create", async (request, reply) => {
    const input = commandInput(request.body);
    const type = normalizeDocumentType(input.type);
    if (!type) return sendCliError(reply, 400, "invalid_input", "type must be html or markdown");
    const result = await documents.createProject({
      title: typeof input.title === "string" ? input.title : undefined,
      type,
      content: typeof input.content === "string" ? input.content : undefined,
    });
    return reply.send(jsonOutput({ ok: true, project: result.project }));
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

function projectSummary(project: DocumentProject) {
  return {
    id: project.id,
    title: project.title,
    type: project.type,
    templateName: project.templateName,
    updatedAt: project.updatedAt,
  };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeDocumentType(value: unknown): Exclude<DocumentType, "docx"> | null {
  if (value === undefined || value === null || value === "") return "html";
  if (value === "html" || value === "markdown") return value;
  return null;
}
