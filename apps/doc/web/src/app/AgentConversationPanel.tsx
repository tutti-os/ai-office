import { AgentConversationPanel as SharedAgentConversationPanel } from "@ai-app/agent/conversation-ui";
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
    <SharedAgentConversationPanel<DocumentRun, DocumentRunEvent>
      {...props}
      agentOptions={props.runtimeProfiles.map((profile) => {
        const provider = profile.kind === "local-agent" ? props.localAgentProviders.find((item) => item.provider === profile.provider) : null;
        return {
          id: profile.id,
          label: formatRuntimeProfileLabel(profile, props.localAgentProviders),
          disabled: provider ? !provider.available : false,
        };
      })}
      selectedAgentId={props.selectedRuntimeProfileId}
      variant="document"
      copy={{
        homeLabel: "AI Doc",
        introTitle: "AI Doc Agent",
        introBody: "Select text in the doc, then ask for a rewrite, continuation, polish, or structural edit.",
        placeholder: "Ask AI to edit this doc...",
        quickPrompts: ["Rewrite selection", "Continue writing", "Polish tone", "Format section"],
      }}
      onAgentChange={props.onRuntimeProfileChange}
    />
  );
}

function formatRuntimeProfileLabel(profile: RuntimeProfile, providers: LocalAgentProviderStatus[]) {
  if (profile.kind !== "local-agent") return profile.displayName;
  const provider = providers.find((item) => item.provider === profile.provider);
  if (!provider || provider.available) return profile.displayName;
  return `${profile.displayName} (${provider.authState})`;
}
