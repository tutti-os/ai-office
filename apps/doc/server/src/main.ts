import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { installArtifactProcessErrorHandlers, registerArtifactServerErrorHandlers } from "@ai-app/shared/server-errors";
import { addArtifactBufferContentTypeParsers, readArtifactExportRequest, readArtifactUploadRequest, sendArtifactBinaryFile } from "@ai-app/shared/server-files";
import { ArtifactAppHttpRoutes } from "@ai-app/shared/server-routes";
import type { AiEditRequest, ApplyTemplateRequest } from "@ai-doc/shared";
import { registerDocAgentToolRoutes } from "./agent-tools.js";
import { DocumentRepository } from "./artifact/document-repository.js";
import { DocumentService } from "./artifact/document-service.js";
import { publishDocumentReferenceExports } from "./artifact/reference-exports.js";
import { getTemplateScreenshotFile, listTemplates } from "./templates/template-service.js";
import { getOfficeCliStatus, installOfficeCli } from "./toolchains/officecli.js";
import { registerTuttiCliRoutes } from "./tutti/cli-routes.js";
import { registerTuttiReferenceRoutes } from "./tutti/reference-routes.js";
import { EventHub } from "./ws/event-hub.js";

const webDist = process.env.AI_DOC_WEB_DIST
  ? resolve(process.env.AI_DOC_WEB_DIST)
  : resolve(process.cwd(), "../web/dist");
const port = Number(process.env.PORT ?? 8790);
const host = process.env.HOST ?? "127.0.0.1";

const server = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });
registerArtifactServerErrorHandlers(server, { appId: "ai-doc" });
installArtifactProcessErrorHandlers({ appId: "ai-doc", logger: server.log });
const events = new EventHub();
const repo = new DocumentRepository();
const documents = new DocumentService(repo, events);

addArtifactBufferContentTypeParsers(server, {
  imageBodyLimit: 30 * 1024 * 1024,
  octetStreamBodyLimit: 30 * 1024 * 1024,
});

await server.register(fastifyWebsocket);
registerDocAgentToolRoutes(server, documents);

registerTuttiCliRoutes(server, documents);
registerTuttiReferenceRoutes(server, {
  ensureProjectReferences: (projectId) => {
    const project = repo.getProject(projectId);
    if (project) publishDocumentReferenceExports(project);
  },
});

if (existsSync(webDist)) {
  await server.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
  });
}

server.get("/api/dev/fixtures/tutti-study-plan", async (request, reply) => {
  const fixturePath = process.env.AI_DOC_TUTTI_TEST_HTML ?? "/Users/niuma/code/tutti/doc/test.html";
  try {
    const html = await readFile(fixturePath, "utf8");
    return {
      path: fixturePath,
      title: "Study Plan",
      type: "html",
      html,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read fixture";
    return reply.code(404).send({ error: message, path: fixturePath });
  }
});

server.get<{ Params: { templateId: string } }>("/api/templates/:templateId/screenshot", async (request, reply) => {
  const screenshot = getTemplateScreenshotFile(request.params.templateId);
  if (!screenshot) return reply.code(404).send({ error: "Template screenshot not found" });
  const image = await readFile(screenshot.filePath);
  return reply.type(mimeTypeForTemplateAsset(screenshot.fileName)).send(image);
});

server.post<{ Body: Buffer }>("/api/projects/import", async (request, reply) => {
  try {
    return await documents.importProjectFile(readArtifactUploadRequest(request, {
      defaultFileName: "imported-doc",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import project";
    return reply.code(message.includes("OfficeCLI") ? 503 : 400).send({ error: message });
  }
});

function mimeTypeForTemplateAsset(fileName: string) {
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "image/jpeg";
  if (fileName.endsWith(".webp")) return "image/webp";
  if (fileName.endsWith(".svg")) return "image/svg+xml";
  if (fileName.endsWith(".gif")) return "image/gif";
  return "image/png";
}

new ArtifactAppHttpRoutes({
  appId: "ai-doc",
  service: documents,
  events,
  listTemplates,
  defaultAiEditInput: {
    htmlContent: "",
    userPrompt: "",
    mode: "write",
  } satisfies AiEditRequest,
  requireAiPrompt: true,
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

server.get<{ Params: { projectId: string } }>("/api/projects/:projectId/files/document.docx", async (request, reply) => {
  try {
    const file = await documents.getDocxFile(request.params.projectId);
    return sendArtifactBinaryFile(reply, file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read DOCX file";
    return reply.code(message.includes("not found") || message.includes("no such file") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/assets", async (request, reply) => {
  try {
    const asset = await documents.uploadProjectAsset(request.params.projectId, readArtifactUploadRequest(request, {
      defaultFileName: "image",
    }));
    return reply.send(asset);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload asset";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/context-attachments", async (request, reply) => {
  try {
    const attachment = await documents.uploadContextAttachment(request.params.projectId, readArtifactUploadRequest(request, {
      defaultFileName: "attachment",
    }));
    return reply.send(attachment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload context attachment";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/exports", async (request, reply) => {
  try {
    const exported = await documents.writeProjectExport(request.params.projectId, readArtifactExportRequest(request, {
      defaultFileName: "export",
      defaultMimeType: "application/octet-stream",
    }));
    return reply.send(exported);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to write export";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string } }>("/api/projects/:projectId/exports/open", async (request, reply) => {
  try {
    return await documents.openProjectExportsDir(request.params.projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open exports folder";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.get<{ Params: { projectId: string; fileName: string } }>("/api/projects/:projectId/assets/:fileName", async (request, reply) => {
  try {
    const file = await documents.getProjectAsset(request.params.projectId, decodeURIComponent(request.params.fileName));
    return reply.type(file.mimeType).header("cache-control", "no-store").send(file.bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read asset";
    return reply.code(message.includes("not found") || message.includes("no such file") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: ApplyTemplateRequest }>(
  "/api/projects/:projectId/apply-template",
  async (request, reply) => {
    try {
      return await documents.applyTemplate(request.params.projectId, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to apply template";
      return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
    }
  },
);

server.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith("/api/") || request.raw.url?.startsWith("/local-assets/")) {
    return reply.code(404).send({ error: "Not found" });
  }
  const indexPath = join(webDist, "index.html");
  if (existsSync(indexPath)) return reply.sendFile("index.html");
  return reply.type("text/html").send(`
    <html>
      <body style="font-family: Lexend, ui-sans-serif, system-ui, sans-serif; padding: 32px">
        <h1>ai-doc server is running</h1>
        <p>Build the web app or run <code>pnpm dev:web</code> for the Vite client.</p>
      </body>
    </html>
  `);
});

try {
  documents.bootstrap();
  documents.interruptActiveRuns();
  await server.listen({ port, host });
  server.log.info(`ai-doc server listening on http://${host}:${port}`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
