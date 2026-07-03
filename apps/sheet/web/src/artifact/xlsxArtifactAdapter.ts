import type { AiEditRequest, SheetArtifactSelection, XlsxManifest } from "@ai-sheet/shared";
import type { AgentEditRequestInputBase, ArtifactRuntimeAdapterBase } from "@ai-app/shared/artifact-runtime";
import { createSpreadsheetEditor, type OoxmlXlsxPreview, type SpreadsheetEditorService, type SpreadsheetRenderWorkbook } from "@tutti-os/office-preview/xlsx";

export type XlsxSelectionKind = "cell" | "column" | "range" | "row" | "sheet";

export type XlsxSelection = {
  sheetId: string | null;
  sheetName: string | null;
  address: string;
  activeAddress?: string;
  kind?: XlsxSelectionKind;
  selectedText: string;
};

export type XlsxRuntimeState = {
  id: string;
  title: string;
  manifest: XlsxManifest;
  preview: OoxmlXlsxPreview | null;
  editor: SpreadsheetEditorService | null;
  renderWorkbook: SpreadsheetRenderWorkbook | null;
  revision: number;
  dirty: boolean;
  selection: XlsxSelection;
};

export type XlsxRuntimeParseInput = {
  title: string;
  manifest: XlsxManifest;
  selection?: XlsxSelection | null;
};

export type XlsxAgentEditRequestInput = AgentEditRequestInputBase<XlsxRuntimeState>;

export class XlsxArtifactRuntimeAdapter
  implements
    ArtifactRuntimeAdapterBase<
      "xlsx",
      XlsxRuntimeState,
      SheetArtifactSelection,
      { projectId: string; artifactId: string; type: "xlsx"; fileRef: string; selection: SheetArtifactSelection | null; revision: number },
      AiEditRequest,
      XlsxRuntimeParseInput,
      XlsxAgentEditRequestInput
    >
{
  readonly type = "xlsx" as const;
  readonly capabilities = { officePreview: true };

  parse(input: XlsxRuntimeParseInput): XlsxRuntimeState {
    return {
      id: `xlsx-${Date.now()}`,
      title: input.title,
      manifest: input.manifest,
      preview: null,
      editor: null,
      renderWorkbook: null,
      revision: 0,
      dirty: false,
      selection: input.selection ?? { sheetId: null, sheetName: null, address: "", selectedText: "" },
    };
  }

  withPreview(runtime: XlsxRuntimeState, preview: OoxmlXlsxPreview | null): XlsxRuntimeState {
    const editor = preview
      ? createSpreadsheetEditor({
          renderWorkbook: preview.renderWorkbook,
          workbookSnapshot: preview.workbookSnapshot,
        })
      : null;
    let renderWorkbook = editor ? editor.renderWorkbook() : (preview?.renderWorkbook ?? null);
    const selection = renderWorkbook ? selectionForWorkbook(renderWorkbook, runtime.selection) : runtime.selection;
    const sheet = renderWorkbook?.sheets.find((item) => item.id === selection.sheetId || item.name === selection.sheetName) ?? null;
    const range = sheet ? selectionRangeFromAddress(selection.address, sheet) : null;
    const point = pointFromCellAddress(selection.activeAddress ?? selection.address);
    if (editor && point && range && selection.sheetId) {
      editor.setSelection({
        activeCell: point,
        ranges: [{ col: range.col, colSpan: range.colSpan, row: range.row, rowSpan: range.rowSpan }],
        sheetId: selection.sheetId,
      });
      renderWorkbook = editor.renderWorkbook();
    }
    return {
      ...runtime,
      editor,
      preview,
      renderWorkbook,
      revision: runtime.revision + 1,
      selection,
    };
  }

  getSelection(runtime: XlsxRuntimeState): SheetArtifactSelection | null {
    if (!runtime.selection.address && !runtime.selection.selectedText) {
      return { type: "none", text: "", html: "", path: "" };
    }
    return {
      type: runtime.selection.kind ?? (runtime.selection.address.includes(":") ? "range" : "cell"),
      text: runtime.selection.selectedText,
      html: "",
      path: runtime.selection.address,
      sheetId: runtime.selection.sheetId,
      sheetName: runtime.selection.sheetName,
      address: runtime.selection.address,
    };
  }

  getAgentContext(projectId: string, runtime: XlsxRuntimeState) {
    return {
      projectId,
      artifactId: projectId,
      type: this.type,
      fileRef: runtime.manifest.fileName,
      selection: this.getSelection(runtime),
      revision: runtime.revision,
    };
  }

  createAiEditRequest(input: XlsxAgentEditRequestInput): AiEditRequest {
    const selection = this.getSelection(input.runtime);
    return {
      userPrompt: input.userPrompt,
      mode: "write",
      runtimeProfileId: input.runtimeProfileId ?? null,
      selectionType: selection?.type === "none" ? "write" : selection?.type ?? "write",
      selectionPath: selection?.path ?? "",
      selectedText: selection?.text ?? "",
      selectedHtml: "",
    };
  }
}

