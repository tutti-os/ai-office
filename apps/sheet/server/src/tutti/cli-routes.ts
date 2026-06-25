import type { FastifyInstance, FastifyReply } from "fastify";
import type { OpenSheetCliResponse, SheetArtifact, SheetProject } from "@ai-sheet/shared";
import { getTuttiCliStatus, openTuttiAppRoute } from "./tutti-cli.js";
import type { SheetService } from "../artifact/sheet-service.js";

interface CliInvokeEnvelope {
  input?: Record<string, unknown>;
}

export function registerTuttiCliRoutes(server: FastifyInstance, sheets: SheetService) {
  server.post("/tutti/cli/status", async (_request, reply) => {
    const projects = sheets.listProjects().projects;
    const providers = await sheets.listLocalAgentProviders().catch(() => ({ providers: [] }));
    const latestProject = projects[0] ?? null;
    return reply.send(jsonOutput({
      ok: true,
      appId: "ai-sheet",
      version: process.env.AI_SHEET_APP_VERSION ?? "0.0.0",
      projectCount: projects.length,
      runtimeProviderCount: providers.providers.length,
      latestProject: latestProject ? projectSummary(latestProject) : null,
      tuttiCli: await getTuttiCliStatus(),
    }));
  });

  server.post<{ Body: CliInvokeEnvelope | Record<string, unknown> }>("/tutti/cli/list-projects", async (request, reply) => {
    const input = commandInput(request.body);
    const limit = clampInteger(input.limit, 1, 100, 20);
    const rows = sheets.listProjects().projects.slice(0, limit).map(projectSummary);
    return reply.send({
      kind: "table",
      columns: [
        { key: "title", label: "Title" },
        { key: "type", label: "Type" },
        { key: "updated-at", label: "Updated" },
      ],
      rows,
    });
  });

  server.post<{ Body: CliInvokeEnvelope | Record<string, unknown> }>("/tutti/cli/open", async (request, reply) => {
    const input = commandInput(request.body);
    if (typeof input.path !== "string" || !input.path.trim()) {
      return sendCliError(reply, 400, "invalid_input", "path is required and must point to an .xlsx file");
    }
    try {
      const result = await sheets.importXlsxProject({
        path: input.path,
        title: typeof input.title === "string" ? input.title : undefined,
      });
      return reply.send(jsonOutput(await openSheetCliOutput(sheets, result)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "open_failed", errorMessage(error));
    }
  });

  server.post<{ Body: CliInvokeEnvelope | Record<string, unknown> }>("/tutti/cli/create", async (request, reply) => {
    const input = commandInput(request.body);
    if (typeof input.path !== "string" || !input.path.trim()) {
      return sendCliError(reply, 400, "invalid_input", "path is required and must point to an .xlsx file");
    }
    const result = await sheets.importXlsxProject({
      path: input.path,
      title: typeof input.title === "string" ? input.title : undefined,
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

async function openSheetCliOutput(
  sheets: SheetService,
  input: { sourcePath: string; project: SheetProject; artifact: SheetArtifact },
): Promise<OpenSheetCliResponse> {
  const route = projectRoute(input.project.id);
  return {
    ok: true,
    action: "imported",
    sourcePath: input.sourcePath,
    project: input.project,
    artifact: input.artifact,
    route,
    url: `${appBaseUrl()}${route}`,
    workspace: sheets.projectWorkspaceContext(input.project.id, input.artifact),
    tuttiAppOpen: await openTuttiAppRoute(appId(), route),
  };
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

function projectRoute(projectId: string) {
  return `/sheet/${encodeURIComponent(projectId)}`;
}

function appId() {
  return process.env.TUTTI_APP_ID?.trim() || "ai-sheet";
}

function appBaseUrl() {
  const configured = process.env.AI_SHEET_SERVER_URL?.trim();
  if (configured) return configured.replace(/\/+$/g, "");
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const port = process.env.PORT?.trim() || "8792";
  return `http://${host}:${port}`;
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
