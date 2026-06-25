import type { RuntimeDocument, SelectionState } from "./types";

export type RuntimeAction =
  | {
      type: "load-document";
      title: string;
      document: RuntimeDocument;
      source: "imported-html" | "blank" | "fixture";
    }
  | {
      type: "selection-changed";
      selection: SelectionState | null;
    }
  | {
      type: "sync-from-editor";
      document: RuntimeDocument;
      operationType: string;
      description: string;
      selection?: SelectionState | null;
    }
  | {
      type: "apply-history-index";
      index: number;
      document: RuntimeDocument;
      selection: SelectionState | null;
    };
