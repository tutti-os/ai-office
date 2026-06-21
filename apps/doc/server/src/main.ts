import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { ArtifactAppHttpRoutes } from "@ai-app/shared/server-routes";
import type { ApplyTemplateRequest } from "@ai-doc/shared";
import { DocumentRepository } from "./artifact/document-repository.js";
import { DocumentService } from "./artifact/document-service.js";
import { listTemplates } from "./templates/template-service.js";
import { getOfficeCliStatus, installOfficeCli } from "./toolchains/officecli.js";
import { EventHub } from "./ws/event-hub.js";

const webDist = process.env.AI_DOC_WEB_DIST
  ? resolve(process.env.AI_DOC_WEB_DIST)
  : resolve(process.cwd(), "../web/dist");
const port = Number(process.env.PORT ?? 8790);
const host = process.env.HOST ?? "127.0.0.1";

const server = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });
const events = new EventHub();
const repo = new DocumentRepository();
const documents = new DocumentService(repo, events);

server.addContentTypeParser(/^image\/.*/i, { parseAs: "buffer", bodyLimit: 30 * 1024 * 1024 }, (_request, body, done) => {
  done(null, body);
});
server.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 30 * 1024 * 1024 }, (_request, body, done) => {
  done(null, body);
});

await server.register(fastifyWebsocket);

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

new ArtifactAppHttpRoutes({
  appId: "ai-doc",
  service: documents,
  events,
  listTemplates,
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
    return reply
      .type(file.mimeType)
      .header("content-disposition", `inline; filename="${file.fileName}"`)
      .send(file.bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read DOCX file";
    return reply.code(message.includes("not found") || message.includes("no such file") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/assets", async (request, reply) => {
  try {
    const fileNameHeader = request.headers["x-file-name"];
    const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "application/octet-stream";
    const asset = await documents.uploadProjectAsset(request.params.projectId, {
      fileName: typeof fileNameHeader === "string" ? decodeURIComponent(fileNameHeader) : "image",
      mimeType: contentType,
      bytes: Buffer.isBuffer(request.body) ? request.body : Buffer.from([]),
    });
    return reply.send(asset);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload asset";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/exports", async (request, reply) => {
  try {
    const fileNameHeader = request.headers["x-file-name"];
    const mimeTypeHeader = request.headers["x-mime-type"];
    const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "application/octet-stream";
    const exported = await documents.writeProjectExport(request.params.projectId, {
      fileName: typeof fileNameHeader === "string" ? decodeURIComponent(fileNameHeader) : "export",
      mimeType: typeof mimeTypeHeader === "string" ? decodeURIComponent(mimeTypeHeader).split(";")[0]?.trim().toLowerCase() || contentType : contentType,
      bytes: Buffer.isBuffer(request.body) ? request.body : Buffer.from([]),
    });
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
    return reply
      .type(file.mimeType)
      .header("cache-control", "no-store")
      .send(file.bytes);
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
      <body style="font-family: system-ui; padding: 32px">
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
