import { FileSpreadsheet } from "lucide-react";
import { ArtifactEditorFrame, ArtifactExportToast, ArtifactWorkspaceHeader, type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import type { ProjectDetailResponse } from "@ai-sheet/shared";
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
  const manifest = props.detail.xlsxManifest;
  const stats = [
    manifest?.exists ? `${formatBytes(manifest.sizeBytes)} XLSX` : "No file",
    props.detail.artifact.type.toUpperCase(),
    `Revision ${props.detail.artifact.revision}`,
  ];

  return (
    <ArtifactEditorFrame
      className="grid-cols-[320px_minmax(0,1fr)] bg-[#E6DDCD] text-[#2A2620]"
      sidebar={
        <aside className="flex min-h-0 flex-col border-r border-[#B8A07C]/45 bg-[#F4EFE6]">
          <div className="border-b border-[#B8A07C]/45 p-5">
            <div className="grid size-10 place-items-center rounded-[15px] bg-[#5C6B50] text-[#F4EFE6]">
              <FileSpreadsheet size={19} />
            </div>
            <div className="mt-4 truncate text-[15px] font-semibold">{props.detail.project.title}</div>
            <div className="mt-1 text-[12px] font-medium text-[#8B8275]">XLSX viewer</div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-5 text-[12px] leading-5 text-[#8B8275]">
            <InfoRow label="File" value={manifest?.fileName ?? "workbook.xlsx"} />
            <InfoRow label="Size" value={manifest?.exists ? formatBytes(manifest.sizeBytes) : "No file"} />
            <InfoRow label="Updated" value={manifest?.updatedAt ? formatDate(manifest.updatedAt) : "Never"} />
          </div>
        </aside>
      }
      contentClassName="grid-rows-[48px_minmax(0,1fr)]"
    >
      <ArtifactWorkspaceHeader
        title={props.detail.project.title}
        saveState={props.saveState}
        stats={stats}
        exportItems={[{ label: "XLSX copy", disabled: !manifest?.exists, onSelect: props.onExportXlsx }]}
        onBackHome={props.onBackHome}
        tone="lumen"
      />
      <div className="relative min-h-0 overflow-hidden">
        <ArtifactExportToast message={props.exportMessage} onClose={props.onDismissExport} onOpenLocation={props.onOpenExportLocation} />
        <XlsxPreview preview={props.runtime?.preview ?? null} loading={props.loading} error={props.error} />
      </div>
    </ArtifactEditorFrame>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#B8A07C]">{props.label}</div>
      <div className="mt-1 break-words text-[#2A2620]">{props.value}</div>
    </div>
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
