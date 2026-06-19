import { useRunTimelineStream } from "@ai-app/agent/conversation-hooks";
import type { ProjectDetailResponse, SlideRun, SlideRunEvent, SlideRunTimelineItem, StreamEvent } from "@ai-slide/shared";
import { getProject, listProjectRuns } from "../api/projects";
import { mergeStreamEvent } from "./agentConversation";

type UseAgentConversationInput = {
  projectId: string | null;
  onProjectUpdated: (detail: ProjectDetailResponse) => void;
};

export function useAgentConversation(input: UseAgentConversationInput) {
  return useRunTimelineStream<ProjectDetailResponse, SlideRun, SlideRunEvent, StreamEvent, SlideRunTimelineItem>({
    projectId: input.projectId,
    listProjectRuns,
    mergeStreamEvent,
    onProjectUpdated: input.onProjectUpdated,
    hydrateProject: getProject,
    shouldHydrateProject: (event) => event.type === "project.updated",
  });
}
