import { ArtifactAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import { appShell } from "@ai-app/ui/app-shell";
import { TuttiReferenceAddControl } from "@ai-app/ui/tutti-reference-add-control";
import type { DocumentRun, DocumentRunEvent, DocumentRunTimelineItem, LocalAgentTargetStatus, RuntimeProfile } from "@ai-doc/shared";
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
      formatUnavailableRuntimeProfileLabel={(profile, target) => `${profile.displayName} (${target?.authState ?? t("agent.unknown")})`}
      renderComposerLeadingAction={(inputProps) => (
        <TuttiReferenceAddControl
          className={appShell.iconAction}
          disabled={inputProps.disabled}
          labels={{
            addContent: t("composer.addContent"),
            browseReferences: t("composer.browseReferences"),
            uploadFile: t("composer.addContext"),
          }}
          value={inputProps.value}
          onChange={inputProps.onChange}
        />
      )}
      renderComposerInput={(inputProps) => <AgentPromptRichTextInput {...inputProps} />}
      renderUserMessageText={(messageProps) => <AgentUserMessageRichText {...messageProps} />}
      selectedRuntimeProfileId={props.selectedRuntimeProfileId}
      onRuntimeProfileChange={props.onRuntimeProfileChange}
    />
  );
}
