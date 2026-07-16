import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentToolGateway, appToolMcpServerConfig, createProjectTitleTool, registerAgentToolGatewayRoutes, type AgentToolContext } from "@ai-app/shared/agent-tools";
import type { DocumentService } from "./artifact/document-service.js";
import type { RuntimeEditContext } from "./runtimes/runtime-provider.js";

export const docAgentToolGateway = new AgentToolGateway();

export function registerDocAgentToolRoutes(server: any, documents: DocumentService) {
  docToolHandlers.setProjectTitle = (projectId, title) => documents.setProjectTitle(projectId, title, "ai");
  registerAgentToolGatewayRoutes(server, docAgentToolGateway);
}

export function buildDocAppToolMcpServers(context: RuntimeEditContext) {
  const token = mintDocAppToolToken(context);
  return [
    appToolMcpServerConfig({
      gatewayBaseUrl: `${agentToolBaseUrl()}/api/agent-tools`,
      token,
      serverDir: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    }),
  ];
}

function mintDocAppToolToken(context: RuntimeEditContext) {
  return docAgentToolGateway.mint(
    {
      appId: "ai-doc",
      projectId: context.project.id,
      runId: context.run.id,
      conversationId: context.conversation?.conversationId,
      sessionId: context.conversation?.sessionId,
    },
    [
      createProjectTitleTool({
        setTitle: (projectId, title, toolContext) => docToolHandlers.setProjectTitle(projectId, title, toolContext),
      }),
    ],
  );
}

const docToolHandlers: {
  setProjectTitle: (projectId: string, title: string, context: AgentToolContext) => unknown;
} = {
  setProjectTitle: () => {
    throw new Error("Doc app tools are not registered");
  },
};

function agentToolBaseUrl() {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 8790);
  return process.env.AI_DOC_AGENT_TOOL_BASE_URL ?? `http://${host}:${port}`;
}
