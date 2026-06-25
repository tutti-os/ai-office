import { ArtifactAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import type { LocalAgentProviderStatus, RuntimeProfile, SlideRun, SlideRunEvent, SlideRunTimelineItem } from "@ai-slide/shared";
import { agentConversationUiCopy } from "../i18n/copy";
import { useI18n } from "../i18n";

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
  const { t } = useI18n();
  return (
    <ArtifactAgentConversationPanel<SlideRun, SlideRunEvent>
      {...props}
      copy={{
        homeLabel: t("app.title"),
        introTitle: t("agent.introTitle"),
        introBody: t("agent.introBody"),
        placeholder: t("agent.placeholder"),
        quickPrompts: [t("agent.quickRewrite"), t("agent.quickNotes"), t("agent.quickPolish"), t("agent.quickTighten")],
      }}
      uiCopy={agentConversationUiCopy(t)}
      formatUnavailableRuntimeProfileLabel={(profile) => `${profile.displayName} ${t("composer.agentUnavailable")}`}
      selectedRuntimeProfileId={props.selectedAgent}
      onRuntimeProfileChange={props.onSelectedAgentChange}
    />
  );
}
