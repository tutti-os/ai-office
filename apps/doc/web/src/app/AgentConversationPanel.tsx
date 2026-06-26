import { ArtifactAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import type { DocumentRun, DocumentRunEvent, DocumentRunTimelineItem, LocalAgentProviderStatus, RuntimeProfile } from "@ai-doc/shared";
import { agentConversationUiCopy } from "../i18n/copy";
import { useI18n } from "../i18n";
import { AgentPromptRichTextInput } from "./AgentPromptRichTextInput";
import { AgentUserMessageRichText } from "./AgentUserMessageRichText";

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
  const { t } = useI18n();
  return (
    <ArtifactAgentConversationPanel<DocumentRun, DocumentRunEvent>
      {...props}
      copy={{
        homeLabel: t("app.title"),
        introTitle: t("agent.introTitle"),
        introBody: t("agent.introBody"),
        placeholder: t("agent.placeholder"),
        quickPrompts: [t("agent.quickRewrite"), t("agent.quickContinue"), t("agent.quickPolish"), t("agent.quickFormat")],
      }}
      uiCopy={agentConversationUiCopy(t)}
      formatUnavailableRuntimeProfileLabel={(profile, provider) => `${profile.displayName} (${provider?.authState ?? t("agent.unknown")})`}
      renderComposerInput={(inputProps) => <AgentPromptRichTextInput {...inputProps} />}
      renderUserMessageText={(messageProps) => <AgentUserMessageRichText {...messageProps} />}
      selectedRuntimeProfileId={props.selectedRuntimeProfileId}
      onRuntimeProfileChange={props.onRuntimeProfileChange}
    />
  );
}