function selectionForWorkbook(renderWorkbook: SpreadsheetRenderWorkbook, selection: XlsxSelection): XlsxSelection {
  const fallbackSheet = renderWorkbook.sheets[renderWorkbook.activeSheetIndex] ?? renderWorkbook.sheets[0] ?? null;
  if (!fallbackSheet) return selection;
  const sheet = renderWorkbook.sheets.find((item) => item.id === selection.sheetId || item.name === selection.sheetName) ?? fallbackSheet;
  const address = selection.address || "A1";
  const range = selectionRangeFromAddress(address, sheet) ?? selectionRangeFromAddress("A1", sheet);
  const activeAddress = pointFromCellAddress(selection.activeAddress ?? "")
    ? (selection.activeAddress ?? "").toUpperCase()
    : range
      ? cellAddressFromPoint(range.row, range.col)
      : "A1";
  const point = pointFromCellAddress(activeAddress);
  const cell = point ? sheet.cellMap[`${point.row}:${point.col}`] : null;
  return {
    sheetId: sheet.id,
    sheetName: sheet.name,
    address: range ? normalizeSelectionAddress(address, sheet) : "A1",
    activeAddress,
    kind: selection.kind ?? selectionKindFromAddress(address, sheet),
    selectedText: cell?.formula ? `=${cell.formula}` : cell?.clipboardText || cell?.formattedText || selection.selectedText || "",
  };
}

function pointFromCellAddress(address: string) {
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

function selectionRangeFromAddress(address: string, sheet: SpreadsheetRenderWorkbook["sheets"][number]) {
  const normalized = address.trim().replace(/\$/g, "").toUpperCase();
  const cellRangeMatch = normalized.match(/^([A-Z]+[1-9]\d*)(?::([A-Z]+[1-9]\d*))?$/);
  if (cellRangeMatch) {
    const start = pointFromCellAddress(cellRangeMatch[1]);
    const end = pointFromCellAddress(cellRangeMatch[2] ?? cellRangeMatch[1]);
    if (!start || !end) return null;
    const col = Math.min(start.col, end.col);
    const row = Math.min(start.row, end.row);
    return {
      col,
      colSpan: Math.abs(end.col - start.col) + 1,
      row,
      rowSpan: Math.abs(end.row - start.row) + 1,
    };
  }

  const rowRangeMatch = normalized.match(/^([1-9]\d*):([1-9]\d*)$/);
  if (rowRangeMatch) {
    const startRow = Number(rowRangeMatch[1]) - 1;
    const endRow = Number(rowRangeMatch[2]) - 1;
    const row = Math.min(startRow, endRow);
    return {
      col: 0,
      colSpan: Math.max(1, sheet.columnCount),
      row,
      rowSpan: Math.abs(endRow - startRow) + 1,
    };
  }

  const columnRangeMatch = normalized.match(/^([A-Z]+):([A-Z]+)$/);
  if (columnRangeMatch) {
    const startCol = columnNameToIndex(columnRangeMatch[1]);
    const endCol = columnNameToIndex(columnRangeMatch[2]);
    const col = Math.min(startCol, endCol);
    return {
      col,
      colSpan: Math.abs(endCol - startCol) + 1,
      row: 0,
      rowSpan: Math.max(1, sheet.rowCount),
    };
  }

  return null;
}

function normalizeSelectionAddress(address: string, sheet: SpreadsheetRenderWorkbook["sheets"][number]) {
  const range = selectionRangeFromAddress(address, sheet);
  if (!range) return "A1";
  const kind = selectionKindFromAddress(address, sheet);
  if (kind === "row") return `${range.row + 1}:${range.row + range.rowSpan}`;
  if (kind === "column") return `${columnNameFromIndex(range.col)}:${columnNameFromIndex(range.col + range.colSpan - 1)}`;
  const startAddress = cellAddressFromPoint(range.row, range.col);
  const endAddress = cellAddressFromPoint(range.row + range.rowSpan - 1, range.col + range.colSpan - 1);
  return startAddress === endAddress ? startAddress : `${startAddress}:${endAddress}`;
}

function selectionKindFromAddress(address: string, sheet: SpreadsheetRenderWorkbook["sheets"][number]): XlsxSelectionKind {
  const normalized = address.trim().replace(/\$/g, "").toUpperCase();
  if (/^[1-9]\d*:[1-9]\d*$/.test(normalized)) return "row";
  if (/^[A-Z]+:[A-Z]+$/.test(normalized)) return "column";
  const range = selectionRangeFromAddress(address, sheet);
  return range && (range.colSpan > 1 || range.rowSpan > 1) ? "range" : "cell";
}

function cellAddressFromPoint(row: number, col: number) {
  return `${columnNameFromIndex(col)}${row + 1}`;
}

function columnNameFromIndex(index: number) {
  let value = "";
  let cursor = Math.max(0, index) + 1;
  while (cursor > 0) {
    const remainder = (cursor - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    cursor = Math.floor((cursor - 1) / 26);
  }
  return value;
}
