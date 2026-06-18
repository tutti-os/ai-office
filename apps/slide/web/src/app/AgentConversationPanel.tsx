import { AgentConversationPanel as SharedAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import type { SlideRun, SlideRunEvent, SlideRunTimelineItem } from "@ai-slide/shared";

type AgentConversationPanelProps = {
  activeSelectionText: string;
  artifactLabel: Extract<ArtifactEditorKind, "deck" | "pptx">;
  dirty: boolean;
  error: string;
  items: SlideRunTimelineItem[];
  loading: boolean;
  sending: boolean;
  onBackHome: () => void;
  onCancel: (runId: string) => Promise<void>;
  onSend: (prompt: string) => Promise<void>;
};

export function AgentConversationPanel(props: AgentConversationPanelProps) {
  return (
    <SharedAgentConversationPanel<SlideRun, SlideRunEvent>
      {...props}
      variant="slide"
      copy={{
        homeLabel: "AI Slide",
        introTitle: "AI Slides Agent",
        introBody: "Click a slide element or select text, then ask for edits to the story, copy, notes, or visuals.",
        placeholder: "Ask AI to edit this deck...",
        quickPrompts: ["Rewrite slide", "Add speaker notes", "Polish story", "Tighten visuals"],
      }}
    />
  );
}
