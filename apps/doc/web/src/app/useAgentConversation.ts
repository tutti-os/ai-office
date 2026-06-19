import { useRunTimelineStream } from "@ai-app/agent/conversation-hooks";
import type { DocumentProject, DocumentRun, DocumentRunEvent, DocumentRunTimelineItem, StreamEvent } from "@ai-doc/shared";
import { listProjectRuns } from "../api/projects";
import { mergeStreamEvent } from "./agentConversation";

type UseAgentConversationInput = {
  projectId: string | null;
  onProjectUpdated: (project: DocumentProject) => void;
};

export function useAgentConversation(input: UseAgentConversationInput) {
  return useRunTimelineStream<DocumentProject, DocumentRun, DocumentRunEvent, StreamEvent, DocumentRunTimelineItem>({
    projectId: input.projectId,
    listProjectRuns,
    mergeStreamEvent,
    onProjectUpdated: input.onProjectUpdated,
  });
}
