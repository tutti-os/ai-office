import type { AgentArtifactContext, AiEditRequest, ArtifactSelection } from "@ai-doc/shared";
import type { AgentEditRequestInput, ArtifactRuntimeAdapter, ArtifactRuntimeParseInput } from "./types";

export type MarkdownViewMode = "edit" | "split" | "preview";

export type MarkdownSelection = {
  start: number;
  end: number;
  selectedText: string;
};

export type MarkdownHistoryEntry = {
  content: string;
  selectionStart: number;
  selectionEnd: number;
};

export type MarkdownRuntimeState = {
  id: string;
  title: string;
  content: string;
  revision: number;
  dirty: boolean;
  selection: MarkdownSelection;
  viewMode: MarkdownViewMode;
  history: {
    entries: MarkdownHistoryEntry[];
    currentIndex: number;
  };
};

export class MarkdownArtifactRuntimeAdapter implements ArtifactRuntimeAdapter<MarkdownRuntimeState> {
  readonly type = "markdown" as const;

  parse(input: ArtifactRuntimeParseInput): MarkdownRuntimeState {
    const content = input.content ?? defaultMarkdownDocument;
    return {
      id: `markdown-${Date.now()}`,
      title: input.title,
      content,
      revision: 0,
      dirty: false,
      selection: { start: 0, end: 0, selectedText: "" },
      viewMode: "preview",
      history: {
        entries: [{ content, selectionStart: 0, selectionEnd: 0 }],
        currentIndex: 0,
      },
    };
  }

  serialize(runtime: MarkdownRuntimeState) {
    return runtime.content;
  }

  getSelection(runtime: MarkdownRuntimeState): ArtifactSelection | null {
    return {
      type: runtime.selection.selectedText ? "text" : "none",
      text: runtime.selection.selectedText,
      html: "",
      path: `markdown:${runtime.selection.start}-${runtime.selection.end}`,
    };
  }

  getAgentContext(projectId: string, runtime: MarkdownRuntimeState): AgentArtifactContext {
    return {
      projectId,
      artifactId: projectId,
      type: this.type,
      content: this.serialize(runtime),
      selection: this.getSelection(runtime),
      revision: runtime.revision,
    };
  }

  createAiEditRequest(input: AgentEditRequestInput<MarkdownRuntimeState>): AiEditRequest {
    const context = this.getAgentContext(input.projectId, input.runtime);
    const selectedText = context.selection?.text ?? "";
    return {
      htmlContent: context.content,
      selectedText,
      selectedHtml: "",
      selectionType: selectedText ? "text" : "write",
      selectionPath: context.selection?.path ?? "",
      userPrompt: input.userPrompt,
      mode: selectedText ? "rewrite" : "write",
      runtimeProfileId: input.runtimeProfileId ?? null,
    };
  }
}

export const defaultMarkdownDocument = "";
