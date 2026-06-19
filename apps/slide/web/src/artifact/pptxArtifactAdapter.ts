import type { AiEditRequest, PptxManifest, SlideArtifactSelection } from "@ai-slide/shared";
import type { AgentEditRequestInputBase, ArtifactRuntimeAdapterBase } from "@ai-app/shared/artifact-runtime";
import type { OoxmlPptxPreview } from "@tutti-os/office-preview/pptx";

export type PptxSelection = {
  selectedText: string;
};

export type PptxRuntimeState = {
  id: string;
  title: string;
  manifest: PptxManifest;
  preview: OoxmlPptxPreview | null;
  revision: number;
  dirty: false;
  selection: PptxSelection;
};

export type PptxRuntimeParseInput = {
  title: string;
  manifest: PptxManifest;
};

export type PptxAgentEditRequestInput = AgentEditRequestInputBase<PptxRuntimeState>;

export class PptxArtifactRuntimeAdapter
  implements
    ArtifactRuntimeAdapterBase<
      "pptx",
      PptxRuntimeState,
      SlideArtifactSelection,
      { projectId: string; artifactId: string; type: "pptx"; fileRef: string; selection: SlideArtifactSelection | null; revision: number },
      AiEditRequest,
      PptxRuntimeParseInput,
      PptxAgentEditRequestInput
    >
{
  readonly type = "pptx" as const;
  readonly capabilities = { officePreview: true };

  parse(input: PptxRuntimeParseInput): PptxRuntimeState {
    return {
      id: `pptx-${Date.now()}`,
      title: input.title,
      manifest: input.manifest,
      preview: null,
      revision: 0,
      dirty: false,
      selection: { selectedText: "" },
    };
  }

  withPreview(runtime: PptxRuntimeState, preview: OoxmlPptxPreview | null): PptxRuntimeState {
    return {
      ...runtime,
      preview,
      revision: runtime.revision + 1,
    };
  }

  getSelection(runtime: PptxRuntimeState): SlideArtifactSelection | null {
    return {
      type: runtime.selection.selectedText ? "text" : "none",
      text: runtime.selection.selectedText,
      html: "",
      path: runtime.selection.selectedText ? "pptx:text-selection" : "",
    };
  }

  getAgentContext(projectId: string, runtime: PptxRuntimeState) {
    return {
      projectId,
      artifactId: projectId,
      type: this.type,
      fileRef: runtime.manifest.fileName,
      selection: this.getSelection(runtime),
      revision: runtime.revision,
    };
  }

  createAiEditRequest(input: PptxAgentEditRequestInput): AiEditRequest {
    const selection = this.getSelection(input.runtime);
    const selectedText = selection?.text ?? "";
    return {
      userPrompt: input.userPrompt,
      mode: selectedText ? "rewrite" : "write",
      artifactType: this.type,
      selectedText,
      selectedHtml: "",
      selectionType: selectedText ? "text" : "write",
      selectionPath: selectedText ? "pptx:text-selection" : "",
      runtimeProfileId: input.runtimeProfileId ?? null,
    };
  }
}
