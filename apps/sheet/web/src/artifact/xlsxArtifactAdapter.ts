import type { AiEditRequest, SheetArtifactSelection, XlsxManifest } from "@ai-sheet/shared";
import type { AgentEditRequestInputBase, ArtifactRuntimeAdapterBase } from "@ai-app/shared/artifact-runtime";
import { createSpreadsheetEditor, type OoxmlXlsxPreview, type SpreadsheetEditorService, type XlsxRenderWorkbook } from "@tutti-os/office-preview/xlsx";

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
  renderWorkbook: XlsxRenderWorkbook | null;
  revision: number;
  dirty: boolean;
  selection: XlsxSelection;
};

export type XlsxRuntimeParseInput = {
  title: string;
  manifest: XlsxManifest;
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
      selection: { sheetId: null, sheetName: null, address: "", selectedText: "" },
    };
  }

  withPreview(runtime: XlsxRuntimeState, preview: OoxmlXlsxPreview | null): XlsxRuntimeState {
    const editor = preview
      ? createSpreadsheetEditor({
          renderWorkbook: preview.renderWorkbook,
          workbookSnapshot: preview.editorWorkbook,
        })
      : null;
    const renderWorkbook = editor ? editor.renderWorkbook() : (preview?.renderWorkbook ?? null);
    const activeSheet = renderWorkbook?.sheets[renderWorkbook.activeSheetIndex] ?? renderWorkbook?.sheets[0] ?? null;
    return {
      ...runtime,
      editor,
      preview,
      renderWorkbook,
      revision: runtime.revision + 1,
      selection: activeSheet
        ? { sheetId: activeSheet.id, sheetName: activeSheet.name, address: "A1", selectedText: "" }
        : runtime.selection,
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
    return {
      userPrompt: input.userPrompt,
    };
  }
}
