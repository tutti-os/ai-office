import type { AgentConversationUiCopy } from "@ai-app/agent/conversation-ui";
import type { ArtifactHistoryCopy } from "@ai-app/ui/app-shell";
import type { ArtifactEditorCopy } from "@ai-app/ui/editor-frame";
import type { useI18n } from "./index";

type TFunction = ReturnType<typeof useI18n>["t"];

export function artifactEditorCopy(t: TFunction): ArtifactEditorCopy {
  return {
    agentWorking: t("editor.agentWorking"),
    backHome: t("editor.backHome"),
    dismiss: t("common.dismiss"),
    dismissExportNotice: t("editor.dismissExportNotice"),
    export: t("editor.export"),
    exporting: t("editor.exporting"),
    loading: t("editor.loading"),
    saveError: t("editor.saveError"),
    saved: t("editor.saved"),
    saving: t("editor.saving"),
  };
}

export function artifactHistoryCopy(t: TFunction): ArtifactHistoryCopy {
  return {
    clearHistory: t("history.clearHistory"),
    deleteProject: t("history.deleteProject"),
    deleteProjectAria: (title) => t("history.deleteProjectAria", { title }),
    openProjectAria: (title) => t("history.openProjectAria", { title }),
  };
}

export function agentConversationUiCopy(t: TFunction): AgentConversationUiCopy {
  return {
    accepted: t("agent.status.accepted"),
    activeSelection: t("editor.selectedText"),
    cancelled: t("agent.status.cancelled"),
    completed: t("agent.status.completed"),
    failed: t("agent.status.failed"),
    running: t("agent.status.running"),
    selectAgent: t("composer.selectAgent"),
    stopAgent: t("agent.stop"),
    thinking: t("agent.thinking"),
    tool: {
      error: t("agent.tool.error"),
      failed: t("agent.tool.failed"),
      input: t("agent.tool.input"),
      readDoc: t("agent.tool.readDoc"),
      readSlide: t("agent.tool.readSlide"),
      result: t("agent.tool.result"),
      running: t("agent.tool.running"),
      saveDoc: t("agent.tool.saveDoc"),
      saveSlide: t("agent.tool.saveSlide"),
      done: t("agent.tool.done"),
      toolResult: t("agent.tool.resultTitle"),
    },
  };
}
