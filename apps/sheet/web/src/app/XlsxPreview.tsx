import { useEffect, useMemo, useRef, useState } from "react";
import { scrollbarClass } from "@ai-app/ui/app-shell";
import { cellAddressFromPoint, XlsxRenderer, type XlsxRendererActiveSheet, type XlsxRendererSelection } from "@tutti-os/office-preview/xlsx";
import "@tutti-os/office-preview/styles/xlsx.css";
import type { SpreadsheetRenderWorkbook } from "@tutti-os/office-preview/xlsx";
import { useI18n } from "../i18n";
import type { XlsxSelection } from "../artifact/xlsxArtifactAdapter";

export function XlsxPreview(props: {
  workbook: SpreadsheetRenderWorkbook | null;
  selection: XlsxSelection | null;
  editingReady: boolean;
  loading: boolean;
  error: string;
  saving: boolean;
  onCommitCellValue: (input: { address: string; input: string; sheetId: string; sheetName: string }) => Promise<void>;
  onSelectionChange: (selection: XlsxSelection) => void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const activeSelection = useMemo(() => {
    if (!props.workbook || !props.selection?.sheetId || !props.selection.address) return null;
    const sheet = props.workbook.sheets.find((item) => item.id === props.selection?.sheetId)
      ?? props.workbook.sheets[props.workbook.activeSheetIndex]
      ?? props.workbook.sheets[0]
      ?? null;
    if (!sheet) return null;
    const point = pointFromAddress(props.selection.address);
    const cell = point ? sheet.cellMap[`${point.row}:${point.col}`] : null;
    const displayText = cell?.formula ? `=${cell.formula}` : cell?.clipboardText || cell?.formattedText || props.selection.selectedText || "";
    return {
      address: props.selection.address,
      displayText,
      sheetId: sheet.id,
      sheetName: sheet.name,
    };
  }, [props.selection, props.workbook]);

  useEffect(() => {
    if (editing) return;
    setDraft(activeSelection?.displayText ?? "");
  }, [activeSelection?.address, activeSelection?.displayText, editing]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.cancelable || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(".tsh-xlsx-canvas-scroll, .tsh-xlsx-tabs")
        : null;
      if (!target || !root.contains(target)) return;

      const maxScrollLeft = Math.max(0, target.scrollWidth - target.clientWidth);
      event.preventDefault();
      if (maxScrollLeft <= 0) return;

      const deltaX = normalizeWheelDeltaX(event, target.clientWidth);
      target.scrollLeft = Math.max(0, Math.min(maxScrollLeft, target.scrollLeft + deltaX));
    };

    root.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => root.removeEventListener("wheel", onWheel, { capture: true });
  }, [props.workbook]);

  if (props.loading) {
    return <PreviewState title={t("preview.loadingTitle")} body={t("preview.loadingBody")} />;
  }
  if (props.error) {
    return <PreviewState title={t("preview.errorTitle")} body={props.error} />;
  }
  if (!props.workbook) {
    return <PreviewState title={t("preview.emptyTitle")} body={t("preview.emptyBody")} />;
  }

  const updateSelection = (selection: XlsxRendererSelection | null) => {
    if (!selection) return;
    const address = cellAddressFromPoint(selection.row, selection.col);
    const sheet = props.workbook?.sheets.find((item) => item.id === selection.sheetId);
    const cell = sheet?.cellMap[`${selection.row}:${selection.col}`];
    props.onSelectionChange({
      sheetId: selection.sheetId,
      sheetName: selection.sheetName,
      address,
      selectedText: cell?.clipboardText || cell?.formattedText || "",
    });
    setEditing(false);
  };

  const updateActiveSheet = (sheet: XlsxRendererActiveSheet) => {
    props.onSelectionChange({
      sheetId: sheet.sheetId,
      sheetName: sheet.sheetName,
      address: "A1",
      selectedText: "",
    });
    setEditing(false);
  };

  const commitDraft = async () => {
    if (!activeSelection || !props.editingReady || props.saving) return;
    const nextValue = draft;
    setEditing(false);
    await props.onCommitCellValue({
      address: activeSelection.address,
      input: nextValue,
      sheetId: activeSelection.sheetId,
      sheetName: activeSelection.sheetName,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="grid shrink-0 grid-cols-[90px_minmax(0,1fr)] gap-2 border-b border-[#D8CCBA] bg-[#F4EFE6] px-3 py-2 text-[#2A2620]">
        <div className="grid h-8 place-items-center rounded-md border border-[#C9B89D] bg-white px-2 text-[12px] font-semibold">
          {activeSelection ? activeSelection.address : "A1"}
        </div>
        <form
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            void commitDraft().catch(() => undefined);
          }}
        >
          <input
            className="h-8 w-full rounded-md border border-[#C9B89D] bg-white px-2 text-[13px] outline-none transition focus:border-[#5C6B50] disabled:bg-[#EEE8DC]"
            disabled={!activeSelection || !props.editingReady || props.saving}
            value={draft}
            onBlur={() => {
              if (editing) void commitDraft().catch(() => undefined);
            }}
            onChange={(event) => {
              setEditing(true);
              setDraft(event.target.value);
            }}
            onFocus={() => setEditing(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitDraft().catch(() => undefined);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(activeSelection?.displayText ?? "");
                setEditing(false);
              }
            }}
          />
        </form>
      </div>
      <div
        ref={rootRef}
        className={`min-h-0 flex-1 overflow-hidden bg-white ${scrollbarClass} [&_.tsh-xlsx-canvas-scroll]:bg-white [&_.tsh-xlsx-canvas-viewport]:min-h-0 [&_.tsh-xlsx-renderer]:h-full [&_.tsh-xlsx-renderer]:min-h-0`}
      >
        <XlsxRenderer workbook={props.workbook} onActiveSheetChange={updateActiveSheet} onSelectionChange={updateSelection} />
      </div>
    </div>
  );
}

function pointFromAddress(address: string) {
  const match = address.trim().match(/^\$?([A-Za-z]+)\$?([1-9]\d*)$/);
  if (!match) return null;
  return { col: columnNameToIndex(match[1]), row: Number(match[2]) - 1 };
}

function columnNameToIndex(name: string) {
  let index = 0;
  for (const char of name.trim().toUpperCase()) {
    index = index * 26 + char.charCodeAt(0) - 64;
  }
  return index - 1;
}

function normalizeWheelDeltaX(event: WheelEvent, pageWidth: number) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaX * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaX * pageWidth;
  return event.deltaX;
}

function PreviewState(props: { title: string; body: string }) {
  return (
    <div className="grid h-full min-h-[320px] place-items-center bg-[#F4EFE6] p-8 text-center text-[#2A2620]">
      <div>
        <div className="text-[15px] font-semibold">{props.title}</div>
        <div className="mt-2 max-w-[420px] text-[12px] leading-5 text-[#8B8275]">{props.body}</div>
      </div>
    </div>
  );
}
