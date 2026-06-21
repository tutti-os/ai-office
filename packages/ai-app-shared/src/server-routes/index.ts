export type ArtifactAppRouteService = {
  bootstrap(): unknown | Promise<unknown>;
  listLocalAgentProviders(): unknown | Promise<unknown>;
  listProjects(): unknown | Promise<unknown>;
  createProject(input: unknown): unknown | Promise<unknown>;
  clearProjectHistory(): unknown | Promise<unknown>;
  deleteProject?(projectId: string): unknown | Promise<unknown>;
  getProject(projectId: string): unknown | Promise<unknown>;
  updateProject(projectId: string, input: unknown): unknown | Promise<unknown>;
  listProjectRuns(projectId: string): unknown | Promise<unknown>;
  startAiEdit(projectId: string, input: unknown): unknown | Promise<unknown>;
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

export type ArtifactAppHttpRoutesInput<TStatus> = {
  appId: string;
  service: ArtifactAppRouteService;
  events: ArtifactAppEventHub;
  listTemplates: () => unknown[] | Promise<unknown[]>;
  toolchain: ArtifactAppToolchainRoutes<TStatus>;
  requireAiPrompt?: boolean;
};

export class ArtifactAppHttpRoutes<TStatus> {
  constructor(private readonly input: ArtifactAppHttpRoutesInput<TStatus>) {}

  register(server: any) {
    this.registerAppRoutes(server);
    this.registerToolchainRoutes(server);
    this.registerProjectRoutes(server);
    this.registerWsRoute(server);
  }

  private registerAppRoutes(server: any) {
    server.get("/api/health", async () => ({ ok: true, app: this.input.appId }));
    server.get("/api/bootstrap", async () => this.input.service.bootstrap());
    server.get("/api/templates", async () => ({ templates: await this.input.listTemplates() }));
    server.get("/api/local-agent/providers", async () => this.input.service.listLocalAgentProviders());
  }

  private registerToolchainRoutes(server: any) {
    server.get("/api/toolchains/officecli", async () => {
      try {
        return { [this.input.toolchain.responseKey]: await this.input.toolchain.getStatus() };
      } catch (error) {
        return { [this.input.toolchain.responseKey]: this.input.toolchain.errorStatus(error) };
      }
    });

    server.post("/api/toolchains/officecli/install", async (_request: unknown, reply: any) => {
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

  private registerProjectRoutes(server: any) {
    server.get("/api/projects", async () => this.input.service.listProjects());
    server.post("/api/projects", async (request: any, reply: any) => {
      try {
        return await this.input.service.createProject(request.body ?? {});
      } catch (error) {
        return reply.code(400).send({ error: errorMessage(error, "Unable to create project") });
      }
    });
    server.delete("/api/projects", async () => this.input.service.clearProjectHistory());
    if (typeof this.input.service.deleteProject === "function") {
      server.delete("/api/projects/:projectId", async (request: any, reply: any) => {
        try {
          const result = await this.input.service.deleteProject?.(request.params.projectId);
          if (!result) return reply.code(404).send({ error: "Project not found" });
          return result;
        } catch (error) {
          return reply.code(notFoundOrBadRequest(error)).send({ error: errorMessage(error, "Unable to delete project") });
        }
      });
    }
    server.get("/api/projects/:projectId/runs", async (request: any, reply: any) => {
      try {
        return await this.input.service.listProjectRuns(request.params.projectId);
      } catch (error) {
        return reply.code(notFoundOrBadRequest(error)).send({ error: errorMessage(error, "Project not found") });
      }
    });
    server.get("/api/projects/:projectId", async (request: any, reply: any) => {
      try {
        return await this.input.service.getProject(request.params.projectId);
      } catch (error) {
        return reply.code(notFoundOrBadRequest(error)).send({ error: errorMessage(error, "Project not found") });
      }
    });
    server.patch("/api/projects/:projectId", async (request: any, reply: any) => {
      try {
        const result = await this.input.service.updateProject(request.params.projectId, request.body ?? {});
        if (!result) return reply.code(404).send({ error: "Project not found" });
        return result;
      } catch (error) {
        return reply.code(notFoundOrBadRequest(error)).send({ error: errorMessage(error, "Unable to update project") });
      }
    });
    server.post("/api/projects/:projectId/ai-edit", async (request: any, reply: any) => {
      try {
        if (this.input.requireAiPrompt && !request.body?.userPrompt?.trim()) return reply.code(400).send({ error: "userPrompt is required" });
        return await this.input.service.startAiEdit(request.params.projectId, request.body ?? { userPrompt: "", mode: "write" });
      } catch (error) {
        return reply.code(notFoundOrBadRequest(error)).send({ error: errorMessage(error, "Unable to start AI edit") });
      }
    });
    server.post("/api/runs/:runId/cancel", async (request: any, reply: any) => {
      const result = await this.input.service.cancelRun(request.params.runId);
      if (!result) return reply.code(404).send({ error: "Run not found" });
      return result;
    });
  }

  private registerWsRoute(server: any) {
    server.get("/api/ws", { websocket: true }, (socket: any) => {
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

function notFoundOrBadRequest(error: unknown) {
  const message = errorMessage(error, "");
  if (message.includes("not found") || message.includes("no such file")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
