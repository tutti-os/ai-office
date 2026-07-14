import { artifactErrorResponse, notFoundOrBadRequest } from "@ai-app/shared/server-errors";

export type ArtifactAppRouteService<
  TCreateProjectInput = unknown,
  TUpdateProjectInput = unknown,
  TAiEditInput = unknown,
> = {
  bootstrap(): unknown | Promise<unknown>;
  listLocalAgentTargets(headers?: Record<string, string | string[] | undefined>): unknown | Promise<unknown>;
  listProjects(): unknown | Promise<unknown>;
  createProject(input: TCreateProjectInput): unknown | Promise<unknown>;
  clearProjectHistory(): unknown | Promise<unknown>;
  deleteProject?(projectId: string): unknown | Promise<unknown>;
  getProject(projectId: string): unknown | Promise<unknown>;
  updateProject(projectId: string, input: TUpdateProjectInput): unknown | Promise<unknown>;
  listProjectRuns(projectId: string): unknown | Promise<unknown>;
  startAiEdit(projectId: string, input: TAiEditInput, headers?: Record<string, string | string[] | undefined>): unknown | Promise<unknown>;
  cancelRun(runId: string): unknown | Promise<unknown>;
};

export type ArtifactAppEventHub = {
  addClient(socket: unknown): () => void;
  lastSeq(): number;
  replaySince(seq: number): unknown[];
};

export type ArtifactAppToolchainRoutes<TStatus> = {
  getStatus(): Promise<TStatus>;
  install(): Promise<TStatus>;
  errorStatus(error: unknown): TStatus;
  isAvailable(status: TStatus): boolean;
  errorMessage(status: TStatus): string;
  responseKey: string;
};

export type ArtifactAppHttpRoutesInput<
  TStatus,
  TCreateProjectInput = unknown,
  TUpdateProjectInput = unknown,
  TAiEditInput = unknown,
  TTemplate = unknown,
> = {
  appId: string;
  service: ArtifactAppRouteService<TCreateProjectInput, TUpdateProjectInput, TAiEditInput>;
  events: ArtifactAppEventHub;
  listTemplates: () => TTemplate[] | Promise<TTemplate[]>;
  toolchain: ArtifactAppToolchainRoutes<TStatus>;
  defaultAiEditInput: TAiEditInput;
  requireAiPrompt?: boolean;
};

type ArtifactRouteReply = {
  code(statusCode: number): ArtifactRouteReply;
  send(payload: unknown): unknown;
};

type ArtifactRouteRequest<TParams = Record<string, string>, TBody = unknown> = {
  params: TParams;
  body?: TBody;
  headers?: Record<string, string | string[] | undefined>;
};

type ArtifactWebSocket = {
  send(payload: string): void;
  on(event: "message", handler: (raw: Buffer) => void): void;
  on(event: "close", handler: () => void): void;
};

type ArtifactRouteServer = {
  get(path: string, handler: unknown): void;
  get(path: string, options: unknown, handler: unknown): void;
  post(path: string, handler: unknown): void;
  patch(path: string, handler: unknown): void;
  delete(path: string, handler: unknown): void;
};

export class ArtifactAppHttpRoutes<
  TStatus,
  TCreateProjectInput = unknown,
  TUpdateProjectInput = unknown,
  TAiEditInput = unknown,
  TTemplate = unknown,
