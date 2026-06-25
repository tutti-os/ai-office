import { getRuntimeTitle, parseRuntimeDocument } from "./document";
import { createRuntimeDocumentSnapshot } from "./snapshot";
import type { RuntimeAction } from "./actions";
import type { RuntimeDocumentSource, RuntimeState } from "./types";

let runtimeStateSequence = 0;

export class RuntimeApplier {
  createStateFromHtml(html: string, input: { source: RuntimeDocumentSource; title?: string }): RuntimeState {
    const document = parseRuntimeDocument(html);
    return {
      id: createRuntimeStateId(),
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
        id: createRuntimeStateId(),
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

    if (action.type === "selection-changed") {
      return {
        ...state,
        activeSelection: action.selection,
      };
    }

    if (action.type === "sync-from-editor") {
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

  recordDocumentSnapshot(
    state: RuntimeState,
    input: {
      operationType: string;
      description?: string;
      replaceCurrent?: boolean;
      selection?: RuntimeState["activeSelection"];
    },
  ): RuntimeState {
    const snapshot = createRuntimeDocumentSnapshot(state.document, input.selection ?? state.activeSelection, input);
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

  syncFromEditorBody(
    state: RuntimeState,
    bodyInnerHTML: string,
    input: { operationType: string; description: string; replaceCurrentSnapshot?: boolean; selection?: RuntimeState["activeSelection"] },
  ) {
    const nextDocument = {
      ...state.document,
      bodyInnerHTML,
    };
    return this.apply(
      this.recordDocumentSnapshot(state, {
        ...input,
        replaceCurrent: input.replaceCurrentSnapshot,
        selection: input.selection,
      }),
      {
        type: "sync-from-editor",
        document: nextDocument,
        operationType: input.operationType,
        description: input.description,
        selection: input.selection,
      },
    );
  }
}

function createRuntimeStateId() {
  runtimeStateSequence += 1;
  return `runtime-${Date.now()}-${runtimeStateSequence}`;
}
