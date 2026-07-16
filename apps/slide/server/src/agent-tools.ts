import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentToolGateway, appToolMcpServerConfig, createProjectTitleTool, registerAgentToolGatewayRoutes, type AgentTool, type AgentToolContext } from "@ai-app/shared/agent-tools";
import type { ProjectService } from "./artifact/project-service.js";
import type { RuntimeEditContext } from "./runtimes/runtime-provider.js";

export const slideAgentToolGateway = new AgentToolGateway();

export function registerSlideAgentToolRoutes(server: any, projects: ProjectService) {
  slideToolHandlers.setProjectTitle = (projectId, title) => projects.setProjectTitle(projectId, title, "ai");
  slideToolHandlers.reorderSlides = (projectId, slides) => projects.reorderDeckSlides(projectId, { slides }, "ai");
  registerAgentToolGatewayRoutes(server, slideAgentToolGateway);
}

export function buildSlideAppToolMcpServers(context: RuntimeEditContext) {
  const token = mintSlideAppToolToken(context);
  return [
    appToolMcpServerConfig({
      gatewayBaseUrl: `${agentToolBaseUrl()}/api/agent-tools`,
      token,
      serverDir: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    }),
  ];
}

function mintSlideAppToolToken(context: RuntimeEditContext) {
  const tools: AgentTool[] = [
    createProjectTitleTool({
      setTitle: (projectId, title, toolContext) => slideToolHandlers.setProjectTitle(projectId, title, toolContext),
    }),
  ];
  if (context.project.artifact.type === "deck") tools.push(createReorderSlidesTool());
  return slideAgentToolGateway.mint(
    {
      appId: "ai-slide",
      projectId: context.project.id,
      runId: context.run.id,
      conversationId: context.conversation?.conversationId,
      sessionId: context.conversation?.sessionId,
    },
    tools,
  );
}

function createReorderSlidesTool(): AgentTool {
  return {
    name: "reorder_slides",
    description:
      "Synchronize the current deck manifest order from deck.slides/slides HTML files. Pass all slide file names in the desired order, or omit slides to sort by indexed file names. The current project is inferred from the active run.",
    inputSchema: {
      type: "object",
      properties: {
        slides: {
          type: "array",
          description: 'Optional complete ordered list of slide file names, such as ["01-cover.html", "02-problem.html"].',
          items: { type: "string" },
        },
      },
      additionalProperties: false,
    },
    handler: async (raw, context) => {
      const input = recordInput(raw);
      const slides = Array.isArray(input.slides) ? input.slides.map((value) => String(value)) : undefined;
      return slideToolHandlers.reorderSlides(context.projectId, slides, context);
    },
  };
}

const slideToolHandlers: {
  setProjectTitle: (projectId: string, title: string, context: AgentToolContext) => unknown;
  reorderSlides: (projectId: string, slides: string[] | undefined, context: AgentToolContext) => unknown;
} = {
  setProjectTitle: () => {
    throw new Error("Slide app tools are not registered");
  },
  reorderSlides: () => {
    throw new Error("Slide app tools are not registered");
  },
};

function recordInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function agentToolBaseUrl() {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 8791);
  return process.env.AI_SLIDE_AGENT_TOOL_BASE_URL ?? `http://${host}:${port}`;
}
