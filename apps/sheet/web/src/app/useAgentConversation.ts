import { useRunTimelineStream } from "@ai-app/agent/conversation-hooks";
import type { ProjectDetailResponse, SheetRun, SheetRunEvent, SheetRunTimelineItem, StreamEvent } from "@ai-sheet/shared";
import { getProject, listProjectRuns } from "../api/projects";
import { mergeStreamEvent } from "./agentConversation";

type UseAgentConversationInput = {
  projectId: string | null;
  onProjectUpdated: (detail: ProjectDetailResponse) => void;
};

export function useAgentConversation(input: UseAgentConversationInput) {
  return useRunTimelineStream<ProjectDetailResponse, SheetRun, SheetRunEvent, StreamEvent, SheetRunTimelineItem>({
    projectId: input.projectId,
    listProjectRuns,
    mergeStreamEvent,
    onProjectUpdated: input.onProjectUpdated,
    hydrateProject: getProject,
    shouldHydrateProject: (event) => event.type === "project.updated",
  });
}
