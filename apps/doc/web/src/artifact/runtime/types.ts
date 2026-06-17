export type RuntimeDocumentSource = "imported-html" | "blank" | "fixture";

export interface RuntimeDocument {
  doctype: string;
  htmlAttributes: Record<string, string>;
  headHTML: string;
  bodyAttributes: Record<string, string>;
  bodyInnerHTML: string;
}

export interface RuntimeState {
  id: string;
  title: string;
  source: RuntimeDocumentSource;
  document: RuntimeDocument;
  revision: number;
  dirty: boolean;
  activeSelection: SelectionState | null;
  history: RuntimeHistory;
}

export interface RuntimeHistory {
  snapshots: RuntimeSnapshot[];
  currentIndex: number;
  isApplying: boolean;
}

export interface RuntimeSnapshot {
  id: string;
  timestamp: number;
  htmlContent: {
    innerHTML: string;
    bodyAttributes: Record<string, string>;
  };
  selectionState: SelectionState | null;
  scrollState: ScrollState;
  operationType: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface SelectionState {
  selectedText: string;
  selectedHtml: string;
  selectionType: "text" | "element" | "write";
  anchorPath: string;
  focusPath: string;
  commonAncestorPath: string;
  startPath?: string;
  startOffset?: number;
  endPath?: string;
  endOffset?: number;
}

export interface ScrollState {
  scrollX: number;
  scrollY: number;
}
