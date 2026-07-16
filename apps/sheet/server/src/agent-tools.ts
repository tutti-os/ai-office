import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentToolGateway,
  appToolMcpServerConfig,
  createProjectTitleTool,
  registerAgentToolGatewayRoutes,
  type AgentToolContext,
} from "@ai-app/shared/agent-tools";
import type { SheetService } from "./artifact/sheet-service.js";
import type { RuntimeEditContext } from "./runtimes/runtime-provider.js";

export const sheetAgentToolGateway = new AgentToolGateway();

export function registerSheetAgentToolRoutes(server: any, sheets: SheetService) {
  sheetToolHandlers.setProjectTitle = (projectId, title) => sheets.setProjectTitle(projectId, title, "ai");
  registerAgentToolGatewayRoutes(server, sheetAgentToolGateway);
}

export function buildSheetAppToolMcpServers(context: RuntimeEditContext) {
  const token = mintSheetAppToolToken(context);
  return [
    appToolMcpServerConfig({
      gatewayBaseUrl: `${agentToolBaseUrl()}/api/agent-tools`,
      token,
      serverDir: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    }),
  ];
}

function mintSheetAppToolToken(context: RuntimeEditContext) {
  return sheetAgentToolGateway.mint(
    {
      appId: "ai-sheet",
      projectId: context.project.id,
      runId: context.run.id,
      conversationId: context.conversation?.conversationId,
      sessionId: context.conversation?.sessionId,
    },
    [
      createProjectTitleTool({
        setTitle: (projectId, title, toolContext) => sheetToolHandlers.setProjectTitle(projectId, title, toolContext),
      }),
    ],
  );
}

const sheetToolHandlers: {
  setProjectTitle: (projectId: string, title: string, context: AgentToolContext) => unknown;
} = {
  setProjectTitle: () => {
    throw new Error("Sheet app tools are not registered");
  },
};

function agentToolBaseUrl() {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 8792);
  return process.env.AI_SHEET_AGENT_TOOL_BASE_URL ?? `http://${host}:${port}`;
}
