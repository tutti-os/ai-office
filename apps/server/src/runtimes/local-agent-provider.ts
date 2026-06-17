import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDefaultLocalAgentProviderPlugins,
  createLocalAgentRuntime,
  type AgentEvent,
} from "@nextop-os/agent-acp-kit";
import type { LocalAgentProviderStatus, RuntimeProfile } from "@ai-document/shared";
import { projectWorkspaceRoot } from "../local/paths.js";
import type { RuntimeEditContext, RuntimeProvider, RuntimeStreamEvent } from "./runtime-provider.js";

const DEFAULT_TIMEOUT_MS = 180_000;

export class LocalAgentRuntimeProvider implements RuntimeProvider {
  id = "local-agent";
  private readonly controllers = new Map<string, AbortController>();
  private readonly localAgentRuntime = createLocalAgentRuntime({
    providers: createDefaultLocalAgentProviderPlugins(),
  });

  canHandle(profile: RuntimeProfile) {
    return profile.kind === "local-agent";
  }

  describeRun(profile: RuntimeProfile) {
    return { runtime: profile.kind, provider: profile.provider, model: profile.model };
  }

  async detect(profile: RuntimeProfile) {
    const registered = this.localAgentRuntime.listProviders().some((item: any) => item.id === profile.provider);
    if (!registered) {
      return { available: false, reason: `local-agent provider is not registered: ${profile.provider}` };
    }
    const detection = (await this.localAgentRuntime.detect()).find((item: any) => item.provider === profile.provider);
    if (!detection) return { available: true };
    if (detection.result?.supported === false) {
      return {
        available: false,
        reason: detection.result.unsupportedReason ?? `${profile.provider} is not supported on this machine.`,
      };
    }
    if (detection.result === null) {
      return { available: false, reason: `${profile.provider} is not installed or not discoverable.` };
    }
    return { available: true };
  }

  async listLocalAgentProviders(): Promise<LocalAgentProviderStatus[]> {
    const detections = await this.localAgentRuntime.detect();
    return detections.map((item: any) => {
      const available = Boolean(item.result && item.result.supported !== false);
      return {
        provider: item.provider,
        displayName: item.displayName,
        available,
        authState: item.result?.authState ?? "unknown",
        executablePath: item.result?.executablePath ?? "",
        version: item.result?.version ?? "not-installed",
        configDir: item.result?.configDir,
        models: (item.result?.models ?? []).map((model: any) => ({ id: model.id, label: model.label })),
        reason: available ? undefined : localAgentUnavailableReason(item.displayName, item.result),
      };
    });
  }

