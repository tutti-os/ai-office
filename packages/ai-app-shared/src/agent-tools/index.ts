import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type AgentToolInputSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type AgentToolContext = {
  appId: string;
  projectId: string;
  runId: string;
  conversationId?: string;
  sessionId?: string;
};

export type AgentTool<TResult = unknown> = {
  name: string;
  description: string;
  inputSchema: AgentToolInputSchema;
  handler: (input: unknown, context: AgentToolContext) => TResult | Promise<TResult>;
};

type GatewayTokenRecord = {
  context: AgentToolContext;
  expiresAt: number;
  tools: Map<string, AgentTool>;
};

export class AgentToolGateway {
  private readonly tokens = new Map<string, GatewayTokenRecord>();

  constructor(private readonly options: { tokenTtlMs?: number } = {}) {}

  mint(context: AgentToolContext, tools: AgentTool[]) {
    const token = randomUUID();
    this.tokens.set(token, {
      context,
      expiresAt: Date.now() + (this.options.tokenTtlMs ?? 60 * 60_000),
      tools: new Map(tools.map((tool) => [tool.name, tool])),
    });
    return token;
  }

  revoke(token: string | null | undefined) {
    if (token) this.tokens.delete(token);
  }

  list(token: string) {
    const record = this.requireToken(token);
    return Array.from(record.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async call(token: string, name: string, input: unknown) {
    const record = this.requireToken(token);
    const tool = record.tools.get(name);
    if (!tool) throw new Error(`Unknown app tool: ${name}`);
    return tool.handler(input, record.context);
  }

  private requireToken(token: string) {
    const record = this.tokens.get(token);
    if (!record) throw new Error("Invalid app tool token");
    if (record.expiresAt <= Date.now()) {
      this.tokens.delete(token);
      throw new Error("Expired app tool token");
    }
    return record;
  }
}

export function registerAgentToolGatewayRoutes(server: any, gateway: AgentToolGateway) {
  server.get("/api/agent-tools/list", async (request: any, reply: any) => {
    try {
      return { tools: gateway.list(bearerToken(request)) };
    } catch (error) {
      return reply.code(401).send({ error: errorMessage(error) });
    }
  });

  server.post("/api/agent-tools/call", async (request: any, reply: any) => {
    try {
      const body = request.body ?? {};
      return {
        result: await gateway.call(bearerToken(request), String(body.name ?? ""), body.input ?? {}),
      };
    } catch (error) {
      return reply.code(errorMessage(error).includes("Unknown app tool") ? 404 : 400).send({ error: errorMessage(error) });
    }
  });
}

export function createProjectTitleTool(input: { setTitle: (projectId: string, title: string, context: AgentToolContext) => unknown | Promise<unknown> }): AgentTool {
  return {
    name: "set_project_title",
    description:
      "Set the current app project's human-readable display title. This does not rename on-disk files or directories. The current project is inferred from the active run; do not pass a project id.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The new project title.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: async (raw, context) => {
      const inputRecord = recordInput(raw);
      const title = typeof inputRecord.title === "string" ? inputRecord.title.trim() : "";
      if (!title) throw new Error("title is required");
      return input.setTitle(context.projectId, title, context);
    },
  };
}

export function appToolMcpServerConfig(input: {
  gatewayBaseUrl: string;
  token: string;
  name?: string;
  mcpEntryPath?: string;
  serverDir?: string;
  requireSandboxEntrypoint?: boolean;
}) {
  const launch = resolveAppToolMcpLaunch(input);
  return {
    name: input.name ?? "app_tools",
    type: "stdio" as const,
    command: launch.command,
    args: launch.args,
    startupTimeoutMs: 2 * 60_000,
    toolTimeoutMs: 30 * 60_000,
    env: {
      AI_APP_TOOL_GATEWAY_URL: input.gatewayBaseUrl,
      AI_APP_TOOL_TOKEN: input.token,
    },
  };
}

function resolveAppToolMcpLaunch(input: {
  mcpEntryPath?: string;
  serverDir?: string;
  requireSandboxEntrypoint?: boolean;
}) {
  if (input.mcpEntryPath) {
    if (input.requireSandboxEntrypoint && !existsSync(input.mcpEntryPath)) {
      throw new Error(`Managed app tools MCP entrypoint does not exist: ${input.mcpEntryPath}`);
    }
    return {
      command: input.requireSandboxEntrypoint ? "node" : process.execPath,
      args: [input.mcpEntryPath],
    };
  }

  const serverDir = input.serverDir ?? process.cwd();
  const bundledEntries = [
    join(serverDir, "agent-tools-mcp.js"),
    join(serverDir, "server", "agent-tools-mcp.js"),
  ];
  const bundledEntry = bundledEntries.find((entry) => existsSync(entry));
  if (bundledEntry) {
    return {
      command: input.requireSandboxEntrypoint ? "node" : process.execPath,
      args: [bundledEntry],
    };
  }

  if (input.requireSandboxEntrypoint) {
    throw new Error(
      `Managed app tools require a packaged MCP entrypoint. Expected one of: ${bundledEntries.join(", ")}`,
    );
  }

  const entryPath = join(serverDir, "src", "agent-tools-mcp.ts");
  const localTsx = join(serverDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  if (existsSync(localTsx)) return { command: localTsx, args: [entryPath] };

  return {
    command: "pnpm",
    args: ["--dir", serverDir, "exec", "tsx", "src/agent-tools-mcp.ts"],
  };
}

function bearerToken(request: any) {
  const authorization = String(request.headers?.authorization ?? "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error("Missing app tool token");
  return match[1];
}

function recordInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "App tool request failed";
}
