import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import type {
  AiEditRequest,
  ApplyTemplateRequest,
  CreateProjectRequest,
  UpdateProjectRequest,
  WsClientMessage,
  WsServerMessage,
} from "@ai-doc/shared";
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

await server.register(fastifyWebsocket);

if (existsSync(webDist)) {
  await server.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
  });
}

server.get("/api/health", async () => ({ ok: true, app: "ai-doc" }));

server.get("/api/dev/fixtures/genspark-study-plan", async (request, reply) => {
  const fixturePath = process.env.AI_DOC_GENSPARK_TEST_HTML ?? "/Users/niuma/code/genspark/doc/test.html";
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

server.get("/api/bootstrap", async () => documents.bootstrap());

server.get("/api/templates", async () => ({ templates: listTemplates() }));

server.get("/api/local-agent/providers", async () => documents.listLocalAgentProviders());

server.get("/api/toolchains/officecli", async () => {
  try {
    return { officecli: await getOfficeCliStatus() };
  } catch (error) {
    return {
      officecli: {
        available: false,
        source: "missing",
        canInstall: false,
        installing: false,
        reason: error instanceof Error ? error.message : "Unable to check OfficeCLI status.",
      },
    };
  }
});

server.post("/api/toolchains/officecli/install", async (_request, reply) => {
  const officecli = await installOfficeCli();
  if (!officecli.available) return reply.code(400).send({ officecli, error: officecli.reason ?? "Unable to install OfficeCLI" });
  return { officecli };
});

server.get("/api/projects", async () => documents.listProjects());

server.post<{ Body: CreateProjectRequest }>("/api/projects", async (request, reply) => {
  try {
    return await documents.createProject(request.body ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create project";
    return reply.code(400).send({ error: message });
  }
});

server.delete("/api/projects", async () => documents.clearProjectHistory());

server.get<{ Params: { projectId: string } }>("/api/projects/:projectId/runs", async (request, reply) => {
  try {
    return documents.listProjectRuns(request.params.projectId);
  } catch {
    return reply.code(404).send({ error: "Project not found" });
  }
});

server.get<{ Params: { projectId: string } }>("/api/projects/:projectId", async (request, reply) => {
  try {
    return documents.getProject(request.params.projectId);
  } catch {
    return reply.code(404).send({ error: "Project not found" });
  }
});

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

server.patch<{ Params: { projectId: string }; Body: UpdateProjectRequest }>("/api/projects/:projectId", async (request, reply) => {
  const result = documents.updateProject(request.params.projectId, request.body ?? {});
  if (!result) return reply.code(404).send({ error: "Project not found" });
  return result;
});

server.post<{ Params: { projectId: string }; Body: AiEditRequest }>("/api/projects/:projectId/ai-edit", async (request, reply) => {
  try {
    if (!request.body?.userPrompt?.trim()) return reply.code(400).send({ error: "userPrompt is required" });
    return await documents.startAiEdit(request.params.projectId, request.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start AI edit";
    return reply.code(message.includes("not found") ? 404 : 400).send({ error: message });
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

server.post<{ Params: { runId: string } }>("/api/runs/:runId/cancel", async (request, reply) => {
  const result = await documents.cancelRun(request.params.runId);
  if (!result) return reply.code(404).send({ error: "Run not found" });
  return result;
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
