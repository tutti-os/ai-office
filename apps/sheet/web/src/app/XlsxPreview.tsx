import { useEffect, useMemo, useRef, useState } from "react";
import { scrollbarClass } from "@ai-app/ui/app-shell";
import {
  cellAddressFromPoint,
  XlsxRenderer,
  type XlsxRendererActiveSheet,
  type XlsxRendererFocusSelection,
  type XlsxRendererGeometry,
  type XlsxRendererSelection,
} from "@tutti-os/office-preview/xlsx";
import "@tutti-os/office-preview/styles/xlsx.css";
import type { SpreadsheetRenderWorkbook } from "@tutti-os/office-preview/xlsx";
import { useI18n } from "../i18n";
import type { XlsxSelection } from "../artifact/xlsxArtifactAdapter";

const FORMULA_REFERENCE_COLORS = ["#3B82F6", "#F97316", "#10B981", "#A855F7", "#EF4444", "#06B6D4", "#EAB308", "#EC4899"];
const ROW_HEADER_WIDTH_PX = 58;
const COLUMN_HEADER_HEIGHT_PX = 28;

type FormulaReference = {
  address: string;
  color: string;
  end: number;
  range: { start: { col: number; row: number }; end: { col: number; row: number } };
  sheetId: string | null;
  sheetName: string | null;
  start: number;
  token: string;
};

type FormulaRangeDrag = {
  anchor: { col: number; row: number };
  focus: { col: number; row: number };
  sheetId: string;
  sheetName: string;
};

