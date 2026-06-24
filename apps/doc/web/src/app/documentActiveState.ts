import type { DocumentType } from "@ai-doc/shared";
import type { DocxRuntimeState } from "../artifact/docxArtifactAdapter";
import type { MarkdownRuntimeState } from "../artifact/markdownArtifactAdapter";
import type { RuntimeState } from "../artifact/runtime/types";

type DocumentActiveStateInput = {
  currentDocumentType: DocumentType | null;
  docxRuntime: DocxRuntimeState | null;
  docxSaveState: string;
  markdownRuntime: MarkdownRuntimeState | null;
  markdownSaveState: string;
  markdownTableCellEditPending: boolean;
  runtime: RuntimeState | null;
  saveState: string;
};

export function resolveDocumentActiveState(input: DocumentActiveStateInput) {
  const htmlHasUnsavedChanges = Boolean(input.runtime?.dirty) || input.saveState === "saving" || input.saveState === "error";
  const markdownHasUnsavedChanges =
    input.markdownTableCellEditPending || Boolean(input.markdownRuntime?.dirty) || input.markdownSaveState === "saving" || input.markdownSaveState === "error";
  const docxHasUnsavedChanges = input.docxSaveState === "saving" || input.docxSaveState === "error";
  const activeHasUnsavedChanges =
    input.currentDocumentType === "markdown"
      ? markdownHasUnsavedChanges
      : input.currentDocumentType === "docx"
        ? docxHasUnsavedChanges
        : input.currentDocumentType === "html"
          ? htmlHasUnsavedChanges
          : false;
  const activeSelectionText =
    input.currentDocumentType === "markdown"
      ? input.markdownRuntime?.selection.selectedText ?? ""
      : input.currentDocumentType === "docx"
        ? input.docxRuntime?.selection.selectedText ?? ""
        : input.currentDocumentType === "html"
          ? input.runtime?.activeSelection?.selectedText ?? ""
          : "";

  return {
    activeDirty: activeHasUnsavedChanges,
    activeHasUnsavedChanges,
    activeSelectionText,
    markdownHasUnsavedChanges,
  };
}
