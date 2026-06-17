import type { AiEditRequest, ArtifactSelection } from "@ai-document/shared";
import { parseDocxDocumentManifest, type DocxDocumentManifest } from "@ai-document/shared";
import type { OoxmlDocxPreview } from "@tutti-os/office-preview/docx";
import type { AgentEditRequestInput, ArtifactRuntimeAdapter, ArtifactRuntimeParseInput } from "./types";

export type DocxSelection = {
  selectedText: string;
};

export type DocxRuntimeState = {
  id: string;
  title: string;
  manifest: DocxDocumentManifest;
  preview: OoxmlDocxPreview | null;
  revision: number;
  dirty: false;
  selection: DocxSelection;
};

export class DocxArtifactRuntimeAdapter implements ArtifactRuntimeAdapter<DocxRuntimeState> {
  readonly type = "docx" as const;

  parse(input: ArtifactRuntimeParseInput): DocxRuntimeState {
    return {
      id: `docx-${Date.now()}`,
      title: input.title,
      manifest: parseDocxDocumentManifest(input.content),
      preview: null,
      revision: 0,
      dirty: false,
      selection: { selectedText: "" },
    };
  }

  withPreview(runtime: DocxRuntimeState, preview: OoxmlDocxPreview | null): DocxRuntimeState {
    return {
      ...runtime,
      preview,
      revision: runtime.revision + 1,
    };
  }

  serialize(runtime: DocxRuntimeState) {
    return JSON.stringify(runtime.manifest);
  }

  getSelection(runtime: DocxRuntimeState): ArtifactSelection | null {
    return {
      type: runtime.selection.selectedText ? "text" : "none",
      text: runtime.selection.selectedText,
      html: "",
      path: runtime.selection.selectedText ? "docx:text-selection" : "",
    };
  }

  getAgentContext(projectId: string, runtime: DocxRuntimeState) {
    return {
      projectId,
      artifactId: projectId,
      type: this.type,
      content: this.serialize(runtime),
      selection: this.getSelection(runtime),
      revision: runtime.revision,
    };
  }

  createAiEditRequest(input: AgentEditRequestInput<DocxRuntimeState>): AiEditRequest {
    const context = this.getAgentContext(input.projectId, input.runtime);
    const selectedText = context.selection?.text ?? "";
    return {
      htmlContent: context.content,
      selectedText,
      selectedHtml: "",
      selectionType: selectedText ? "text" : "write",
      selectionPath: selectedText ? "docx:text-selection" : "",
      userPrompt: input.userPrompt,
      mode: selectedText ? "rewrite" : "write",
      runtimeProfileId: input.runtimeProfileId ?? null,
    };
  }
}