> {
  constructor(private readonly input: ArtifactAppHttpRoutesInput<TStatus, TCreateProjectInput, TUpdateProjectInput, TAiEditInput, TTemplate>) {}

  register(server: ArtifactRouteServer) {
    this.registerAppRoutes(server);
    this.registerToolchainRoutes(server);
    this.registerProjectRoutes(server);
    this.registerWsRoute(server);
  }

  private registerAppRoutes(server: ArtifactRouteServer) {
    server.get("/api/health", async () => ({ ok: true, app: this.input.appId }));
    server.get("/api/bootstrap", async () => this.input.service.bootstrap());
    server.get("/api/templates", async () => ({ templates: await this.input.listTemplates() }));
    server.get("/api/local-agent/targets", async (request: ArtifactRouteRequest) => this.input.service.listLocalAgentTargets(request.headers));
  }

  private registerToolchainRoutes(server: ArtifactRouteServer) {
    server.get("/api/toolchains/officecli", async () => {
      try {
        return { [this.input.toolchain.responseKey]: await this.input.toolchain.getStatus() };
      } catch (error) {
        return { [this.input.toolchain.responseKey]: this.input.toolchain.errorStatus(error) };
      }
    });

    server.post("/api/toolchains/officecli/install", async (_request: unknown, reply: ArtifactRouteReply) => {
      const status = await this.input.toolchain.install();
      if (!this.input.toolchain.isAvailable(status)) {
        return reply.code(400).send({
          [this.input.toolchain.responseKey]: status,
          error: this.input.toolchain.errorMessage(status),
        });
      }
      return { [this.input.toolchain.responseKey]: status };
    });
  }

  private registerProjectRoutes(server: ArtifactRouteServer) {
    server.get("/api/projects", async () => this.input.service.listProjects());
    server.post("/api/projects", async (request: ArtifactRouteRequest<Record<string, string>, TCreateProjectInput>, reply: ArtifactRouteReply) => {
      try {
        return await this.input.service.createProject(request.body ?? ({} as TCreateProjectInput));
      } catch (error) {
        return sendError(reply, error, "Unable to create project", 400);
      }
    });
    server.delete("/api/projects", async () => this.input.service.clearProjectHistory());
    if (typeof this.input.service.deleteProject === "function") {
      server.delete("/api/projects/:projectId", async (request: ArtifactRouteRequest<{ projectId: string }>, reply: ArtifactRouteReply) => {
        try {
          const result = await this.input.service.deleteProject?.(request.params.projectId);
          if (!result) return reply.code(404).send({ error: "Project not found" });
          return result;
        } catch (error) {
          return sendError(reply, error, "Unable to delete project", notFoundOrBadRequest(error));
        }
      });
    }
    server.get("/api/projects/:projectId/runs", async (request: ArtifactRouteRequest<{ projectId: string }>, reply: ArtifactRouteReply) => {
      try {
        return await this.input.service.listProjectRuns(request.params.projectId);
      } catch (error) {
        return sendError(reply, error, "Project not found", notFoundOrBadRequest(error));
      }
    });
    server.get("/api/projects/:projectId", async (request: ArtifactRouteRequest<{ projectId: string }>, reply: ArtifactRouteReply) => {
      try {
        return await this.input.service.getProject(request.params.projectId);
      } catch (error) {
        return sendError(reply, error, "Project not found", notFoundOrBadRequest(error));
      }
    });
    server.patch("/api/projects/:projectId", async (request: ArtifactRouteRequest<{ projectId: string }, TUpdateProjectInput>, reply: ArtifactRouteReply) => {
      try {
        const result = await this.input.service.updateProject(request.params.projectId, request.body ?? ({} as TUpdateProjectInput));
        if (!result) return reply.code(404).send({ error: "Project not found" });
        return result;
      } catch (error) {
        return sendError(reply, error, "Unable to update project", notFoundOrBadRequest(error));
      }
    });
    server.post("/api/projects/:projectId/ai-edit", async (request: ArtifactRouteRequest<{ projectId: string }, TAiEditInput & { userPrompt?: string }>, reply: ArtifactRouteReply) => {
      try {
        if (this.input.requireAiPrompt && !request.body?.userPrompt?.trim()) return reply.code(400).send({ error: "userPrompt is required" });
        return await this.input.service.startAiEdit(request.params.projectId, request.body ?? this.input.defaultAiEditInput, request.headers);
      } catch (error) {
        return sendError(reply, error, "Unable to start AI edit", notFoundOrBadRequest(error));
      }
    });
    server.post("/api/runs/:runId/cancel", async (request: ArtifactRouteRequest<{ runId: string }>, reply: ArtifactRouteReply) => {
      const result = await this.input.service.cancelRun(request.params.runId);
      if (!result) return reply.code(404).send({ error: "Run not found" });
      return result;
    });
  }

  private registerWsRoute(server: ArtifactRouteServer) {
    server.get("/api/ws", { websocket: true }, (socket: ArtifactWebSocket) => {
      const dispose = this.input.events.addClient(socket);
      socket.send(JSON.stringify({ type: "hello", lastSeq: this.input.events.lastSeq() }));

      socket.on("message", (raw: Buffer) => {
        let message: { type?: string; lastSeq?: number } | null = null;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (message?.type === "hello" && typeof message.lastSeq === "number") {
          const replay = this.input.events.replaySince(message.lastSeq);
          socket.send(JSON.stringify({
            type: "replay",
            events: replay,
            lastSeq: (replay.at(-1) as { seq?: number } | undefined)?.seq ?? this.input.events.lastSeq(),
          }));
        }
      });

      socket.on("close", dispose);
    });
  }
}

function sendError(reply: ArtifactRouteReply, error: unknown, fallback: string, statusCode: number) {
  const response = artifactErrorResponse(error, fallback);
  return reply.code(response.statusCode === 500 ? statusCode : response.statusCode).send(response.body);
}
