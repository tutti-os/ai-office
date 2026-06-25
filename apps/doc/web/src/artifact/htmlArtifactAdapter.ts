import type { AgentArtifactContext, ArtifactSelection, AiEditRequest } from "@ai-doc/shared";
import { RuntimeApplier } from "./runtime/applier";
import { serializeRuntimeDocument } from "./runtime/document";
import type { RuntimeState } from "./runtime/types";
import type { AgentEditRequestInput, ArtifactRuntimeAdapter, ArtifactRuntimeParseInput } from "./types";

export class HtmlArtifactRuntimeAdapter implements ArtifactRuntimeAdapter<RuntimeState> {
  readonly type = "html" as const;

  constructor(private readonly applier: RuntimeApplier) {}

  parse(input: ArtifactRuntimeParseInput) {
    return this.applier.createStateFromHtml(input.content, {
      source: input.source ?? "imported-html",
      title: input.title,
    });
  }

  serialize(runtime: RuntimeState) {
    return serializeRuntimeDocument(runtime.document);
  }

  getSelection(runtime: RuntimeState): ArtifactSelection | null {
    const selection = runtime.activeSelection;
    if (!selection) return null;
    return {
      type: selection.selectionType,
      text: selection.selectedText,
      html: selection.selectedHtml,
      path: selection.commonAncestorPath,
    };
  }

  getAgentContext(projectId: string, runtime: RuntimeState): AgentArtifactContext {
    return {
      projectId,
      artifactId: projectId,
      type: this.type,
      content: this.serialize(runtime),
      selection: this.getSelection(runtime),
      revision: runtime.revision,
    };
  }

  createAiEditRequest(input: AgentEditRequestInput<RuntimeState>): AiEditRequest {
    const context = this.getAgentContext(input.projectId, input.runtime);
    const selection = input.runtime.activeSelection;
    const hasEditableSelection = Boolean(
      selection && selection.selectionType !== "write" && (selection.selectedText.trim() || selection.selectedHtml.trim()),
    );
    return {
      htmlContent: context.content,
      selectedText: selection?.selectedText ?? "",
      selectedHtml: selection?.selectedHtml ?? "",
      selectionType: selection?.selectionType ?? "write",
      selectionPath: selection?.commonAncestorPath ?? "",
      userPrompt: input.userPrompt,
      mode: hasEditableSelection ? "rewrite" : "write",
      runtimeProfileId: input.runtimeProfileId ?? null,
    };
  }
}
