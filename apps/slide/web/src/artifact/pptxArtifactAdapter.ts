import type { AiEditRequest, PptxManifest, SlideArtifactSelection } from "@ai-slide/shared";
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

export type PptxAgentEditRequestInput = {
  projectId: string;
  runtime: PptxRuntimeState;
  userPrompt: string;
  runtimeProfileId?: string | null;
};

export class PptxArtifactRuntimeAdapter {
  readonly type = "pptx" as const;

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
