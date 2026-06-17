import {
  mergeStreamEvent as mergeSharedStreamEvent,
  timelineToMessages,
  type AgentConversationBlock,
  type AgentConversationMessage,
  type ProjectTimelineUpdate,
} from "@ai-app/agent/conversation";
import type {
  DocumentProject,
  DocumentRun,
  DocumentRunEvent,
  DocumentRunTimelineItem,
  StreamEvent,
} from "@ai-doc/shared";

export type { AgentConversationBlock, AgentConversationMessage };
export { timelineToMessages };

export type DocumentProjectTimelineUpdate = ProjectTimelineUpdate<DocumentProject, DocumentRun, DocumentRunEvent>;

export function mergeStreamEvent(items: DocumentRunTimelineItem[], event: StreamEvent, projectId: string): DocumentProjectTimelineUpdate {
  return mergeSharedStreamEvent(items, event, projectId, {
    readProjectPayload,
    readRunPayload,
    readRunEventPayload,
  });
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
