import {
  mergeStreamEvent as mergeSharedStreamEvent,
  timelineToMessages,
  type AgentConversationBlock,
  type AgentConversationMessage,
  type ProjectTimelineUpdate,
} from "@ai-app/agent/conversation";
import type { ProjectDetailResponse, SheetRun, SheetRunEvent, SheetRunTimelineItem, StreamEvent } from "@ai-sheet/shared";

export type { AgentConversationBlock, AgentConversationMessage };
export { timelineToMessages };

export type SheetProjectTimelineUpdate = ProjectTimelineUpdate<ProjectDetailResponse, SheetRun, SheetRunEvent>;

export function mergeStreamEvent(items: SheetRunTimelineItem[], event: StreamEvent, projectId: string): SheetProjectTimelineUpdate {
  return mergeSharedStreamEvent(items, event, projectId, {
    readProjectPayload,
    readRunPayload,
    readRunEventPayload,
  });
}

function readRunPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("run" in payload)) return null;
  const run = (payload as { run?: unknown }).run;
  return isSheetRun(run) ? run : null;
}

function readRunEventPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("event" in payload)) return null;
  const event = (payload as { event?: unknown }).event;
  return isSheetRunEvent(event) ? event : null;
}

function readProjectPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("project" in payload) || !("artifact" in payload)) return null;
  return payload as ProjectDetailResponse;
}

function isSheetRun(value: unknown): value is SheetRun {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

function isSheetRunEvent(value: unknown): value is SheetRunEvent {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" && typeof (value as { runId?: unknown }).runId === "string");
}
