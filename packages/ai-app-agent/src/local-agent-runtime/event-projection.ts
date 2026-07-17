import type { AgentEvent } from "@tutti-os/agent-acp-kit";
import type { RuntimeStreamEvent } from "@ai-app/agent/runtime";

export function toRuntimeStreamEvent(event: AgentEvent): RuntimeStreamEvent | null {
  const item = event as any;
  if (item.type === "text_delta") return { type: "text_delta", text: item.text };
  if ((item.type === "assistant" || item.type === "agent_message" || item.type === "message") && typeof item.text === "string") {
    return { type: "text_delta", text: item.text };
  }
  if (item.type === "result" && item.is_error !== true && typeof item.result === "string") {
    return { type: "text_delta", text: item.result };
  }
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
