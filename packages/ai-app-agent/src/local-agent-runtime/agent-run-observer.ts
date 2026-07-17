import type { AgentEvent } from "@tutti-os/agent-acp-kit";
import type { AgentRunTimingLogger } from "@ai-app/agent/agent-run-timing";

type AgentTimingDiagnostic = {
  kind: "timing";
  phase: "prepare" | "run";
  stage: string;
  elapsedMs: number;
  totalElapsedMs: number;
  outcome?: "completed" | "failed" | "canceled";
};

export function createAgentRunObserver(input: {
  timing: AgentRunTimingLogger;
  model: string;
  resumeMode: string;
  isAborted: () => boolean;
}) {
  const executionStartedAt = Date.now();
  let eventCount = 0;
  let toolCallCount = 0;
  let toolResultCount = 0;
  let firstEventSeen = false;
  let firstTextSeen = false;
  let firstToolSeen = false;
  let terminalSeen = false;
  const toolStartedAt = new Map<string, number>();

  input.timing.emit("agent_execution_started", {
    phase: "run",
    model: input.model,
    resume_mode: input.resumeMode,
  });

  function observe(event: AgentEvent) {
    const diagnostic = readAgentTimingDiagnostic(event);
    if (diagnostic) {
      input.timing.emit("agent_kit_timing", {
        phase: diagnostic.phase,
        stage: diagnostic.stage,
        elapsed_ms: diagnostic.elapsedMs,
        kit_total_elapsed_ms: diagnostic.totalElapsedMs,
        ...(diagnostic.outcome ? { outcome: diagnostic.outcome } : {}),
      });
      return true;
    }
    eventCount += 1;
    if (!firstEventSeen) {
      firstEventSeen = true;
      input.timing.emit("agent_execution_first_event", {
        phase: "run",
        elapsed_ms: Date.now() - executionStartedAt,
        event_type: event.type,
      });
    }
    if (!firstTextSeen && event.type === "text_delta") {
      firstTextSeen = true;
      input.timing.emit("agent_execution_first_text", {
        phase: "run",
        elapsed_ms: Date.now() - executionStartedAt,
      });
    }
    if (event.type === "tool_call") {
      toolCallCount += 1;
      toolStartedAt.set(event.id, Date.now());
      if (!firstToolSeen) {
        firstToolSeen = true;
        input.timing.emit("agent_execution_first_tool", {
          phase: "run",
          elapsed_ms: Date.now() - executionStartedAt,
          tool_name: event.name,
        });
      }
    }
    if (event.type === "tool_result") {
      toolResultCount += 1;
      const startedAt = toolStartedAt.get(event.id);
      input.timing.emit("agent_tool_done", {
        phase: "run",
        tool_name: event.name ?? "unknown",
        status: event.status ?? (event.isError ? "failed" : "completed"),
        ...(startedAt ? { elapsed_ms: Date.now() - startedAt } : {}),
      });
      toolStartedAt.delete(event.id);
    }
    if (event.type === "done") {
      finish(event.status ?? (event.reason === "cancelled" ? "canceled" : event.reason === "error" ? "failed" : "completed"));
    }
    return false;
  }

  function finish(outcome: string) {
    terminalSeen = true;
    input.timing.emit("agent_execution_done", {
      phase: "run",
      outcome,
      elapsed_ms: Date.now() - executionStartedAt,
      event_count: eventCount,
      tool_call_count: toolCallCount,
      tool_result_count: toolResultCount,
      unfinished_tool_count: toolStartedAt.size,
    });
  }

  function fail(error: unknown) {
    input.timing.emit("agent_execution_error", {
      phase: "run",
      outcome: input.isAborted() ? "canceled" : "failed",
      error_name: error instanceof Error ? error.name : "unknown",
    }, "ERROR");
  }

  function close() {
    if (!terminalSeen) finish(input.isAborted() ? "canceled" : "stream_closed");
  }

  return { observe, fail, close };
}

function readAgentTimingDiagnostic(event: AgentEvent): AgentTimingDiagnostic | undefined {
  if (event.type !== "status") return undefined;
  const diagnostic = (event as unknown as { diagnostic?: unknown }).diagnostic;
  if (!diagnostic || typeof diagnostic !== "object") return undefined;
  const candidate = diagnostic as Partial<AgentTimingDiagnostic>;
  if (
    candidate.kind !== "timing"
    || (candidate.phase !== "prepare" && candidate.phase !== "run")
    || typeof candidate.stage !== "string"
    || typeof candidate.elapsedMs !== "number"
    || typeof candidate.totalElapsedMs !== "number"
  ) return undefined;
  return candidate as AgentTimingDiagnostic;
}
