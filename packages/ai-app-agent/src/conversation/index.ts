import type { BaseRun, BaseRunEvent, BaseRunTimelineItem, StreamEvent } from "@ai-app/shared/types";

export type AgentConversationBlock =
  | { type: "thinking"; text: string }
  | { type: "tool"; title: string; detail: string; status: "streaming" | "success" | "error" }
  | { type: "status"; text: string }
  | { type: "error"; text: string }
  | { type: "result"; text: string };

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
        status: event.status === "error" ? "error" : event.status === "success" ? "success" : "streaming",
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
