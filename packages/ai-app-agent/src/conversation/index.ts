import type { BaseRun, BaseRunEvent, BaseRunTimelineItem, StreamEvent } from "@ai-app/shared/types";

export type AgentConversationBlock =
  | { type: "thinking"; text: string }
  | {
      type: "tool_group";
      calls: AgentConversationToolCall[];
      results: AgentConversationToolResult[];
      status: "streaming" | "success" | "error";
    }
  | { type: "status"; text: string }
  | { type: "error"; text: string }
  | { type: "result"; text: string };

export type AgentConversationToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type AgentConversationToolResult = {
  id: string;
  name: string;
  content: string;
  status: "success" | "error";
};

export type AgentConversationMessage<TRun extends BaseRun = BaseRun> =
  | {
      id: string;
      role: "user";
      run: TRun;
      selectedText: string;
      text: string;
      createdAt: string;
    }
  | {
      id: string;
      role: "assistant";
      run: TRun;
      blocks: AgentConversationBlock[];
      createdAt: string;
    };

export type ProjectTimelineUpdate<
  TProject,
  TRun extends BaseRun = BaseRun,
  TEvent extends BaseRunEvent = BaseRunEvent,
> =
  | { kind: "changed"; items: Array<BaseRunTimelineItem<TRun, TEvent>> }
  | { kind: "project"; project: TProject }
  | { kind: "ignore"; items: Array<BaseRunTimelineItem<TRun, TEvent>> };

export function timelineToMessages<TRun extends BaseRun, TEvent extends BaseRunEvent>(
  items: Array<BaseRunTimelineItem<TRun, TEvent>>,
) {
  return items.flatMap<AgentConversationMessage<TRun>>((item) => [
    {
      id: `user:${item.run.id}`,
      role: "user",
      run: item.run,
      selectedText: item.run.selectedText,
      text: item.run.instruction,
      createdAt: item.run.createdAt,
    },
    {
      id: `assistant:${item.run.id}`,
      role: "assistant",
      run: item.run,
      blocks: eventsToBlocks(item.events, item.run),
      createdAt: item.run.createdAt,
    },
  ]);
}

export function isAgentRunActive(run: BaseRun) {
  return run.status === "accepted" || run.status === "running";
}

export function hasActiveAgentRun<TRun extends BaseRun, TEvent extends BaseRunEvent>(
  items: Array<BaseRunTimelineItem<TRun, TEvent>>,
) {
  return items.some((item) => isAgentRunActive(item.run));
}

export function mergeStreamEvent<TProject, TRun extends BaseRun, TEvent extends BaseRunEvent>(
  items: Array<BaseRunTimelineItem<TRun, TEvent>>,
  event: StreamEvent,
  projectId: string,
  readers: {
    readProjectPayload: (payload: unknown) => TProject | null;
    readRunPayload: (payload: unknown) => TRun | null;
    readRunEventPayload: (payload: unknown) => TEvent | null;
  },
): ProjectTimelineUpdate<TProject, TRun, TEvent> {
  if (event.projectId !== projectId) return { kind: "ignore", items };

  if (event.type === "project.updated") {
    const project = readers.readProjectPayload(event.payload);
    return project ? { kind: "project", project } : { kind: "ignore", items };
  }

  if (event.type === "run.event.created") {
    const runEvent = readers.readRunEventPayload(event.payload);
    if (!runEvent) return { kind: "ignore", items };
    return { kind: "changed", items: upsertRunEvent(items, runEvent) };
  }

  if (event.type === "run.accepted" || event.type === "run.started" || event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
    const run = readers.readRunPayload(event.payload);
    if (!run) return { kind: "ignore", items };
    return { kind: "changed", items: upsertRun(items, run) };
  }

  return { kind: "ignore", items };
}

function eventsToBlocks<TEvent extends BaseRunEvent, TRun extends BaseRun>(events: TEvent[], run: TRun) {
  const blocks: AgentConversationBlock[] = [];
  const resultByToolId = new Map<string, TEvent>();
  const pairedResultEventIds = new Set<string>();
  const runningToolIds = runningToolCallIds(events);

  for (const event of events) {
    if (event.type !== "tool_result") continue;
    const toolId = toolCallId(event);
    if (toolId) resultByToolId.set(toolId, event);
  }

  for (const event of events) {
    if (event.type === "thinking_delta") {
      appendTextLikeBlock(blocks, "thinking", event.content);
      continue;
    }

    if (event.type === "text_delta") {
      appendTextLikeBlock(blocks, "result", event.content);
    } else if (event.type === "tool_call") {
      const toolId = toolCallId(event) || event.id;
      const result = resultByToolId.get(toolId);
      if (result) pairedResultEventIds.add(result.id);
      appendToolGroupBlock(blocks, event, result, runningToolIds.has(toolId));
    } else if (event.type === "tool_result") {
      if (!pairedResultEventIds.has(event.id)) appendToolResultOnlyBlock(blocks, event);
    } else if (event.type === "file_write") {
      appendTextLikeBlock(blocks, "status", event.content || "File written");
    } else if (event.type === "stderr" || event.type === "error") {
      appendTextLikeBlock(blocks, "error", event.content);
    } else if (event.content.trim()) {
      appendTextLikeBlock(blocks, "status", event.content);
    }
  }

  const hasTextDelta = events.some((event) => event.type === "text_delta" && event.content.trim());
  if (run.status === "completed" && run.resultPreview.trim() && !hasTextDelta) {
    blocks.push({ type: "result", text: run.resultPreview.trim() });
  } else if (run.status === "failed" && run.error) {
    blocks.push({ type: "error", text: run.error });
  } else if (run.status === "cancelled") {
    blocks.push({ type: "status", text: run.error || "Cancelled" });
  } else if (!blocks.length) {
    blocks.push({ type: "status", text: run.status === "accepted" ? "Queued" : "Working" });
  }

  return blocks;
}

