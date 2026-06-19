import type { AgentArtifactContext, AiEditRequest, DeckManifestSlide, SlideArtifactSelection } from "@ai-slide/shared";
import type { AgentEditRequestInputBase, ArtifactRuntimeAdapterBase } from "@ai-app/shared/artifact-runtime";

export type DeckAgentRuntimeState = {
  title: string;
  artifactId: string;
  fileRef: string;
  revision: number;
  activeSlide: DeckManifestSlide | null;
  activeSlideIndex: number;
  currentSlideHtml: string;
  selection: SlideArtifactSelection | null;
};

export type DeckAgentRuntimeProvider = () => DeckAgentRuntimeState | null;

export type DeckAgentEditRequestInput = AgentEditRequestInputBase<DeckAgentRuntimeState>;
type DeckAgentArtifactContext = AgentArtifactContext & { type: "deck" };

export class DeckArtifactRuntimeAdapter
  implements
    ArtifactRuntimeAdapterBase<
      "deck",
      DeckAgentRuntimeState,
      SlideArtifactSelection,
      DeckAgentArtifactContext,
      AiEditRequest,
      never,
      DeckAgentEditRequestInput
    >
{
  readonly type = "deck" as const;
  readonly capabilities = { inlineEditing: true };

  getSelection(runtime: DeckAgentRuntimeState): SlideArtifactSelection | null {
    return runtime.selection;
  }

  getAgentContext(projectId: string, runtime: DeckAgentRuntimeState): DeckAgentArtifactContext {
    return {
      projectId,
      artifactId: runtime.artifactId,
      type: this.type,
      fileRef: runtime.fileRef,
      selection: this.getSelection(runtime),
      revision: runtime.revision,
    };
  }

  createAiEditRequest(input: DeckAgentEditRequestInput): AiEditRequest {
    const context = this.getAgentContext(input.projectId, input.runtime);
    const selection = context.selection;
    const selectionType = normalizedDeckSelectionType(selection);
    const selectedText = selectionType === "slide" ? "" : selection?.text ?? "";
    const selectedHtml = selectionType === "slide" ? "" : selection?.html ?? "";
    const hasEditableSelection = Boolean(
      selectionType !== "write" &&
        selectionType !== "slide" &&
        (selectedText.trim() || selectedHtml.trim()),
    );

    return {
      userPrompt: input.userPrompt,
      mode: hasEditableSelection ? "rewrite" : "write",
      artifactType: this.type,
      selectedText,
      selectedHtml,
      selectionType,
      selectionPath: selection?.path ?? activeSlidePath(input.runtime),
      runtimeProfileId: input.runtimeProfileId ?? null,
    };
  }
}

function normalizedDeckSelectionType(selection: SlideArtifactSelection | null | undefined): AiEditRequest["selectionType"] {
  if (!selection || selection.type === "none" || selection.type === "range") return "write";
  return selection.type;
}

function activeSlidePath(runtime: DeckAgentRuntimeState) {
  return runtime.activeSlide ? `deck:${runtime.activeSlide.id}` : "";
}
