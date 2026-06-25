import type { RuntimeDocument, RuntimeSnapshot, SelectionState } from "./types";

export function createRuntimeDocumentSnapshot(
  document: RuntimeDocument,
  selection: SelectionState | null,
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
      innerHTML: document.bodyInnerHTML,
      bodyAttributes: document.bodyAttributes,
    },
    selectionState: selection,
    scrollState: {
      scrollX: 0,
      scrollY: 0,
    },
    operationType: input.operationType,
    description: input.description ?? input.operationType,
    metadata: input.metadata ?? {},
  };
}