function appendTextLikeBlock(blocks: AgentConversationBlock[], type: "thinking" | "status" | "error" | "result", text: string) {
  if (type === "result") {
    const last = blocks.at(-1);
    if (last?.type === "result") {
      last.text = `${last.text}${text}`;
      return;
    }
    if (!text.trim()) return;
    blocks.push({ type, text: text.trimStart() });
    return;
  }

  const trimmed = text.trim();
  if (!trimmed) return;
  const last = blocks.at(-1);
  if (last?.type === type) {
    last.text = `${last.text}\n${trimmed}`;
    return;
  }
  blocks.push({ type, text: trimmed });
}

function appendToolGroupBlock(blocks: AgentConversationBlock[], event: BaseRunEvent, result: BaseRunEvent | undefined, running: boolean) {
  const call = toolCallFromEvent(event);
  const toolResult = result ? toolResultFromEvent(result) : null;
  const status = toolGroupStatus([call], toolResult ? [toolResult] : [], running);

  blocks.push({
    type: "tool_group",
    calls: [call],
    results: toolResult ? [toolResult] : [],
    status,
  });
}

function appendToolResultOnlyBlock(blocks: AgentConversationBlock[], event: BaseRunEvent) {
  const result = toolResultFromEvent(event);
  blocks.push({
    type: "tool_group",
    calls: [],
    results: [result],
    status: result.status,
  });
}

function toolCallFromEvent(event: BaseRunEvent): AgentConversationToolCall {
  return {
    id: toolCallId(event) || event.id,
    name: toolTitle(event, "Tool"),
    input: event.metadata && "input" in event.metadata ? event.metadata.input : null,
  };
}

function toolResultFromEvent(event: BaseRunEvent): AgentConversationToolResult {
  return {
    id: toolCallId(event) || event.id,
    name: toolTitle(event, "Tool"),
    content: toolResultContent(event),
    status: event.status === "error" ? "error" : "success",
  };
}

function toolResultContent(event: BaseRunEvent) {
  if (event.status === "error") return event.content;
  if (event.metadata && "output" in event.metadata) {
    const formatted = formatRawToolOutput(event.metadata.output);
    if (formatted) return formatted;
  }
  return event.content;
}

function formatRawToolOutput(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value.trim();
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toolGroupStatus(calls: AgentConversationToolCall[], results: AgentConversationToolResult[], running: boolean): "streaming" | "success" | "error" {
  if (results.some((result) => result.status === "error")) return "error";
  if (running || results.length < calls.length) return "streaming";
  return "success";
}

function runningToolCallIds(events: BaseRunEvent[]) {
  const resultIds = new Set<string>();
  const runningIds = new Set<string>();
  let hasLaterSettlingEvent = false;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;

    if (event.type === "tool_result") {
      const id = toolCallId(event);
      if (id) resultIds.add(id);
      continue;
    }

    if (event.type === "tool_call") {
      const id = toolCallId(event) || event.id;
      if (!resultIds.has(id) && !hasLaterSettlingEvent) runningIds.add(id);
      hasLaterSettlingEvent = true;
      continue;
    }

    if (settlesResultlessToolCall(event)) hasLaterSettlingEvent = true;
  }

  return runningIds;
}

function settlesResultlessToolCall(event: BaseRunEvent) {
  return event.type === "text_delta" || event.type === "thinking_delta" || event.type === "status" || event.type === "file_write" || event.type === "stderr" || event.type === "error";
}

function toolCallId(event: BaseRunEvent) {
  const value = event.metadata?.toolCallId;
  return typeof value === "string" && value.trim() ? value : "";
}

function upsertRun<TRun extends BaseRun, TEvent extends BaseRunEvent>(items: Array<BaseRunTimelineItem<TRun, TEvent>>, run: TRun) {
  const index = items.findIndex((item) => item.run.id === run.id);
  if (index < 0) return [...items, { run, events: [] }].sort(sortTimelineItems);
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, run } : item));
}

function upsertRunEvent<TRun extends BaseRun, TEvent extends BaseRunEvent>(items: Array<BaseRunTimelineItem<TRun, TEvent>>, event: TEvent) {
  return items.map((item) => {
    if (item.run.id !== event.runId) return item;
    const exists = item.events.some((existing) => existing.id === event.id);
    const events = exists ? item.events : [...item.events, event].sort(sortRunEvents);
    return { ...item, events };
  });
}

function sortTimelineItems<TRun extends BaseRun, TEvent extends BaseRunEvent>(a: BaseRunTimelineItem<TRun, TEvent>, b: BaseRunTimelineItem<TRun, TEvent>) {
  return a.run.createdAt.localeCompare(b.run.createdAt) || a.run.id.localeCompare(b.run.id);
}

function sortRunEvents(a: BaseRunEvent, b: BaseRunEvent) {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
}

function toolTitle(event: BaseRunEvent, fallback: string) {
  const toolName = event.metadata && typeof event.metadata.toolName === "string" ? event.metadata.toolName : "";
  return toolName || fallback;
}
