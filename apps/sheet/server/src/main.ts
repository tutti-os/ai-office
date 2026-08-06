import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { installArtifactProcessErrorHandlers, registerArtifactServerErrorHandlers } from "@ai-app/shared/server-errors";
import { addArtifactBufferContentTypeParsers, readArtifactExportRequest, readArtifactUploadRequest, sendArtifactBinaryFile } from "@ai-app/shared/server-files";
import { ArtifactAppHttpRoutes } from "@ai-app/shared/server-routes";
import { type AiEditRequest, type ApplySheetCommandsRequest, xlsxMimeType } from "@ai-sheet/shared";
import { SheetRepository } from "./artifact/sheet-repository.js";
import { SheetService } from "./artifact/sheet-service.js";
import { XlsxStorageAdapter } from "./artifact/xlsx-storage-adapter.js";
import { registerSheetAgentToolRoutes } from "./agent-tools.js";
import { listTemplates } from "./templates/template-service.js";
import { getOfficeCliStatus, installOfficeCli } from "./toolchains/officecli.js";
import { registerTuttiCliRoutes } from "./tutti/cli-routes.js";
import { registerTuttiReferenceRoutes } from "./tutti/reference-routes.js";
import { EventHub } from "./ws/event-hub.js";

const webDist = process.env.AI_SHEET_WEB_DIST ? resolve(process.env.AI_SHEET_WEB_DIST) : resolve(process.cwd(), "../web/dist");
const port = Number(process.env.PORT ?? 8792);
const host = process.env.HOST ?? "127.0.0.1";

const server = Fastify({ logger: true, bodyLimit: 90 * 1024 * 1024 });
registerArtifactServerErrorHandlers(server, { appId: "ai-sheet" });
installArtifactProcessErrorHandlers({ appId: "ai-sheet", logger: server.log });
const events = new EventHub();
const repo = new SheetRepository();
const sheets = new SheetService(repo, events, new XlsxStorageAdapter());

addArtifactBufferContentTypeParsers(server, {
  octetStreamBodyLimit: 90 * 1024 * 1024,
});

await server.register(fastifyWebsocket);
registerSheetAgentToolRoutes(server, sheets);
registerTuttiCliRoutes(server, sheets);
registerTuttiReferenceRoutes(server);

if (existsSync(webDist)) {
  await server.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
    decorateReply: true,
  });
}

new ArtifactAppHttpRoutes({
  appId: "ai-sheet",
  service: sheets,
  events,
  listTemplates,
  defaultAiEditInput: {
    userPrompt: "",
    mode: "write",
  } satisfies AiEditRequest,
  toolchain: {
    responseKey: "officecli",
    getStatus: getOfficeCliStatus,
    install: installOfficeCli,
    isAvailable: (officecli) => officecli.available,
    errorMessage: (officecli) => officecli.reason ?? "Unable to install OfficeCLI",
    errorStatus: (error) => ({
      available: false,
      source: "missing" as const,
      canInstall: false,
      installing: false,
      reason: error instanceof Error ? error.message : "Unable to check OfficeCLI status.",
    }),
  },
}).register(server);

server.post<{ Params: { projectId: string }; Body: ApplySheetCommandsRequest }>("/api/projects/:projectId/commands", async (request, reply) => {
  try {
    return await sheets.applyCommands(request.params.projectId, request.body ?? { baseRevision: 0, baseSha256: null, commands: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply XLSX commands";
    const lower = message.toLowerCase();
    const status = lower.includes("stale") ? 409 : lower.includes("officecli") ? 503 : lower.includes("not found") ? 404 : 400;
    return reply.code(status).send({ error: message });
  }
});

server.post<{ Body: { path?: string; title?: string } }>("/api/dev/projects/import-xlsx", async (request, reply) => {
  try {
    return await sheets.importXlsxProject(request.body ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import XLSX project";
    return reply.code(message.includes("not found") || message.includes("no such file") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Body: Buffer }>("/api/projects/import", async (request, reply) => {
  try {
    const upload = readArtifactUploadRequest(request, { defaultFileName: "workbook.xlsx" });
    return await sheets.importXlsxProjectFile({
      fileName: upload.fileName,
      bytes: upload.bytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import XLSX project";
    return reply.code(400).send({ error: message });
  }
});

server.get<{ Params: { projectId: string } }>("/api/projects/:projectId/files/workbook.xlsx", async (request, reply) => {
  try {
    const file = await sheets.readXlsxFile(request.params.projectId);
    return sendArtifactBinaryFile(reply, file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read XLSX file";
    return reply.code(message.includes("not found") || message.includes("no such file") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/exports", async (request, reply) => {
  try {
    const exported = await sheets.writeProjectExport(request.params.projectId, readArtifactExportRequest(request, {
      defaultFileName: "workbook.xlsx",
      defaultMimeType: xlsxMimeType,
    }));
    return reply.send(exported);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to write export";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/context-attachments", async (request, reply) => {
  try {
    const attachment = await sheets.uploadContextAttachment(request.params.projectId, readArtifactUploadRequest(request, {
      defaultFileName: "attachment",
    }));
    return reply.send(attachment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload context attachment";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string } }>("/api/projects/:projectId/exports/xlsx", async (request, reply) => {
  try {
    return await sheets.exportXlsxFile(request.params.projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export XLSX file";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string } }>("/api/projects/:projectId/exports/open", async (request, reply) => {
  try {
    return await sheets.openProjectExportsDir(request.params.projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open exports folder";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith("/api/") || request.raw.url?.startsWith("/local-assets/")) {
    return reply.code(404).send({ error: "Not found" });
  }
  const indexPath = join(webDist, "index.html");
  if (existsSync(indexPath)) return reply.sendFile("index.html");
  return reply.type("text/html").send(`
    <html>
      <body style="font-family: system-ui; padding: 32px">
        <h1>ai-sheet server is running</h1>
        <p>Build the web app or run <code>pnpm dev:web</code> for the Vite client.</p>
      </body>
    </html>
  `);
});

try {
  await server.listen({ port, host });
  server.log.info(`ai-sheet server listening on http://${host}:${port}`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
