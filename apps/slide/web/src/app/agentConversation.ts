import {
  mergeStreamEvent as mergeSharedStreamEvent,
  timelineToMessages,
  type AgentConversationBlock,
  type AgentConversationMessage,
  type ProjectTimelineUpdate,
} from "@ai-app/agent/conversation";
import type { ProjectDetailResponse, SlideRun, SlideRunEvent, SlideRunTimelineItem, StreamEvent } from "@ai-slide/shared";

export type { AgentConversationBlock, AgentConversationMessage };
export { timelineToMessages };

export type SlideProjectTimelineUpdate = ProjectTimelineUpdate<ProjectDetailResponse, SlideRun, SlideRunEvent>;

export function mergeStreamEvent(items: SlideRunTimelineItem[], event: StreamEvent, projectId: string): SlideProjectTimelineUpdate {
  return mergeSharedStreamEvent(items, event, projectId, {
    readProjectPayload,
    readRunPayload,
    readRunEventPayload,
  });
}

function readRunPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("run" in payload)) return null;
  const run = (payload as { run?: unknown }).run;
  return isSlideRun(run) ? run : null;
}

function readRunEventPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("event" in payload)) return null;
  const event = (payload as { event?: unknown }).event;
  return isSlideRunEvent(event) ? event : null;
}

function readProjectPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("project" in payload) || !("artifact" in payload)) return null;
  return payload as ProjectDetailResponse;
}

function isSlideRun(value: unknown): value is SlideRun {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

function isSlideRunEvent(value: unknown): value is SlideRunEvent {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" && typeof (value as { runId?: unknown }).runId === "string");
}
