import { captureSelectionState, restoreSelectionState } from "./selection";
import type { RuntimeSnapshot } from "./types";

export function createRuntimeSnapshot(
  doc: Document,
  input: {
    operationType: string;
    description?: string;
    metadata?: Record<string, unknown>;
  },
): RuntimeSnapshot {
  return {
    id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    htmlContent: {
      innerHTML: doc.body.innerHTML,
      bodyAttributes: attributesToRecord(doc.body),
    },
    selectionState: captureSelectionState(doc),
    scrollState: {
      scrollX: doc.defaultView?.scrollX ?? 0,
      scrollY: doc.defaultView?.scrollY ?? 0,
    },
    operationType: input.operationType,
    description: input.description ?? input.operationType,
    metadata: input.metadata ?? {},
  };
}

export function applyRuntimeSnapshot(doc: Document, snapshot: RuntimeSnapshot) {
  doc.body.innerHTML = snapshot.htmlContent.innerHTML;
  replaceAttributes(doc.body, snapshot.htmlContent.bodyAttributes);
  restoreSelectionState(doc, snapshot.selectionState);
  doc.defaultView?.scrollTo(snapshot.scrollState.scrollX, snapshot.scrollState.scrollY);
}

function attributesToRecord(element: Element): Record<string, string> {
  return Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, attr.value]));
}

function replaceAttributes(element: Element, next: Record<string, string>) {
  Array.from(element.attributes).forEach((attr) => element.removeAttribute(attr.name));
  Object.entries(next).forEach(([name, value]) => element.setAttribute(name, value));
}
