import { getRuntimeTitle, parseRuntimeDocument, runtimeDocumentFromFrame } from "./document";
import { createRuntimeSnapshot } from "./snapshot";
import type { RuntimeAction } from "./actions";
import type { RuntimeDocumentSource, RuntimeState } from "./types";

export class RuntimeApplier {
  createStateFromHtml(html: string, input: { source: RuntimeDocumentSource; title?: string }): RuntimeState {
    const document = parseRuntimeDocument(html);
    return {
      id: `runtime-${Date.now()}`,
      title: input.title || getRuntimeTitle(document),
      source: input.source,
      document,
      revision: 0,
      dirty: false,
      activeSelection: null,
      history: {
        snapshots: [],
        currentIndex: -1,
        isApplying: false,
      },
    };
  }

  apply(state: RuntimeState, action: RuntimeAction): RuntimeState {
    if (action.type === "load-document") {
      return {
        id: `runtime-${Date.now()}`,
        title: action.title,
        source: action.source,
        document: action.document,
        revision: 0,
        dirty: false,
        activeSelection: null,
        history: {
          snapshots: [],
          currentIndex: -1,
          isApplying: false,
        },
      };
    }

    if (action.type === "frame-loaded") {
      return {
        ...state,
        document: action.document,
        revision: state.revision + 1,
        dirty: false,
      };
    }

    if (action.type === "selection-changed") {
      return {
        ...state,
        activeSelection: action.selection,
      };
    }

    if (action.type === "sync-from-frame") {
      return {
        ...state,
        document: action.document,
        revision: state.revision + 1,
        dirty: true,
        activeSelection: "selection" in action ? action.selection ?? null : state.activeSelection,
      };
    }

    if (action.type === "apply-history-index") {
      return {
        ...state,
        document: action.document,
        revision: state.revision + 1,
        dirty: true,
        activeSelection: action.selection,
        history: {
          ...state.history,
          currentIndex: action.index,
          isApplying: false,
        },
      };
    }

    return state;
  }

  recordSnapshot(state: RuntimeState, doc: Document, input: { operationType: string; description?: string; replaceCurrent?: boolean }): RuntimeState {
    const snapshot = createRuntimeSnapshot(doc, input);
    const snapshots = state.history.snapshots.slice(0, state.history.currentIndex + 1);
    if (input.replaceCurrent && state.history.currentIndex >= 0) {
      snapshots[state.history.currentIndex] = snapshot;
      return {
        ...state,
        history: {
          snapshots,
          currentIndex: state.history.currentIndex,
          isApplying: false,
        },
      };
    }
    snapshots.push(snapshot);
    return {
      ...state,
      history: {
        snapshots,
        currentIndex: snapshots.length - 1,
        isApplying: false,
      },
    };
  }

  syncFromFrame(
    state: RuntimeState,
    doc: Document,
    input: { operationType: string; description: string; replaceCurrentSnapshot?: boolean; selection?: RuntimeState["activeSelection"] },
  ) {
    return this.apply(
      this.recordSnapshot(state, doc, { ...input, replaceCurrent: input.replaceCurrentSnapshot }),
      {
        type: "sync-from-frame",
        document: runtimeDocumentFromFrame(doc),
        operationType: input.operationType,
        description: input.description,
        selection: input.selection,
      },
    );
  }
}
