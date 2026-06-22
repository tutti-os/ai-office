import { AgentConversationPanel as SharedAgentConversationPanel } from "@ai-app/agent/conversation-ui";
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
    <SharedAgentConversationPanel<SlideRun, SlideRunEvent>
      {...props}
      agentOptions={props.runtimeProfiles.map((profile) => {
        const status = profile.kind === "local-agent" ? props.localAgentProviders.find((provider) => provider.provider === profile.provider) : null;
        const available = status?.available ?? true;
        return {
          id: profile.id,
          label: available ? profile.displayName : `${profile.displayName} unavailable`,
          disabled: !available,
        };
      })}
      selectedAgentId={props.selectedAgent}
      variant="document"
      copy={{
        homeLabel: "AI Slide",
        introTitle: "AI Slides Agent",
        introBody: "Click a slide element or select text, then ask for edits to the story, copy, notes, or visuals.",
        placeholder: "Ask AI to edit this deck...",
        quickPrompts: ["Rewrite slide", "Add speaker notes", "Polish story", "Tighten visuals"],
      }}
      onAgentChange={props.onSelectedAgentChange}
    />
  );
}
