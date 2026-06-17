import { AgentConversationPanel as SharedAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { SlideRun, SlideRunEvent, SlideRunTimelineItem } from "@ai-slide/shared";

type AgentConversationPanelProps = {
  activeSelectionText: string;
  dirty: boolean;
  error: string;
  items: SlideRunTimelineItem[];
  loading: boolean;
  sending: boolean;
  onBackHome: () => void;
  onSend: (prompt: string) => Promise<void>;
};

export function AgentConversationPanel(props: AgentConversationPanelProps) {
  return (
    <SharedAgentConversationPanel<SlideRun, SlideRunEvent>
      {...props}
      variant="slide"
      copy={{
        homeLabel: "AI Slides",
        introTitle: "AI Slides Agent",
        introBody: "Pick a slide or describe the change you want. The agent conversation for this deck stays here.",
        emptySelection: "Choose a slide or element to edit it with AI.",
        selectedTitle: "Selected content",
        emptyConversation: "The conversation for this presentation will appear here.",
        placeholder: "Ask AI to edit this deck...",
        quickPrompts: ["Rewrite slide", "Add speaker notes", "Polish story", "Tighten visuals"],
      }}
    />
  );
}
