import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { installArtifactProcessErrorHandlers, registerArtifactServerErrorHandlers } from "@ai-app/shared/server-errors";
import { addArtifactBufferContentTypeParsers, readArtifactExportRequest, readArtifactUploadRequest, requestBytes, sendArtifactBinaryFile } from "@ai-app/shared/server-files";
import { ArtifactAppHttpRoutes } from "@ai-app/shared/server-routes";
import type { AiEditRequest, UpdateDeckSlideHtmlRequest } from "@ai-slide/shared";
import { registerSlideAgentToolRoutes } from "./agent-tools.js";
import { projectWorkspaceRoot } from "./local/paths.js";
import { ProjectRepository } from "./artifact/project-repository.js";
import { ProjectService } from "./artifact/project-service.js";
import { publishSlideReferenceExports } from "./artifact/reference-exports.js";
import { ensureTemplateDirs, listTemplates, safeTemplateAssetPath, templateAssetRoot } from "./templates/template-service.js";
import { getOfficeCliStatus, installOfficeCli } from "./toolchains/officecli.js";
import { registerTuttiCliRoutes } from "./tutti/cli-routes.js";
import { registerTuttiReferenceRoutes } from "./tutti/reference-routes.js";
import { EventHub } from "./ws/event-hub.js";

const webDist = process.env.AI_SLIDE_WEB_DIST ? resolve(process.env.AI_SLIDE_WEB_DIST) : resolve(process.cwd(), "../web/dist");
const port = Number(process.env.PORT ?? 8791);
const host = process.env.HOST ?? "127.0.0.1";

const server = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });
registerArtifactServerErrorHandlers(server, { appId: "ai-slide" });
installArtifactProcessErrorHandlers({ appId: "ai-slide", logger: server.log });
const events = new EventHub();
const repo = new ProjectRepository();
const projects = new ProjectService(repo, events);

addArtifactBufferContentTypeParsers(server, {
  imageBodyLimit: 30 * 1024 * 1024,
  octetStreamBodyLimit: 50 * 1024 * 1024,
});

await server.register(fastifyWebsocket);
await ensureTemplateDirs();
registerTuttiCliRoutes(server, projects);
registerTuttiReferenceRoutes(server, {
  ensureProjectReferences: (projectId) => {
    const project = repo.getProject(projectId);
    const artifact = project ? repo.getArtifact(project.activeArtifactId) : null;
    return project && artifact ? publishSlideReferenceExports(project, artifact) : [];
  },
});

if (existsSync(webDist)) {
  await server.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
    decorateReply: true,
  });
}

new ArtifactAppHttpRoutes({
  appId: "ai-slide",
  service: projects,
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

registerSlideAgentToolRoutes(server, projects);

server.post<{ Body: { path?: string; title?: string } }>("/api/dev/projects/import-pptx", async (request, reply) => {
  try {
    return await projects.importPptxProject(request.body ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import PPTX project";
    return reply.code(message.includes("not found") || message.includes("no such file") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Body: Buffer }>("/api/projects/import", async (request, reply) => {
  try {
    return await projects.importPptxProjectFile(readArtifactUploadRequest(request, {
      defaultFileName: "slides.pptx",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import PPTX project";
    return reply.code(400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/assets", async (request, reply) => {
  try {
    const asset = await projects.uploadProjectAsset(request.params.projectId, readArtifactUploadRequest(request, {
      defaultFileName: "asset",
    }));
    return reply.send(asset);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload asset";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/context-attachments", async (request, reply) => {
  try {
    const attachment = await projects.uploadContextAttachment(request.params.projectId, readArtifactUploadRequest(request, {
      defaultFileName: "attachment",
    }));
    return reply.send(attachment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload context attachment";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.get<{ Params: { projectId: string } }>("/api/projects/:projectId/files/slides.pptx", async (request, reply) => {
  try {
    const file = await projects.readPptxFile(request.params.projectId);
    return sendArtifactBinaryFile(reply, file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read PPTX file";
    return reply.code(message.includes("not found") || message.includes("no such file") ? 404 : 400).send({ error: message });
  }
});

server.get<{ Params: { projectId: string; slideId: string } }>("/api/projects/:projectId/deck/slides/:slideId", async (request, reply) => {
  try {
    return await projects.readDeckSlideHtml(request.params.projectId, request.params.slideId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read slide";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.patch<{ Params: { projectId: string; slideId: string }; Body: UpdateDeckSlideHtmlRequest }>(
  "/api/projects/:projectId/deck/slides/:slideId",
  async (request, reply) => {
    try {
      return await projects.writeDeckSlideHtml(request.params.projectId, request.params.slideId, request.body ?? { html: "" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save slide";
      return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
    }
  },
);

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/deck/assets", async (request, reply) => {
  try {
    const upload = readArtifactUploadRequest(request, { defaultFileName: "image" });
    return await projects.uploadDeckAsset(request.params.projectId, {
      ...upload,
      bytes: requestBytes(request.body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload asset";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: Buffer }>("/api/projects/:projectId/exports", async (request, reply) => {
  try {
    const exported = await projects.writeProjectExport(request.params.projectId, readArtifactExportRequest(request, {
      defaultFileName: "slides.pptx",
      defaultMimeType: "application/octet-stream",
    }));
    return reply.send(exported);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to write export";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string } }>("/api/projects/:projectId/exports/pptx", async (request, reply) => {
  try {
    const exportRequest = readArtifactExportRequest(request, {
      defaultFileName: "slides.pptx",
      defaultMimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    return await projects.exportPptxFile(request.params.projectId, {
      targetDirectory: exportRequest.targetDirectory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export PPTX file";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string } }>("/api/projects/:projectId/exports/html-deck", async (request, reply) => {
  try {
    const exportRequest = readArtifactExportRequest(request, {
      defaultFileName: "index.html",
      defaultMimeType: "text/html",
    });
    return await projects.exportDeckHtml(request.params.projectId, {
      targetDirectory: exportRequest.targetDirectory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export HTML deck";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string } }>("/api/projects/:projectId/exports/open", async (request, reply) => {
  try {
    return await projects.openProjectExportsDir(request.params.projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open exports folder";
    return reply.code(message.toLowerCase().includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.get<{ Params: { projectId: string; "*": string } }>("/local-assets/projects/:projectId/*", async (request, reply) => {
  const relativePath = request.params["*"];
  const root = projectWorkspaceRoot(request.params.projectId);
  return reply.sendFile(relativePath, root);
});

server.get<{ Params: { "*": string } }>("/api/templates/assets/*", async (request, reply) => {
  try {
    return reply.sendFile(safeTemplateAssetPath(request.params["*"]), templateAssetRoot());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid template asset path";
    return reply.code(400).send({ error: message });
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
      <body style="font-family: Lexend, ui-sans-serif, system-ui, sans-serif; padding: 32px">
        <h1>ai-slide server is running</h1>
        <p>Build the web app or run <code>pnpm dev:web</code> for the Vite client.</p>
      </body>
    </html>
  `);
});

try {
  projects.interruptActiveRuns();
  await server.listen({ port, host });
  server.log.info(`ai-slide server listening on http://${host}:${port}`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
