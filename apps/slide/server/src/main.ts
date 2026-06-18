import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import type { AiEditRequest, CreateProjectRequest, UpdateDeckSlideHtmlRequest, UpdateProjectRequest, WsClientMessage, WsServerMessage } from "@ai-slide/shared";
import { projectWorkspaceRoot } from "./local/paths.js";
import { AgentToolGateway } from "./artifact/agent-tool-gateway.js";
import { AgentToolTokenStore, AgentToolUnauthorizedError } from "./artifact/agent-tool-tokens.js";
import { ProjectRepository } from "./artifact/project-repository.js";
import { ProjectService } from "./artifact/project-service.js";
import { ensureTemplateDirs, listTemplates, safeTemplateAssetPath, templateAssetRoot } from "./templates/template-service.js";
import { EventHub } from "./ws/event-hub.js";

const webDist = process.env.AI_SLIDE_WEB_DIST ? resolve(process.env.AI_SLIDE_WEB_DIST) : resolve(process.cwd(), "../web/dist");
const port = Number(process.env.PORT ?? 8791);
const host = process.env.HOST ?? "127.0.0.1";

const server = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });
const events = new EventHub();
const repo = new ProjectRepository();
const toolTokens = new AgentToolTokenStore();
const projects = new ProjectService(repo, events, toolTokens);
const agentTools = new AgentToolGateway(repo, events, toolTokens);

await server.register(fastifyWebsocket);
await ensureTemplateDirs();

if (existsSync(webDist)) {
  await server.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
    decorateReply: true,
  });
}

server.get("/api/health", async () => ({ ok: true, app: "ai-slide" }));

server.get("/api/bootstrap", async () => projects.bootstrap());

server.get("/api/templates", async () => ({ templates: listTemplates() }));

server.get("/api/local-agent/providers", async () => projects.listLocalAgentProviders());

server.get("/api/projects", async () => projects.listProjects());

server.post<{ Body: CreateProjectRequest }>("/api/projects", async (request, reply) => {
  try {
    return projects.createProject(request.body ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create project";
    return reply.code(400).send({ error: message });
  }
});

server.post<{ Body: { path?: string; title?: string } }>("/api/dev/projects/import-pptx", async (request, reply) => {
  try {
    return await projects.importPptxProject(request.body ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import PPTX project";
    return reply.code(message.includes("not found") || message.includes("no such file") ? 404 : 400).send({ error: message });
  }
});

server.delete("/api/projects", async () => projects.clearProjectHistory());

server.get<{ Params: { projectId: string } }>("/api/projects/:projectId", async (request, reply) => {
  try {
    return await projects.getProject(request.params.projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project not found";
    return reply.code(message.includes("Template HTML source is missing") ? 400 : 404).send({ error: message });
  }
});

server.patch<{ Params: { projectId: string }; Body: UpdateProjectRequest }>("/api/projects/:projectId", async (request, reply) => {
  try {
    const result = projects.updateProject(request.params.projectId, request.body ?? {});
    if (!result) return reply.code(404).send({ error: "Project not found" });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update project";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.get<{ Params: { projectId: string } }>("/api/projects/:projectId/files/slides.pptx", async (request, reply) => {
  try {
    const file = await projects.readPptxFile(request.params.projectId);
    return reply
      .type(file.mimeType)
      .header("content-disposition", `inline; filename="${file.fileName}"`)
      .send(file.bytes);
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

server.get<{ Params: { projectId: string } }>("/api/projects/:projectId/runs", async (request, reply) => {
  try {
    return projects.listProjectRuns(request.params.projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list runs";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { projectId: string }; Body: AiEditRequest }>("/api/projects/:projectId/ai-edit", async (request, reply) => {
  try {
    return projects.startAiEdit(request.params.projectId, request.body ?? { userPrompt: "", mode: "write" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start AI edit";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
  }
});

server.post<{ Params: { runId: string } }>("/api/runs/:runId/cancel", async (request, reply) => {
  const result = await projects.cancelRun(request.params.runId);
  if (!result) return reply.code(404).send({ error: "Run not found" });
  return result;
});

server.get<{ Params: { projectId: string } }>("/api/agent-tools/projects/:projectId/project", async (request, reply) => {
  try {
    return await agentTools.getProject(request.params.projectId, readAgentToolCredential(request));
  } catch (error) {
    return sendAgentToolError(reply, error, "Unable to read project");
  }
});

server.get<{ Params: { projectId: string } }>("/api/agent-tools/projects/:projectId/deck/manifest", async (request, reply) => {
  try {
    return await agentTools.getDeckManifest(request.params.projectId, readAgentToolCredential(request));
  } catch (error) {
    return sendAgentToolError(reply, error, "Unable to read deck manifest");
  }
});

server.get<{ Params: { projectId: string; slideId: string } }>("/api/agent-tools/projects/:projectId/deck/slides/:slideId", async (request, reply) => {
  try {
    return await agentTools.getDeckSlide(request.params.projectId, request.params.slideId, readAgentToolCredential(request));
  } catch (error) {
    return sendAgentToolError(reply, error, "Unable to read slide");
  }
});

server.post<{ Params: { projectId: string; slideId: string }; Body: { html: string } }>(
  "/api/agent-tools/projects/:projectId/deck/slides/:slideId",
  async (request, reply) => {
    try {
      return await agentTools.saveDeckSlide(request.params.projectId, request.params.slideId, request.body, readAgentToolCredential(request));
    } catch (error) {
      return sendAgentToolError(reply, error, "Unable to save slide");
    }
  },
);

server.get<{ Params: { projectId: string } }>("/api/agent-tools/projects/:projectId/pptx/manifest", async (request, reply) => {
  try {
    return await agentTools.getPptxManifest(request.params.projectId, readAgentToolCredential(request));
  } catch (error) {
    return sendAgentToolError(reply, error, "Unable to read PPTX manifest");
  }
});

server.get("/api/ws", { websocket: true }, (socket) => {
  const dispose = events.addClient(socket);
  const hello: WsServerMessage = { type: "hello", lastSeq: events.lastSeq() };
  socket.send(JSON.stringify(hello));

  socket.on("message", (raw: Buffer) => {
    let message: WsClientMessage | null = null;
    try {
      message = JSON.parse(raw.toString()) as WsClientMessage;
    } catch {
      return;
    }
    if (message.type === "hello" && typeof message.lastSeq === "number") {
      const replay = events.replaySince(message.lastSeq);
      const response: WsServerMessage = {
        type: "replay",
        events: replay,
        lastSeq: replay.at(-1)?.seq ?? events.lastSeq(),
      };
      socket.send(JSON.stringify(response));
    }
  });

  socket.on("close", dispose);
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
      <body style="font-family: system-ui; padding: 32px">
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

function readAgentToolCredential(request: { headers: Record<string, string | string[] | undefined>; query?: unknown }) {
  const header = request.headers["x-ai-slide-tool-token"];
  const headerToken = Array.isArray(header) ? header[0] : header;
  const query = request.query as { toolToken?: string } | undefined;
  return { token: headerToken ?? query?.toolToken ?? null };
}

function sendAgentToolError(reply: { code(statusCode: number): { send(payload: unknown): unknown } }, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (error instanceof AgentToolUnauthorizedError) return reply.code(401).send({ error: message });
  return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
}
