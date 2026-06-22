import type { AiEditRequest, SheetArtifactSelection, XlsxManifest } from "@ai-sheet/shared";
import type { AgentEditRequestInputBase, ArtifactRuntimeAdapterBase } from "@ai-app/shared/artifact-runtime";
import type { OoxmlXlsxPreview } from "@tutti-os/office-preview/xlsx";

export type XlsxSelection = {
  sheetId: string | null;
  address: string;
  selectedText: string;
};

export type XlsxRuntimeState = {
  id: string;
  title: string;
  manifest: XlsxManifest;
  preview: OoxmlXlsxPreview | null;
  revision: number;
  dirty: false;
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
      revision: 0,
      dirty: false,
      selection: { sheetId: null, address: "", selectedText: "" },
    };
  }

  withPreview(runtime: XlsxRuntimeState, preview: OoxmlXlsxPreview | null): XlsxRuntimeState {
    return {
      ...runtime,
      preview,
      revision: runtime.revision + 1,
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
