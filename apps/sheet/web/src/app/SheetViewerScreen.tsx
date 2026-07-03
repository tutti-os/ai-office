import { useMemo } from "react";
import { ArtifactEditorWorkspace, type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import type { LocalAgentProviderStatus, ProjectDetailResponse, RuntimeProfile, SheetRunTimelineItem } from "@ai-sheet/shared";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { XlsxPreview } from "./XlsxPreview";
import { artifactEditorCopy } from "../i18n/copy";
import { useI18n } from "../i18n";
import type { XlsxRuntimeState, XlsxSelection } from "../artifact/xlsxArtifactAdapter";

export function SheetViewerScreen(props: {
  detail: ProjectDetailResponse;
  runtime: XlsxRuntimeState | null;
  loading: boolean;
  error: string;
  saveState: ArtifactSaveState;
  exportMessage: string;
  exporting: boolean;
  conversationError: string;
  conversationItems: SheetRunTimelineItem[];
  conversationLoading: boolean;
  localAgentProviders: LocalAgentProviderStatus[];
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  selectionRestoreKey: number;
  sending: boolean;
  onCommitCellValue: (input: { address: string; input: string; sheetId: string; sheetName: string }) => Promise<void>;
  onBackHome: () => void;
  onCancelAgentRun: (runId: string) => Promise<void>;
  onExportXlsx: () => void | Promise<void>;
  onOpenExportLocation: () => void;
  onSelectionChange: (selection: XlsxSelection) => void;
  onRuntimeProfileChange: (profileId: string) => void;
  onDismissExport: () => void;
  onSendPrompt: (prompt: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const manifest = props.detail.xlsxManifest;
  const sheets = props.runtime?.renderWorkbook?.sheets.length ?? 0;
  const activeSelectionText = useMemo(() => {
    const selection = props.runtime?.selection;
    if (!selection?.address) return "";
    return `${selection.sheetName || "Sheet"}!${selection.address}`;
  }, [props.runtime?.selection]);
  const stats = [
    manifest?.exists ? `${formatBytes(manifest.sizeBytes)} XLSX` : t("editor.noFile"),
    sheets ? t("editor.sheetCount", { count: sheets }) : props.detail.artifact.type.toUpperCase(),
    t("editor.revision", { revision: props.detail.artifact.revision }),
  ];

  return (
    <ArtifactEditorWorkspace
      title={props.detail.project.title}
      saveState={props.saveState}
      stats={stats}
      copy={artifactEditorCopy(t)}
      exportItems={[
        {
          label: props.exporting ? t("editor.xlsxExporting") : t("editor.xlsxCopy"),
          disabled: !manifest?.exists || props.exporting,
          loading: props.exporting,
          onSelect: props.onExportXlsx,
        },
      ]}
      exportNotice={props.exportMessage}
      bodyClassName="bg-white"
      tone="lumen"
      onBackHome={props.onBackHome}
      onDismissExportNotice={props.onDismissExport}
      onOpenExportLocation={props.onOpenExportLocation}
      sidebar={
        <AgentConversationPanel
          activeSelectionLabel={t("agent.activeSelection")}
          activeSelectionText={activeSelectionText}
          activeSelectionVisible={Boolean(activeSelectionText)}
          artifactLabel="xlsx"
          dirty={false}
          error={props.conversationError || props.error}
          items={props.conversationItems}
          localAgentProviders={props.localAgentProviders}
          loading={props.loading || props.conversationLoading}
          runtimeProfiles={props.runtimeProfiles}
          selectedRuntimeProfileId={props.selectedRuntimeProfileId}
          sending={props.sending}
          onBackHome={props.onBackHome}
          onCancel={props.onCancelAgentRun}
          onRuntimeProfileChange={props.onRuntimeProfileChange}
          onSend={props.onSendPrompt}
        />
      }
    >
      <XlsxPreview
        workbook={props.runtime?.renderWorkbook ?? null}
        selection={props.runtime?.selection ?? null}
        selectionRestoreKey={props.selectionRestoreKey}
        editingReady={Boolean(props.runtime?.editor)}
        loading={props.loading}
        error={props.error}
        saving={props.saveState === "saving"}
        onCommitCellValue={props.onCommitCellValue}
        onSelectionChange={props.onSelectionChange}
      />
    </ArtifactEditorWorkspace>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
