import type { DocumentProject } from "@ai-doc/shared";
import type { RuntimeState } from "../artifact/runtime/types";
import { markdownWordCount } from "./documentWorkbenchContent";
import { defaultToolbarState, type EditorStats, type ImageObjectElement, type ToolbarState } from "./runtimeWorkbenchTypes";

type Ref<T> = { current: T };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type DocumentRuntimeLoadersInput = {
  activeImageRef: Ref<ImageObjectElement | null>;
  clearArtifact: () => void;
  clearDocxArtifact: () => void;
  clearMarkdownArtifact: () => void;
  lastEditorTargetRef: Ref<Node | null>;
  lastResolvedTargetRef: Ref<Element | null>;
  lastSelectionRef: Ref<unknown>;
  loadArtifact: (input: { content: string; projectId?: string | null; title: string; source?: RuntimeState["source"] }) => void;
  loadDocxArtifact: (projectId: string, input: { content: string; title: string; source?: RuntimeState["source"] }) => Promise<unknown>;
  loadMarkdownArtifact: (input: { content: string; title: string; source?: RuntimeState["source"] }) => void;
  markdownTableCellCommitterRef: Ref<(() => boolean) | null>;
  setEditorStats: StateSetter<EditorStats>;
  setHtmlToolbarActive: StateSetter<boolean>;
  setMarkdownTableCellEditPending: StateSetter<boolean>;
  setQueuedHomeNavigation: StateSetter<boolean>;
  setToolbarState: StateSetter<ToolbarState>;
};

export function createDocumentRuntimeLoaders(input: DocumentRuntimeLoadersInput) {
  const clearSharedRuntimeUi = (stats: EditorStats) => {
    input.setMarkdownTableCellEditPending(false);
    input.markdownTableCellCommitterRef.current = null;
    input.setQueuedHomeNavigation(false);
    input.setToolbarState(defaultToolbarState);
    input.setHtmlToolbarActive(false);
    input.lastEditorTargetRef.current = null;
    input.lastResolvedTargetRef.current = null;
    input.lastSelectionRef.current = null;
    input.activeImageRef.current = null;
    input.setEditorStats(stats);
  };

  const loadHtmlDocument = (html: string, loadInput: { projectId?: string | null; title: string; source?: RuntimeState["source"] }) => {
    input.loadArtifact({ content: html, projectId: loadInput.projectId, title: loadInput.title, source: loadInput.source });
    input.clearMarkdownArtifact();
    input.clearDocxArtifact();
    clearSharedRuntimeUi({ characterCount: 0, wordCount: 0, paragraphCount: 0, elementCount: 0 });
  };

  const loadMarkdownDocument = (content: string, loadInput: { title: string; source?: RuntimeState["source"] }) => {
    input.loadMarkdownArtifact({ content, title: loadInput.title, source: loadInput.source });
    input.clearArtifact();
    input.clearDocxArtifact();
    clearSharedRuntimeUi({ characterCount: content.length, wordCount: markdownWordCount(content), paragraphCount: 0, elementCount: 0 });
  };

  const loadDocxDocument = async (project: DocumentProject) => {
    input.clearArtifact();
    input.clearMarkdownArtifact();
    clearSharedRuntimeUi({ characterCount: 0, wordCount: 0, paragraphCount: 0, elementCount: 0 });
    await input.loadDocxArtifact(project.id, { content: project.content, title: project.title, source: "imported-html" });
  };

  return { loadDocxDocument, loadHtmlDocument, loadMarkdownDocument };
}
