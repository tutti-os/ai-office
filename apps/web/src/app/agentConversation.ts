import type {
  DocumentProject,
  DocumentRun,
  DocumentRunEvent,
  DocumentRunTimelineItem,
  StreamEvent,
} from "@ai-document/shared";

export type AgentConversationBlock =
  | { type: "thinking"; text: string }
  | { type: "tool"; title: string; detail: string; status: "streaming" | "success" | "error" }
  | { type: "status"; text: string }
  | { type: "error"; text: string }
  | { type: "result"; text: string };

export type AgentConversationMessage =
  | {
      id: string;
      role: "user";
      run: DocumentRun;
      selectedText: string;
      text: string;
      createdAt: string;
    }
  | {
      id: string;
      role: "assistant";
      run: DocumentRun;
      blocks: AgentConversationBlock[];
      createdAt: string;
    };

export type ProjectTimelineUpdate =
  | { kind: "changed"; items: DocumentRunTimelineItem[] }
  | { kind: "project"; project: DocumentProject }
  | { kind: "ignore"; items: DocumentRunTimelineItem[] };

export function timelineToMessages(items: DocumentRunTimelineItem[]) {
  return items.flatMap<AgentConversationMessage>((item) => [
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

export function mergeStreamEvent(items: DocumentRunTimelineItem[], event: StreamEvent, projectId: string): ProjectTimelineUpdate {
  if (event.projectId !== projectId) return { kind: "ignore", items };

  if (event.type === "project.updated") {
    const project = readProjectPayload(event.payload);
    return project ? { kind: "project", project } : { kind: "ignore", items };
  }

  if (event.type === "run.event.created") {
    const runEvent = readRunEventPayload(event.payload);
    if (!runEvent) return { kind: "ignore", items };
    return { kind: "changed", items: upsertRunEvent(items, runEvent) };
  }

  if (event.type === "run.accepted" || event.type === "run.started" || event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
    const run = readRunPayload(event.payload);
    if (!run) return { kind: "ignore", items };
    return { kind: "changed", items: upsertRun(items, run) };
  }

  return { kind: "ignore", items };
}

function eventsToBlocks(events: DocumentRunEvent[], run: DocumentRun) {
  const blocks: AgentConversationBlock[] = [];
  let thinking = "";

  const flushThinking = () => {
    const text = thinking.trim();
    if (text) blocks.push({ type: "thinking", text });
    thinking = "";
  };

  for (const event of events) {
    if (event.type === "thinking_delta") {
      thinking += event.content;
      continue;
    }
    flushThinking();
    if (event.type === "tool_call") {
      blocks.push({
        type: "tool",
        title: toolTitle(event, "Tool call"),
        detail: event.content,
        status: event.status === "error" ? "error" : "streaming",
      });
    } else if (event.type === "tool_result") {
      blocks.push({
        type: "tool",
        title: toolTitle(event, "Tool result"),
        detail: event.content,
        status: event.status === "error" ? "error" : "success",
      });
    } else if (event.type === "file_write") {
      blocks.push({ type: "tool", title: "File write", detail: event.content, status: "success" });
    } else if (event.type === "stderr" || event.type === "error") {
      blocks.push({ type: "error", text: event.content });
    } else if (event.content.trim()) {
      blocks.push({ type: "status", text: event.content });
    }
  }

  flushThinking();

  if (run.status === "completed" && run.resultPreview.trim()) {
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

function upsertRun(items: DocumentRunTimelineItem[], run: DocumentRun) {
  const index = items.findIndex((item) => item.run.id === run.id);
  if (index < 0) return [...items, { run, events: [] }].sort(sortTimelineItems);
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, run } : item));
}

function upsertRunEvent(items: DocumentRunTimelineItem[], event: DocumentRunEvent) {
  return items.map((item) => {
    if (item.run.id !== event.runId) return item;
    const exists = item.events.some((existing) => existing.id === event.id);
    const events = exists ? item.events : [...item.events, event].sort(sortRunEvents);
    return { ...item, events };
  });
}

function sortTimelineItems(a: DocumentRunTimelineItem, b: DocumentRunTimelineItem) {
  return a.run.createdAt.localeCompare(b.run.createdAt) || a.run.id.localeCompare(b.run.id);
}

function sortRunEvents(a: DocumentRunEvent, b: DocumentRunEvent) {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
}

function toolTitle(event: DocumentRunEvent, fallback: string) {
  const toolName = event.metadata && typeof event.metadata.toolName === "string" ? event.metadata.toolName : "";
  return toolName || fallback;
}

function readRunPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("run" in payload)) return null;
  const run = (payload as { run?: unknown }).run;
  return isDocumentRun(run) ? run : null;
}

function readRunEventPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("event" in payload)) return null;
  const event = (payload as { event?: unknown }).event;
  return isDocumentRunEvent(event) ? event : null;
}

function readProjectPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("project" in payload)) return null;
  const project = (payload as { project?: unknown }).project;
  return isDocumentProject(project) ? project : null;
}

function isDocumentRun(value: unknown): value is DocumentRun {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

function isDocumentRunEvent(value: unknown): value is DocumentRunEvent {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" && typeof (value as { runId?: unknown }).runId === "string");
}

function isDocumentProject(value: unknown): value is DocumentProject {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" && typeof (value as { content?: unknown }).content === "string");
}
