import { useEffect, useMemo, useState } from "react";
import { Check, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { ArtifactEditorFrame, ArtifactExportToast, ArtifactWorkspaceHeader, type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import type { OfficeCliStatus, ProjectDetailResponse, SheetCommand } from "@ai-sheet/shared";
import { XlsxPreview } from "./XlsxPreview";
import type { XlsxRuntimeState } from "../artifact/xlsxArtifactAdapter";

export function SheetViewerScreen(props: {
  detail: ProjectDetailResponse;
  runtime: XlsxRuntimeState | null;
  loading: boolean;
  error: string;
  saveState: ArtifactSaveState;
  exportMessage: string;
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  onBackHome: () => void;
  onApplyCommand: (command: SheetCommand) => void;
  onExportXlsx: () => void;
  onInstallOfficeCli: () => void;
  onOpenExportLocation: () => void;
  onDismissExport: () => void;
}) {
  const manifest = props.detail.xlsxManifest;
  const sheets = props.runtime?.renderWorkbook?.sheets ?? [];
  const [sheetId, setSheetId] = useState("");
  const [address, setAddress] = useState("A1");
  const [input, setInput] = useState("");
  const selectedSheet = useMemo(() => sheets.find((sheet) => sheet.id === sheetId) ?? sheets[0] ?? null, [sheetId, sheets]);
  const officeCliReady = props.officeCliStatus?.available === true;
  const officeCliBusy = props.officeCliInstalling || props.officeCliStatus?.installing === true;
  const stats = [
    manifest?.exists ? `${formatBytes(manifest.sizeBytes)} XLSX` : "No file",
    props.detail.artifact.type.toUpperCase(),
    `Revision ${props.detail.artifact.revision}`,
  ];

  useEffect(() => {
    const nextSheet = props.runtime?.selection.sheetId ?? sheets[0]?.id ?? "";
    if (nextSheet && nextSheet !== sheetId) setSheetId(nextSheet);
  }, [props.runtime?.selection.sheetId, sheetId, sheets]);

  useEffect(() => {
    const nextAddress = props.runtime?.selection.address || "A1";
    setAddress(nextAddress);
  }, [props.runtime?.selection.address]);

  const submitCellValue = () => {
    if (!selectedSheet) return;
    props.onApplyCommand({
      type: "set-cell-value",
      sheetId: selectedSheet.id,
      sheetName: selectedSheet.name,
      address: address.trim().toUpperCase() || "A1",
      input,
    });
  };

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
            <div className="mt-6 border-t border-[#B8A07C]/45 pt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#B8A07C]">Cell</div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-[#8B8275]">{formatOfficeCliStatus(props.officeCliStatus)}</span>
                {!officeCliReady && props.officeCliStatus?.canInstall ? (
                  <button
                    className="inline-flex h-7 shrink-0 items-center justify-center gap-1 border border-[#B8A07C]/55 bg-white px-2 font-semibold text-[#5C6B50] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={officeCliBusy}
                    onClick={props.onInstallOfficeCli}
                    title="Download OfficeCLI"
                    type="button"
                  >
                    {officeCliBusy ? <Loader2 className="animate-spin" size={13} /> : <Download size={13} />}
                    Install
                  </button>
                ) : null}
              </div>
              <select
                className="mt-2 h-9 w-full border border-[#B8A07C]/55 bg-white px-2 text-[12px] text-[#2A2620] outline-none"
                disabled={!sheets.length}
                onChange={(event) => setSheetId(event.target.value)}
                value={selectedSheet?.id ?? ""}
              >
                {sheets.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.name}
                  </option>
                ))}
              </select>
              <input
                className="mt-2 h-9 w-full border border-[#B8A07C]/55 bg-white px-2 text-[12px] font-semibold uppercase text-[#2A2620] outline-none"
                onChange={(event) => setAddress(event.target.value)}
                placeholder="A1"
                value={address}
              />
              <input
                className="mt-2 h-9 w-full border border-[#B8A07C]/55 bg-white px-2 text-[12px] text-[#2A2620] outline-none"
                onChange={(event) => setInput(event.target.value)}
                placeholder="Value"
                value={input}
              />
              <button
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 bg-[#5C6B50] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedSheet || props.saveState === "saving" || !officeCliReady}
                onClick={submitCellValue}
                title={!officeCliReady ? props.officeCliStatus?.reason ?? "OfficeCLI is required for XLSX editing" : undefined}
                type="button"
              >
                <Check size={14} />
                Apply
              </button>
            </div>
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
        <XlsxPreview workbook={props.runtime?.renderWorkbook ?? null} loading={props.loading} error={props.error} />
      </div>
    </ArtifactEditorFrame>
  );
}

function formatOfficeCliStatus(status: OfficeCliStatus | null) {
  if (!status) return "Checking OfficeCLI";
  if (status.available) return status.version ? `OfficeCLI ${status.version}` : "OfficeCLI ready";
  if (status.installing) return "Installing OfficeCLI";
  return "OfficeCLI required for save";
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
