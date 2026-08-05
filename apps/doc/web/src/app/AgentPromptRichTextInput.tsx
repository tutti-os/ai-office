import { useMemo, type KeyboardEvent } from "react";
import { RichTextTriggerEditor, type RichTextTriggerEditorProps } from "@tutti-os/ui-rich-text/editor";
import type { AgentComposerInputRenderProps } from "@ai-app/agent/conversation-ui";
import { useI18n } from "../i18n";

const fileMentionProviderIds = ["file"] as const;

export function AgentPromptRichTextInput(props: AgentComposerInputRenderProps) {
  const { t } = useI18n();
  const palette = useMemo<NonNullable<RichTextTriggerEditorProps["palette"]>>(
    () => ({
      categories: [
        {
          id: "files",
          label: t("agent.mentionTabFiles"),
          providerIds: fileMentionProviderIds,
        },
      ],
      defaultCategoryId: "files",
      labels: {
        tabHint: t("agent.mentionPalette"),
        cycleFilter: t("agent.mentionCycleFilter"),
        moveSelection: t("agent.mentionMoveSelection"),
        empty: t("agent.mentionEmpty"),
        listbox: t("agent.mentionPalette"),
      },
      directoryNavigation: {
        providerId: "file",
        labels: {
          back: t("agent.mentionDirectoryBack"),
          enter: t("agent.mentionDirectoryEnter"),
          navigateHierarchy: t("agent.mentionDirectoryNavigate"),
        },
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
    <div className="ai-doc-agent-rich-text-field" onKeyDownCapture={handleKeyDownCapture}>
      <RichTextTriggerEditor
        className="ai-doc-agent-rich-text-root"
        disabled={props.disabled}
        maxResults={30}
        menuZIndex={70}
        minQueryLength={0}
        palette={palette}
        placeholder={props.value.trim() ? "" : props.placeholder}
        placeholderClassName={`${props.className} ai-doc-agent-rich-text-placeholder`}
        textareaClassName={`${props.className} ai-doc-agent-rich-text-editor`}
        textOverrides={{
          loadingLabel: t("agent.mentionLoading"),
          noMatchesLabel: t("agent.mentionEmpty"),
          removeReferenceActionLabel: t("agent.mentionRemove"),
        }}
        value={props.value}
        onChange={props.onChange}
      />
    </div>
  );
}
