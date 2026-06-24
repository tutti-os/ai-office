import { ArtifactAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import type { LocalAgentProviderStatus, RuntimeProfile, SheetRun, SheetRunEvent, SheetRunTimelineItem } from "@ai-sheet/shared";

type AgentConversationPanelProps = {
  activeSelectionLabel?: string;
  activeSelectionText: string;
  activeSelectionVisible?: boolean;
  artifactLabel: Extract<ArtifactEditorKind, "xlsx">;
  dirty: boolean;
  error: string;
  items: SheetRunTimelineItem[];
  localAgentProviders: LocalAgentProviderStatus[];
  loading: boolean;
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  sending: boolean;
  onBackHome: () => void;
  onRuntimeProfileChange: (profileId: string) => void;
  onCancel: (runId: string) => Promise<void>;
  onSend: (prompt: string) => Promise<void>;
};

export function AgentConversationPanel(props: AgentConversationPanelProps) {
  return (
    <ArtifactAgentConversationPanel<SheetRun, SheetRunEvent>
      {...props}
      quickPromptsVisible={false}
      copy={{
        homeLabel: "AI Sheet",
        introTitle: "AI Sheet Agent",
        introBody: "Select cells in the workbook, then ask for edits, formulas, cleanup, or analysis.",
        placeholder: "Ask AI to edit this sheet...",
        quickPrompts: [],
      }}
      formatUnavailableRuntimeProfileLabel={(profile, provider) => `${profile.displayName} (${provider?.authState ?? "unknown"})`}
      selectedRuntimeProfileId={props.selectedRuntimeProfileId}
      onRuntimeProfileChange={props.onRuntimeProfileChange}
    />
  );
}
