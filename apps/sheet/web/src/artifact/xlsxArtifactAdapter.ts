import type { AiEditRequest, SheetArtifactSelection, XlsxManifest } from "@ai-sheet/shared";
import type { AgentEditRequestInputBase, ArtifactRuntimeAdapterBase } from "@ai-app/shared/artifact-runtime";
import { createSpreadsheetEditor, type OoxmlXlsxPreview, type SpreadsheetEditorService, type SpreadsheetRenderWorkbook } from "@tutti-os/office-preview/xlsx";

export type XlsxSelection = {
  sheetId: string | null;
  sheetName: string | null;
  address: string;
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
    const point = pointFromCellAddress(selection.address);
    if (editor && point && selection.sheetId) {
      editor.setSelection({
        activeCell: point,
        ranges: [{ col: point.col, colSpan: 1, row: point.row, rowSpan: 1 }],
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
      type: runtime.selection.address.includes(":") ? "range" : "cell",
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
  const point = pointFromCellAddress(address);
  const cell = point ? sheet.cellMap[`${point.row}:${point.col}`] : null;
  return {
    sheetId: sheet.id,
    sheetName: sheet.name,
    address: point ? address.toUpperCase() : "A1",
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
