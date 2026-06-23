import { ArtifactAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import type { LocalAgentProviderStatus, RuntimeProfile, SlideRun, SlideRunEvent, SlideRunTimelineItem } from "@ai-slide/shared";

type AgentConversationPanelProps = {
  activeSelectionLabel?: string;
  activeSelectionText: string;
  activeSelectionVisible?: boolean;
  artifactLabel: Extract<ArtifactEditorKind, "deck" | "pptx">;
  dirty: boolean;
  error: string;
  items: SlideRunTimelineItem[];
  localAgentProviders: LocalAgentProviderStatus[];
  loading: boolean;
  runtimeProfiles: RuntimeProfile[];
  selectedAgent: string;
  sending: boolean;
  onBackHome: () => void;
  onSelectedAgentChange: (value: string) => void;
  onCancel: (runId: string) => Promise<void>;
  onSend: (prompt: string) => Promise<void>;
};

export function AgentConversationPanel(props: AgentConversationPanelProps) {
  return (
    <ArtifactAgentConversationPanel<SlideRun, SlideRunEvent>
      {...props}
      copy={{
        homeLabel: "AI Slide",
        introTitle: "AI Slides Agent",
        introBody: "Click a slide element or select text, then ask for edits to the story, copy, notes, or visuals.",
        placeholder: "Ask AI to edit this deck...",
        quickPrompts: ["Rewrite slide", "Add speaker notes", "Polish story", "Tighten visuals"],
      }}
      formatUnavailableRuntimeProfileLabel={(profile) => `${profile.displayName} unavailable`}
      selectedRuntimeProfileId={props.selectedAgent}
      onRuntimeProfileChange={props.onSelectedAgentChange}
    />
  );
}