  async *streamEdit(context: RuntimeEditContext) {
    const provider = context.runtimeProfile.provider;
    const workspaceRoot = projectWorkspaceRoot(context.project.id);
    const controller = new AbortController();
    this.controllers.set(context.run.id, controller);

    try {
      const sessionStore = new LocalAgentSessionStore(workspaceRoot);
      const previousSession = sessionStore.read(context.project.id);
      const resume =
        previousSession?.provider === provider && (previousSession.providerSessionId || previousSession.resumeToken)
          ? {
              mode: "provider" as const,
              ...(previousSession.providerSessionId ? { providerSessionId: previousSession.providerSessionId } : {}),
              ...(previousSession.resumeToken ? { resumeToken: previousSession.resumeToken } : {}),
            }
          : { mode: "fresh" as const };

      for await (const event of this.localAgentRuntime.run({
        runId: context.run.id,
        conversationId: context.project.id,
        sessionId: context.project.id,
        provider,
        runtimeKind: "local-agent",
        runtimeProvider: provider,
        cwd: workspaceRoot,
        prompt: buildEditPrompt(context),
        systemPrompt: buildSystemPrompt(context),
        history: [],
        model: stripProviderPrefix(context.runtimeProfile.model, provider),
        reasoning: context.request.reasoningEffort ?? undefined,
        mcpServers: buildMcpServers(context),
        env: {
          AI_DOCUMENT_WORKSPACE: workspaceRoot,
          AI_DOCUMENT_PROJECT_ID: context.project.id,
          AI_DOCUMENT_RUN_ID: context.run.id,
          AI_DOCUMENT_TOOL_BASE_URL: localToolBaseUrl(),
        },
        timeoutMs: Number(process.env.AI_DOCUMENT_LOCAL_AGENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
        extraAllowedDirs: [workspaceRoot],
        resume,
        signal: controller.signal,
      } as any)) {
        const runtimeEvent = toRuntimeStreamEvent(event as AgentEvent);
        if (runtimeEvent) {
          yield runtimeEvent;
        } else if ((event as any).type === "error") {
          throw new Error((event as any).message);
        } else if ((event as any).type === "done") {
          const done = event as any;
          if (done.sessionId || done.resumeToken) {
            sessionStore.write(context.project.id, {
              provider,
              providerSessionId: done.sessionId,
              resumeToken: done.resumeToken,
            });
          }
          if (done.status === "failed") {
            throw new Error(`local-agent ${provider} failed${typeof done.exitCode === "number" ? ` with exit code ${done.exitCode}` : ""}`);
          }
        }
      }
    } finally {
      this.controllers.delete(context.run.id);
    }
  }

  async cancel(runId: string) {
    const controller = this.controllers.get(runId);
    if (!controller) return { cancelled: false, reason: "local-agent run is not active" };
    controller.abort();
    await this.localAgentRuntime.cancel(runId).catch(() => undefined);
    this.controllers.delete(runId);
    return { cancelled: true };
  }
}

function buildSystemPrompt(context: RuntimeEditContext) {
  if (context.project.type === "docx") {
    return [
      "You are an AI document editing agent inside a local document app.",
      "This project is a Word DOCX document.",
      "The canonical file is `document.docx` in the current working directory.",
      "When asked to create or edit the document, write the final DOCX result to `document.docx`.",
      "Do not convert the document to HTML or Markdown unless the user explicitly asks for that as a separate export.",
    ].join("\n\n");
  }

  return [
    "You are an AI document editing agent inside a local rich text editor.",
    "The canonical runtime is a full HTML document. Do not convert it to Markdown.",
    "Preserve existing CSS, layout intent, semantic headings, and editable HTML structure unless the user explicitly asks for a redesign.",
    "When asked to edit, return one complete updated HTML document as your final answer.",
    "Do not explain the changes outside the HTML. If you use tools, still ensure the final answer contains the complete updated HTML.",
  ].join("\n\n");
}

function buildEditPrompt(context: RuntimeEditContext) {
  if (context.project.type === "docx") {
    return `<docs_agent_context>
project_id: ${context.project.id}
title: ${context.project.title}
document_type: ${context.project.type}
mode: ${context.request.mode}
selection_type: ${context.request.selectionType ?? "write"}
selection_path: ${context.request.selectionPath ?? ""}
canonical_docx_path: document.docx
</docs_agent_context>

<user_instruction>
${context.request.userPrompt}
</user_instruction>

<selected_text>
${context.request.selectedText ?? ""}
</selected_text>

<current_docx_manifest>
${context.project.content}
</current_docx_manifest>

Create or edit the DOCX file at document.docx.`;
  }

  return `<docs_agent_context>
project_id: ${context.project.id}
title: ${context.project.title}
document_type: ${context.project.type}
mode: ${context.request.mode}
selection_type: ${context.request.selectionType ?? "write"}
selection_path: ${context.request.selectionPath ?? ""}
</docs_agent_context>

<user_instruction>
${context.request.userPrompt}
</user_instruction>

<selected_text>
${context.request.selectedText ?? ""}
</selected_text>

<selected_html>
${context.request.selectedHtml ?? ""}
</selected_html>

<current_html>
${context.request.htmlContent || context.project.content}
</current_html>

Return the complete updated HTML document only.`;
}

function buildMcpServers(context: RuntimeEditContext) {
  if (!context.toolAccess?.token) return [];
  return [
    {
      name: "ai-document",
      type: "stdio",
      command: process.execPath,
      args: [resolveLocalAgentHostScript("tools-mcp.mjs")],
      env: {
        AI_DOCUMENT_TOOL_BASE_URL: localToolBaseUrl(),
        AI_DOCUMENT_TOOL_TOKEN: context.toolAccess.token,
        AI_DOCUMENT_PROJECT_ID: context.project.id,
        AI_DOCUMENT_RUN_ID: context.run.id,
      },
    },
  ];
}

function toRuntimeStreamEvent(event: AgentEvent): RuntimeStreamEvent | null {
  const item = event as any;
  if (item.type === "text_delta") return { type: "text_delta", text: item.text };
  if (item.type === "thinking" || item.type === "thinking_delta") return { type: "thinking_delta", text: item.text };
  if (item.type === "tool_call") return { type: "tool_call", id: item.id, name: item.name || "unknown_tool", input: item.input };
  if (item.type === "tool_result") {
    return {
      type: "tool_result",
      id: item.id,
      name: item.name || "unknown_tool",
      status: item.status,
      output: item.output,
      summary: item.summary,
      error: item.error,
      isError: item.isError,
    };
  }
  if (item.type === "status") return { type: "status", status: item.status ?? item.stage, message: item.message };
  if (item.type === "file_write") return { type: "file_write", path: item.path };
  if (item.type === "stderr") return { type: "stderr", text: item.text };
  return null;
}

function resolveLocalAgentHostScript(filename: string) {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, "..", "local-agent-host", filename);
}

function stripProviderPrefix(model: string, provider: string) {
  const prefix = `${provider}:`;
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
}

function localToolBaseUrl() {
  return process.env.AI_DOCUMENT_SERVER_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8790}`;
}

function localAgentUnavailableReason(displayName: string, result: any) {
  if (!result) return `${displayName} is not installed or not discoverable.`;
  if (result.supported === false) return result.unsupportedReason ?? `${displayName} is not supported on this machine.`;
  if (result.authState === "missing") return `${displayName} is installed but authentication is missing.`;
  if (result.authState === "expired") return `${displayName} authentication has expired.`;
  return `${displayName} is not available.`;
}

interface StoredLocalAgentSession {
  provider: string;
  providerSessionId?: string;
  resumeToken?: string;
  updatedAt: string;
}

class LocalAgentSessionStore {
  constructor(private readonly workspaceRoot: string) {}

  read(projectId: string): StoredLocalAgentSession | null {
    try {
      const parsed = JSON.parse(readFileSync(this.pathFor(projectId), "utf8")) as StoredLocalAgentSession;
      return typeof parsed.provider === "string" && parsed.provider ? parsed : null;
    } catch {
      return null;
    }
  }

  write(projectId: string, session: Omit<StoredLocalAgentSession, "updatedAt">) {
    const filePath = this.pathFor(projectId);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify({ ...session, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  }

  remove(projectId: string) {
    try {
      unlinkSync(this.pathFor(projectId));
    } catch {
      // Missing session is equivalent to a fresh run.
    }
  }

  private pathFor(projectId: string) {
    return join(this.workspaceRoot, ".ai-document", "local-agent-sessions", `${projectId.replace(/[^\w.-]/g, "_")}.json`);
  }
}
