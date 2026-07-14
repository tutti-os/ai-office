import { ArtifactAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import type { LocalAgentTargetStatus, RuntimeProfile, SheetRun, SheetRunEvent, SheetRunTimelineItem } from "@ai-sheet/shared";
import { agentConversationUiCopy } from "../i18n/copy";
import { useI18n } from "../i18n";

type AgentConversationPanelProps = {
  activeSelectionLabel?: string;
  activeSelectionText: string;
  activeSelectionVisible?: boolean;
  artifactLabel: Extract<ArtifactEditorKind, "xlsx">;
  dirty: boolean;
  error: string;
  items: SheetRunTimelineItem[];
  localAgentTargets: LocalAgentTargetStatus[];
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
  const { t } = useI18n();
  return (
    <ArtifactAgentConversationPanel<SheetRun, SheetRunEvent>
      {...props}
      quickPromptsVisible={false}
      copy={{
        homeLabel: t("app.title"),
        introTitle: t("agent.introTitle"),
        introBody: t("agent.introBody"),
        placeholder: t("agent.placeholder"),
        quickPrompts: [],
      }}
      uiCopy={agentConversationUiCopy(t)}
      formatUnavailableRuntimeProfileLabel={(profile, target) => `${profile.displayName} (${target?.authState ?? t("agent.unknown")})`}
      selectedRuntimeProfileId={props.selectedRuntimeProfileId}
      onRuntimeProfileChange={props.onRuntimeProfileChange}
    />
  );
}