export function XlsxPreview(props: {
  workbook: SpreadsheetRenderWorkbook | null;
  selection: XlsxSelection | null;
  selectionRestoreKey: number;
  editingReady: boolean;
  loading: boolean;
  error: string;
  saving: boolean;
  onCommitCellValue: (input: { address: string; input: string; sheetId: string; sheetName: string }) => Promise<void>;
  onSelectionChange: (selection: XlsxSelection) => void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formulaDragRef = useRef<FormulaRangeDrag | null>(null);
  const suppressFormulaSelectionRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [formulaDrag, setFormulaDrag] = useState<FormulaRangeDrag | null>(null);
  const [rendererGeometry, setRendererGeometry] = useState<XlsxRendererGeometry | null>(null);
  const [inputSelection, setInputSelection] = useState({ end: 0, start: 0 });
  const [viewport, setViewport] = useState({ height: 0, left: 0, top: 0, width: 0 });
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
  const formulaMode = isFormulaDraft(draft);
  const formulaReferences = useMemo(
    () => parseFormulaReferences(draft, props.workbook, activeSelection),
    [activeSelection, draft, props.workbook],
  );
  const overlaySheet = rendererGeometry?.sheet ?? null;
  const formulaReferencePreview = useMemo(() => {
    if (!formulaDrag) return formulaReferences;
    const preview = formulaPreviewReferenceForDrag(formulaDrag, activeSelection, inputSelection, formulaReferences);
    const replacement = formulaReplacementRange(inputSelection, formulaReferences);
    return [
      ...formulaReferences.filter((reference) => reference.end <= replacement.start || reference.start >= replacement.end),
      preview,
    ];
  }, [activeSelection, formulaDrag, formulaReferences, inputSelection]);
  const restoreTarget = useMemo(() => {
    if (!props.workbook || !props.selection?.sheetId || !props.selection.address) return null;
    const sheetIndex = props.workbook.sheets.findIndex((item) => item.id === props.selection?.sheetId || item.name === props.selection?.sheetName);
    const sheet = sheetIndex >= 0 ? props.workbook.sheets[sheetIndex] : null;
    const point = pointFromAddress(props.selection.address);
    if (!sheet || !point) return null;
    return {
      key: `${sheet.id}:${props.selection.address.toUpperCase()}`,
      point,
      sheet,
    };
  }, [props.selection?.address, props.selection?.sheetId, props.selection?.sheetName, props.workbook]);
  const focusSelection = useMemo<XlsxRendererFocusSelection | null>(() => {
    if (props.selectionRestoreKey <= 0 || !restoreTarget) return null;
    return {
      col: restoreTarget.point.col,
      key: props.selectionRestoreKey,
      row: restoreTarget.point.row,
      scrollIntoView: true,
      sheetId: restoreTarget.sheet.id,
      sheetName: restoreTarget.sheet.name,
    };
  }, [props.selectionRestoreKey, restoreTarget]);

  useEffect(() => {
    if (editing) return;
    setDraft(activeSelection?.displayText ?? "");
  }, [activeSelection?.address, activeSelection?.displayText, editing]);

  useEffect(() => {
    if (!editing) setInputSelection({ end: draft.length, start: draft.length });
  }, [draft.length, editing]);

  useEffect(() => {
    formulaDragRef.current = formulaDrag;
  }, [formulaDrag]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const updateViewport = () => {
      const scroll = root.querySelector<HTMLElement>(".tsh-xlsx-canvas-scroll");
      if (!scroll) return;
      setViewport({
        height: scroll.clientHeight,
        left: scroll.scrollLeft,
        top: scroll.scrollTop,
        width: scroll.clientWidth,
      });
    };
    const frame = window.requestAnimationFrame(updateViewport);
    const scroll = root.querySelector<HTMLElement>(".tsh-xlsx-canvas-scroll");
    scroll?.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);

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
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateViewport);
      scroll?.removeEventListener("scroll", updateViewport);
      root.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [props.workbook]);

  useEffect(() => {
    if (!formulaDrag || !formulaMode || !editing || !props.workbook) return;

    const handleMouseMove = (event: MouseEvent) => {
      const root = rootRef.current;
      const currentDrag = formulaDragRef.current;
      if (!root || !currentDrag) return;
      if (rendererGeometry?.sheetId !== currentDrag.sheetId) return;
      const point = pointFromFormulaMouseEvent(event, root, rendererGeometry);
      autoScrollFormulaViewport(event, root);
      if (!point) return;
      setFormulaDrag({ ...currentDrag, focus: point });
      event.preventDefault();
    };

    const handleMouseUp = (event: MouseEvent) => {
      const root = rootRef.current;
      const currentDrag = formulaDragRef.current;
      if (!root || !currentDrag) return;
      const point = rendererGeometry?.sheetId === currentDrag.sheetId ? pointFromFormulaMouseEvent(event, root, rendererGeometry) : null;
      const finalDrag = point ? { ...currentDrag, focus: point } : currentDrag;
      const reference = formulaReferenceForRangeDrag(finalDrag, activeSelection);
      const nextDraft = replaceFormulaReferenceAtCursor(draft, inputSelection, formulaReferences, reference);
      const nextCaret = nextCaretAfterFormulaReference(draft, inputSelection, formulaReferences, reference);
      suppressFormulaSelectionRef.current = true;
      setFormulaDrag(null);
      setDraft(nextDraft);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(nextCaret, nextCaret);
        setInputSelection({ end: nextCaret, start: nextCaret });
      });
      event.preventDefault();
    };

    window.addEventListener("mousemove", handleMouseMove, { capture: true });
    window.addEventListener("mouseup", handleMouseUp, { capture: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove, { capture: true });
      window.removeEventListener("mouseup", handleMouseUp, { capture: true });
    };
  }, [activeSelection, draft, editing, formulaDrag, formulaMode, formulaReferences, inputSelection, props.workbook, rendererGeometry]);

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
    if (formulaMode && editing) {
      if (suppressFormulaSelectionRef.current) {
        suppressFormulaSelectionRef.current = false;
        return;
      }
      const reference = formulaReferenceForSelection(selection, activeSelection);
      const nextDraft = replaceFormulaReferenceAtCursor(draft, inputSelection, formulaReferences, reference);
      const nextCaret = nextCaretAfterFormulaReference(draft, inputSelection, formulaReferences, reference);
      setDraft(nextDraft);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(nextCaret, nextCaret);
        setInputSelection({ end: nextCaret, start: nextCaret });
      });
      return;
    }
    props.onSelectionChange({
      sheetId: selection.sheetId,
      sheetName: selection.sheetName,
      address,
      selectedText: cell?.clipboardText || cell?.formattedText || "",
    });
    setEditing(false);
  };

  const updateActiveSheet = (sheet: XlsxRendererActiveSheet) => {
    if (formulaMode && editing) return;
    props.onSelectionChange({
      sheetId: sheet.sheetId,
      sheetName: sheet.sheetName,
      address: "A1",
      selectedText: "",
    });
    setEditing(false);
  };

  const updateInputSelection = () => {
    const input = inputRef.current;
    if (!input) return;
    setInputSelection({
      end: input.selectionEnd ?? 0,
      start: input.selectionStart ?? 0,
    });
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
          className="relative min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            void commitDraft().catch(() => undefined);
          }}
        >
          {formulaMode ? <FormulaInputOverlay references={formulaReferences} value={draft} /> : null}
          <input
            ref={inputRef}
            className={`relative z-10 h-8 w-full rounded-md border border-[#C9B89D] px-2 text-[13px] outline-none transition focus:border-[#5C6B50] disabled:bg-[#EEE8DC] ${
              formulaMode ? "bg-transparent font-mono text-transparent caret-[#2A2620]" : "bg-white text-[#2A2620]"
            }`}
            disabled={!activeSelection || !props.editingReady || props.saving}
            value={draft}
            onBlur={() => {
              if (editing) void commitDraft().catch(() => undefined);
            }}
            onChange={(event) => {
              setEditing(true);
              setDraft(event.target.value);
              setInputSelection({
                end: event.target.selectionEnd ?? event.target.value.length,
                start: event.target.selectionStart ?? event.target.value.length,
              });
            }}
            onClick={updateInputSelection}
            onFocus={(event) => {
              setEditing(true);
              setInputSelection({
                end: event.currentTarget.selectionEnd ?? event.currentTarget.value.length,
                start: event.currentTarget.selectionStart ?? event.currentTarget.value.length,
              });
            }}
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
            onKeyUp={updateInputSelection}
            onSelect={updateInputSelection}
          />
        </form>
      </div>
      <div
        ref={rootRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-white ${scrollbarClass} [&_.tsh-xlsx-canvas-scroll]:bg-white [&_.tsh-xlsx-canvas-viewport]:min-h-0 [&_.tsh-xlsx-renderer]:h-full [&_.tsh-xlsx-renderer]:min-h-0`}
        onMouseDownCapture={(event) => {
          if (!formulaMode || !editing) return;
          const target = event.target instanceof Element ? event.target.closest(".tsh-xlsx-interaction-canvas") : null;
          if (!target) return;
          const targetGeometry = rendererGeometry;
          const point = targetGeometry ? pointFromFormulaMouseEvent(event.nativeEvent, event.currentTarget, targetGeometry) : null;
          if (!targetGeometry || !point) return;
          event.preventDefault();
          event.stopPropagation();
          suppressFormulaSelectionRef.current = true;
          setFormulaDrag({
            anchor: point,
            focus: point,
            sheetId: targetGeometry.sheetId,
            sheetName: targetGeometry.sheetName,
          });
        }}
        onClickCapture={(event) => {
          if (!formulaMode || !editing || !suppressFormulaSelectionRef.current) return;
          const target = event.target instanceof Element ? event.target.closest(".tsh-xlsx-interaction-canvas") : null;
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <XlsxRenderer
          focusSelection={focusSelection}
          workbook={props.workbook}
          onActiveSheetChange={updateActiveSheet}
          onGeometryChange={setRendererGeometry}
          onSelectionChange={updateSelection}
        />
        {formulaMode && overlaySheet ? (
          <FormulaReferenceLayer geometry={rendererGeometry} references={formulaReferencePreview} sheet={overlaySheet} viewport={viewport} />
        ) : null}
      </div>
    </div>
  );
}

function FormulaInputOverlay(props: { references: FormulaReference[]; value: string }) {
  const segments: Array<{ color?: string; text: string }> = [];
  let cursor = 0;
  for (const reference of props.references) {
    if (reference.start > cursor) segments.push({ text: props.value.slice(cursor, reference.start) });
    segments.push({ color: reference.color, text: props.value.slice(reference.start, reference.end) });
    cursor = reference.end;
  }
  if (cursor < props.value.length) segments.push({ text: props.value.slice(cursor) });
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 flex h-8 items-center overflow-hidden rounded-md border border-transparent bg-white px-2 font-mono text-[13px] whitespace-pre"
    >
      {segments.map((segment, index) => (
        <span key={`${index}:${segment.text}`} style={segment.color ? { color: segment.color, fontWeight: 700 } : undefined}>
          {segment.text}
        </span>
      ))}
    </div>
  );
}

function FormulaReferenceLayer(props: {
  geometry: XlsxRendererGeometry | null;
  references: FormulaReference[];
  sheet: SpreadsheetRenderWorkbook["sheets"][number];
  viewport: { height: number; left: number; top: number; width: number };
}) {
  if (!props.references.length || props.viewport.width <= 0 || props.viewport.height <= 0) return null;
  const activeSheet = props.sheet;
  const geometry = props.geometry;
  if (!geometry || geometry.sheetId !== activeSheet.id) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {props.references.flatMap((reference, index) => {
        const sheetId = reference.sheetId ?? activeSheet.id;
        if (sheetId !== activeSheet.id) return [];

        const rects = formulaReferenceRectsFromGeometry(reference, geometry);

        return rects.flatMap(({ height, left, top, width }, rectIndex) => {
          if (left > props.viewport.width + ROW_HEADER_WIDTH_PX || top > props.viewport.height + COLUMN_HEADER_HEIGHT_PX || left + width < 0 || top + height < 0) {
            return [];
          }
          return (
            <div
              key={`${reference.start}:${reference.token}:${index}:${rectIndex}`}
              className="absolute rounded-[3px]"
              style={{
                backgroundColor: alphaColor(reference.color, 0.14),
                border: `2px solid ${reference.color}`,
                boxShadow: `0 0 0 1px ${alphaColor(reference.color, 0.18)}`,
                height,
                left,
                top,
                width,
              }}
            />
          );
        });
      })}
    </div>
  );
}

function formulaReferenceRectsFromGeometry(reference: FormulaReference, geometry: XlsxRendererGeometry) {
  const startCol = Math.min(reference.range.start.col, reference.range.end.col);
  const endCol = Math.max(reference.range.start.col, reference.range.end.col);
  const startRow = Math.min(reference.range.start.row, reference.range.end.row);
  const endRow = Math.max(reference.range.start.row, reference.range.end.row);
  const rects = geometry.cellRangeRects?.({
    col: startCol,
    colSpan: endCol - startCol + 1,
    row: startRow,
    rowSpan: endRow - startRow + 1,
  }) ?? [];
  return rects.map((rect) => ({
    height: Math.max(2, rect.height),
    left: rect.x,
    top: rect.y,
    width: Math.max(2, rect.width),
  }));
}

function isFormulaDraft(value: string) {
  return value.trimStart().startsWith("=");
}

function parseFormulaReferences(value: string, workbook: SpreadsheetRenderWorkbook | null, activeSelection: { sheetId: string; sheetName: string } | null) {
  if (!isFormulaDraft(value)) return [];
  const references: FormulaReference[] = [];
  const pattern = /(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_ .]*))!\$?[A-Za-z]{1,3}\$?[1-9]\d*(?::\$?[A-Za-z]{1,3}\$?[1-9]\d*)?|\$?[A-Za-z]{1,3}\$?[1-9]\d*(?::\$?[A-Za-z]{1,3}\$?[1-9]\d*)?/g;
  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    const end = start + token.length;
    if (isIdentifierChar(value[start - 1]) || isIdentifierChar(value[end])) continue;
    const parsed = parseReferenceToken(token, workbook, activeSelection);
    if (!parsed) continue;
    references.push({
      ...parsed,
      color: FORMULA_REFERENCE_COLORS[references.length % FORMULA_REFERENCE_COLORS.length],
      end,
      start,
      token,
    });
  }
  return references;
}

function parseReferenceToken(token: string, workbook: SpreadsheetRenderWorkbook | null, activeSelection: { sheetId: string; sheetName: string } | null) {
  const bangIndex = token.lastIndexOf("!");
  const sheetName = bangIndex >= 0 ? unquoteSheetName(token.slice(0, bangIndex)) : activeSelection?.sheetName ?? null;
  const address = normalizeCellReference(bangIndex >= 0 ? token.slice(bangIndex + 1) : token);
  const [startAddress, endAddress = startAddress] = address.split(":");
  const start = pointFromAddress(startAddress);
  const end = pointFromAddress(endAddress);
  if (!start || !end) return null;
  const sheet = workbook?.sheets.find((item) => item.id === sheetName || item.name === sheetName) ?? null;
  return {
    address,
    range: { end, start },
    sheetId: sheet?.id ?? (bangIndex >= 0 ? null : activeSelection?.sheetId ?? null),
    sheetName: sheet?.name ?? sheetName,
  };
}

function replaceFormulaReferenceAtCursor(value: string, selection: { end: number; start: number }, references: FormulaReference[], reference: string) {
  const range = formulaReplacementRange(selection, references);
  return `${value.slice(0, range.start)}${reference}${value.slice(range.end)}`;
}

function nextCaretAfterFormulaReference(value: string, selection: { end: number; start: number }, references: FormulaReference[], reference: string) {
  const range = formulaReplacementRange(selection, references);
  return Math.min(value.length - (range.end - range.start) + reference.length, range.start + reference.length);
}

function formulaReplacementRange(selection: { end: number; start: number }, references: FormulaReference[]) {
  if (selection.start !== selection.end) return { end: selection.end, start: selection.start };
  const current = references.find((reference) => selection.start >= reference.start && selection.start <= reference.end);
  return current ? { end: current.end, start: current.start } : { end: selection.start, start: selection.start };
}

function formulaReferenceForSelection(selection: XlsxRendererSelection, activeSelection: { sheetId: string; sheetName: string } | null) {
  const address = cellAddressFromPoint(selection.row, selection.col);
  if (!activeSelection || activeSelection.sheetId === selection.sheetId) return address;
  return `${quoteSheetName(selection.sheetName)}!${address}`;
}

function formulaReferenceForRangeDrag(drag: FormulaRangeDrag, activeSelection: { sheetId: string; sheetName: string } | null) {
  const range = normalizedFormulaDragRange(drag);
  const address = rangeAddressFromPoints(range.start, range.end);
  if (!activeSelection || activeSelection.sheetId === drag.sheetId) return address;
  return `${quoteSheetName(drag.sheetName)}!${address}`;
}

function formulaPreviewReferenceForDrag(
  drag: FormulaRangeDrag,
  activeSelection: { sheetId: string; sheetName: string } | null,
  selection: { end: number; start: number },
  references: FormulaReference[],
): FormulaReference {
  const replacement = formulaReplacementRange(selection, references);
  const replacing = references.find((reference) => reference.start === replacement.start && reference.end === replacement.end);
  const range = normalizedFormulaDragRange(drag);
  const address = rangeAddressFromPoints(range.start, range.end);
  const token = formulaReferenceForRangeDrag(drag, activeSelection);
  return {
    address,
    color: replacing?.color ?? FORMULA_REFERENCE_COLORS[references.length % FORMULA_REFERENCE_COLORS.length],
    end: replacement.end,
    range,
    sheetId: drag.sheetId,
    sheetName: drag.sheetName,
    start: replacement.start,
    token,
  };
}

function normalizedFormulaDragRange(drag: FormulaRangeDrag) {
  return {
    start: {
      col: Math.min(drag.anchor.col, drag.focus.col),
      row: Math.min(drag.anchor.row, drag.focus.row),
    },
    end: {
      col: Math.max(drag.anchor.col, drag.focus.col),
      row: Math.max(drag.anchor.row, drag.focus.row),
    },
  };
}

function rangeAddressFromPoints(start: { col: number; row: number }, end: { col: number; row: number }) {
  const startAddress = cellAddressFromPoint(start.row, start.col);
  const endAddress = cellAddressFromPoint(end.row, end.col);
  return startAddress === endAddress ? startAddress : `${startAddress}:${endAddress}`;
}

function pointFromFormulaMouseEvent(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  root: HTMLElement,
  geometry: XlsxRendererGeometry,
) {
  const canvas = root.querySelector<HTMLCanvasElement>(".tsh-xlsx-interaction-canvas");
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return geometry.pointToCell({
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }) ?? null;
}

function autoScrollFormulaViewport(event: MouseEvent, root: HTMLElement) {
  const scroll = root.querySelector<HTMLElement>(".tsh-xlsx-canvas-scroll");
  if (!scroll) return;
  const rect = scroll.getBoundingClientRect();
  const edgeSize = 42;
  const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
  const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  let deltaX = 0;
  let deltaY = 0;
  if (event.clientX < rect.left + edgeSize) deltaX = -18;
  if (event.clientX > rect.right - edgeSize) deltaX = 18;
  if (event.clientY < rect.top + edgeSize) deltaY = -18;
  if (event.clientY > rect.bottom - edgeSize) deltaY = 18;
  if (!deltaX && !deltaY) return;
  scroll.scrollTo({
    left: Math.max(0, Math.min(maxScrollLeft, scroll.scrollLeft + deltaX)),
    top: Math.max(0, Math.min(maxScrollTop, scroll.scrollTop + deltaY)),
  });
}

function normalizeCellReference(value: string) {
  return value.replace(/\$/g, "").toUpperCase();
}

function quoteSheetName(sheetName: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(sheetName) ? sheetName : `'${sheetName.replace(/'/g, "''")}'`;
}

function unquoteSheetName(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replace(/''/g, "'");
  return trimmed;
}

function isIdentifierChar(value: string | undefined) {
  return Boolean(value && /[A-Za-z0-9_]/.test(value));
}

function alphaColor(color: string, alpha: number) {
  const hex = color.replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
