import { serializeRuntimeDocument } from "./document";
import type { RuntimeState } from "./types";

export function runtimeStateToSrcDoc(state: RuntimeState) {
  return serializeRuntimeDocument(state.document);
}

export function enableEditableFrame(doc: Document) {
  doc.body.contentEditable = "true";
  doc.body.spellcheck = true;
  ensureRuntimeEditingStyles(doc);
}

function ensureRuntimeEditingStyles(doc: Document) {
  const styleId = "ai-document-runtime-editing-styles";
  if (doc.getElementById(styleId)) return;
  const style = doc.createElement("style");
  style.id = styleId;
  style.textContent = `
    td[data-ai-table-cell-selected],
    th[data-ai-table-cell-selected] {
      outline: 2px solid #3b82f6 !important;
      outline-offset: -2px !important;
      background-image: linear-gradient(rgba(59, 130, 246, 0.14), rgba(59, 130, 246, 0.14)) !important;
    }
  `;
  doc.head.append(style);
}
