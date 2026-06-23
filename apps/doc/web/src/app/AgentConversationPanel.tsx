import { ArtifactAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import type { DocumentRun, DocumentRunEvent, DocumentRunTimelineItem, LocalAgentProviderStatus, RuntimeProfile } from "@ai-doc/shared";

type AgentConversationPanelProps = {
  activeSelectionText: string;
  artifactLabel: Extract<ArtifactEditorKind, "html" | "markdown" | "docx">;
  dirty: boolean;
  error: string;
  items: DocumentRunTimelineItem[];
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
    <ArtifactAgentConversationPanel<DocumentRun, DocumentRunEvent>
      {...props}
      copy={{
        homeLabel: "AI Doc",
        introTitle: "AI Doc Agent",
        introBody: "Select text in the doc, then ask for a rewrite, continuation, polish, or structural edit.",
        placeholder: "Ask AI to edit this doc...",
        quickPrompts: ["Rewrite selection", "Continue writing", "Polish tone", "Format section"],
      }}
      formatUnavailableRuntimeProfileLabel={(profile, provider) => `${profile.displayName} (${provider?.authState ?? "unknown"})`}
      selectedRuntimeProfileId={props.selectedRuntimeProfileId}
      onRuntimeProfileChange={props.onRuntimeProfileChange}
    />
  );
}
