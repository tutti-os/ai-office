import { useCallback, useMemo, useState } from "react";
import { ArtifactEditorFrame, ArtifactExportToast, ArtifactWorkspaceHeader, type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import type { ProjectDetailResponse } from "@ai-sheet/shared";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { XlsxPreview } from "./XlsxPreview";
import type { XlsxRuntimeState } from "../artifact/xlsxArtifactAdapter";

export function SheetViewerScreen(props: {
  detail: ProjectDetailResponse;
  runtime: XlsxRuntimeState | null;
  loading: boolean;
  error: string;
  saveState: ArtifactSaveState;
  exportMessage: string;
  onBackHome: () => void;
  onExportXlsx: () => void;
  onOpenExportLocation: () => void;
  onDismissExport: () => void;
}) {
  const [conversationError, setConversationError] = useState("");
  const manifest = props.detail.xlsxManifest;
  const sheets = props.runtime?.renderWorkbook?.sheets.length ?? 0;
  const activeSelectionText = useMemo(() => {
    const selection = props.runtime?.selection;
    if (!selection?.address) return "";
    return `${selection.sheetName || "Sheet"}!${selection.address}`;
  }, [props.runtime?.selection]);
  const stats = [
    manifest?.exists ? `${formatBytes(manifest.sizeBytes)} XLSX` : "No file",
    sheets ? `${sheets} sheets` : props.detail.artifact.type.toUpperCase(),
    `Revision ${props.detail.artifact.revision}`,
  ];
  const sendComingSoonPrompt = useCallback(async () => {
    const message = "Smart Sheet agent is coming soon. XLSX source viewing and export are available now.";
    setConversationError(message);
  }, []);

  return (
    <ArtifactEditorFrame
      className="bg-[#E6DDCD] text-[#2A2620]"
      sidebar={
        <AgentConversationPanel
          activeSelectionLabel="Active cell"
          activeSelectionText={activeSelectionText}
          activeSelectionVisible={false}
          artifactLabel="xlsx"
          dirty={false}
          error={conversationError || props.error}
          items={[]}
          loading={props.loading}
          sending={false}
          onBackHome={props.onBackHome}
          onSend={sendComingSoonPrompt}
        />
      }
    >
      <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#E6DDCD] text-[#2A2620]">
        <ArtifactWorkspaceHeader
          title={props.detail.project.title}
          saveState={props.saveState}
          stats={stats}
          exportItems={[{ label: "XLSX copy", disabled: !manifest?.exists, onSelect: props.onExportXlsx }]}
          onBackHome={props.onBackHome}
          tone="lumen"
        />
        <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
          <ArtifactExportToast message={props.exportMessage} onClose={props.onDismissExport} onOpenLocation={props.onOpenExportLocation} />
          <XlsxPreview workbook={props.runtime?.renderWorkbook ?? null} loading={props.loading} error={props.error} />
        </div>
      </section>
    </ArtifactEditorFrame>
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
