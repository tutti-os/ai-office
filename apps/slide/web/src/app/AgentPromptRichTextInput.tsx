import { useMemo, type KeyboardEvent } from "react";
import { RichTextTriggerEditor, type RichTextTriggerEditorProps } from "@tutti-os/ui-rich-text/editor";
import type { AgentComposerInputRenderProps } from "@ai-app/agent/conversation-ui";
import type { RichTextTriggerProvider } from "@tutti-os/ui-rich-text/types";
import { useI18n } from "../i18n";
import { createTuttiExternalAgentContextMentionProviders } from "./tuttiAtMentions";

const appMentionProviderIds = ["workspace-app"] as const;
const agentMentionProviderIds = ["agent-target"] as const;

export function AgentPromptRichTextInput(props: AgentComposerInputRenderProps) {
  const { t } = useI18n();
  const triggerProviders = useMemo<readonly RichTextTriggerProvider<any>[]>(
    () => createTuttiExternalAgentContextMentionProviders(),
    [],
  );
  const palette = useMemo<NonNullable<RichTextTriggerEditorProps["palette"]>>(
    () => ({
      categories: [
        {
          id: "apps",
          label: t("agent.mentionTabApps"),
          providerIds: appMentionProviderIds,
        },
        {
          id: "agents",
          label: t("agent.mentionTabAgents"),
          providerIds: agentMentionProviderIds,
        },
      ],
      defaultCategoryId: "agents",
      labels: {
        tabHint: t("agent.mentionPalette"),
        cycleFilter: t("agent.mentionCycleFilter"),
        moveSelection: t("agent.mentionMoveSelection"),
        empty: t("agent.mentionEmpty"),
        listbox: t("agent.mentionPalette"),
      },
      maxHeightPx: 320,
    }),
    [t],
  );

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector(".tutti-rich-text-at-menu")) return;

    event.preventDefault();
    props.onSubmit();
  };

  return (
    <div className="ai-slide-agent-rich-text-field" onKeyDownCapture={handleKeyDownCapture}>
      <RichTextTriggerEditor
        className="ai-slide-agent-rich-text-root"
        disabled={props.disabled}
        maxResults={30}
        menuZIndex={70}
        minQueryLength={0}
        palette={palette}
        placeholder={props.value.trim() ? "" : props.placeholder}
        placeholderClassName={`${props.className} ai-slide-agent-rich-text-placeholder`}
        textareaClassName={`${props.className} ai-slide-agent-rich-text-editor`}
        textOverrides={{
          loadingLabel: t("agent.mentionLoading"),
          noMatchesLabel: t("agent.mentionEmpty"),
          removeReferenceActionLabel: t("agent.mentionRemove"),
        }}
        triggerProviders={triggerProviders}
        value={props.value}
        onChange={props.onChange}
      />
    </div>
  );
}
