import {
  clearTableCellSelection,
  cleanupAbandonedTypingStyleMarkers,
  cleanupTypingStyleMarkers,
  getEditorStats,
} from "../artifact/runtime/operations";
import { RuntimeApplier } from "../artifact/runtime/applier";
import { runtimeDocumentFromFrame } from "../artifact/runtime/document";
import { refreshEditableFrameContent } from "../artifact/runtime/frame";
import { applyRuntimeSnapshot, createRuntimeSnapshot } from "../artifact/runtime/snapshot";
import type { RuntimeState, SelectionState } from "../artifact/runtime/types";
import { captureSelectionState, restoreSelectionState } from "../artifact/runtime/selection";
import {
  currentSelectionElement,
  ensureEditorSelection,
  isElementNode,
  isFallbackOnlySelection,
  readToolbarState,
  resolveEditorTarget,
  shouldMergeEditorHistory,
  usableSelection,
} from "./htmlRuntimeDom";
import type { EditorStats, ToolbarState } from "./runtimeWorkbenchTypes";

type Ref<T> = { current: T };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

export type HtmlEditorOperation = {
  operationType: string;
  description: string;
  requiresSelection?: boolean;
  preferTypingSelection?: boolean;
  mutate: (doc: Document, target: Element | null) => boolean | Element;
};

export class HtmlEditorController {
  constructor(
    private readonly deps: {
      applier: RuntimeApplier;
      iframeRef: Ref<HTMLIFrameElement | null>;
      lastEditorTargetRef: Ref<Node | null>;
      lastResolvedTargetRef: Ref<Element | null>;
      lastSelectionRef: Ref<SelectionState | null>;
      toolbarSelectionPreserveTimestampRef: Ref<number>;
      isReadOnly: () => boolean;
      setEditorStats: StateSetter<EditorStats>;
      setRuntime: StateSetter<RuntimeState | null>;
      setToolbarState: StateSetter<ToolbarState>;
    },
  ) {}

  syncSelection(fallbackNode?: Node | null) {
    const doc = this.currentDocument();
    if (!doc) return;
    const markerCleaned = cleanupAbandonedTypingStyleMarkers(doc);
    const selection = captureSelectionState(doc, fallbackNode);
    this.rememberContext(doc, selection, fallbackNode ?? null);
    const fallbackTarget = resolveEditorTarget(doc, fallbackNode ?? null, selection?.commonAncestorPath ?? "");
    const liveSelectionTarget = currentSelectionElement(doc);
    const toolbarTarget = fallbackTarget ?? liveSelectionTarget ?? fallbackNode ?? null;
    this.deps.setToolbarState(readToolbarState(doc, toolbarTarget, selection?.commonAncestorPath ?? ""));
    this.deps.setEditorStats(getEditorStats(doc));
    this.deps.setRuntime((current) =>
      current
        ? markerCleaned
          ? this.deps.applier.syncFromFrame(current, doc, {
              operationType: "cleanupTypingStyleMarker",
              description: "Clean unused typing style marker",
              replaceCurrentSnapshot: true,
              selection,
            })
          : this.deps.applier.apply(current, { type: "selection-changed", selection })
        : current,
    );
  }

  syncMutation(operationType: string, description: string) {
    if (this.deps.isReadOnly()) return;
    const doc = this.currentDocument();
    if (!doc) return;
    cleanupTypingStyleMarkers(doc);
    clearTableCellSelection(doc);
    const selection = captureSelectionState(doc, this.deps.lastEditorTargetRef.current);
    this.rememberContext(doc, selection, this.deps.lastEditorTargetRef.current);
    this.deps.setEditorStats(getEditorStats(doc));
    this.deps.setRuntime((current) =>
      current
        ? this.deps.applier.syncFromFrame(current, doc, {
            operationType,
            description,
            replaceCurrentSnapshot: shouldMergeEditorHistory(current, operationType),
            selection,
          })
        : current,
    );
  }

  preserveSelection(runtime: RuntimeState | null) {
    const now = Date.now();
    if (now - this.deps.toolbarSelectionPreserveTimestampRef.current < 16) return;
    this.deps.toolbarSelectionPreserveTimestampRef.current = now;
    const doc = this.currentDocument();
    if (!doc) return;
    const target =
      resolveEditorTarget(
        doc,
        this.deps.lastEditorTargetRef.current,
        this.deps.lastSelectionRef.current?.commonAncestorPath ?? runtime?.activeSelection?.commonAncestorPath ?? "",
      ) ??
      currentSelectionElement(doc) ??
      this.deps.lastResolvedTargetRef.current ??
      null;
    const selection = captureSelectionState(doc, target ?? this.deps.lastEditorTargetRef.current);
    this.rememberContext(doc, selection, target ?? this.deps.lastEditorTargetRef.current);
    this.deps.setRuntime((current) => (current ? this.deps.applier.apply(current, { type: "selection-changed", selection }) : current));
  }

  executeOperation(runtime: RuntimeState | null, input: HtmlEditorOperation) {
    if (this.deps.isReadOnly()) return false;
    const doc = this.currentDocument();
    if (!doc || !runtime) return false;
    const shouldMergeHistory = shouldMergeEditorHistory(runtime, input.operationType);
    const liveSelectionTarget = currentSelectionElement(doc);
    const stableTarget = liveSelectionTarget ?? this.deps.lastResolvedTargetRef.current ?? null;
    const liveSelection = captureSelectionState(doc, stableTarget ?? this.deps.lastEditorTargetRef.current);
    const storedSelection = this.deps.lastSelectionRef.current ?? runtime.activeSelection;
    const operationSelection =
      input.preferTypingSelection && isFallbackOnlySelection(liveSelection) && usableSelection(storedSelection)
        ? storedSelection
        : usableSelection(liveSelection)
          ? liveSelection
          : storedSelection;
    if (input.requiresSelection && (!operationSelection || operationSelection.selectionType === "write")) return false;
    const operationFallbackPath = operationSelection?.commonAncestorPath ?? "";
    const hasRangeSelection = Boolean(operationSelection && operationSelection.selectionType !== "write");
    const hasPreciseTypingSelection = Boolean(
      input.preferTypingSelection &&
        operationSelection?.selectionType === "write" &&
        operationSelection.startPath &&
        operationSelection.endPath,
    );
    const target = hasRangeSelection
      ? resolveEditorTarget(doc, null, operationFallbackPath) ?? stableTarget
      : resolveEditorTarget(doc, stableTarget ?? this.deps.lastEditorTargetRef.current, operationFallbackPath) ?? stableTarget;
    restoreSelectionState(doc, operationSelection);
    if (!hasPreciseTypingSelection) {
      ensureEditorSelection(doc, target ?? this.deps.lastEditorTargetRef.current, {
        forceFallback: !hasRangeSelection && !operationSelection?.startPath,
        fallbackPath: operationFallbackPath,
      });
    }
    const before = shouldMergeHistory
      ? runtime
      : this.deps.applier.recordSnapshot(runtime, doc, {
          operationType: `before_${input.operationType}`,
          description: `Before ${input.description}`,
        });
    const rollbackSnapshot = createRuntimeSnapshot(doc, {
      operationType: `rollback_${input.operationType}`,
      description: `Rollback ${input.description}`,
    });

    let changed: boolean | Element;
    try {
      changed = input.mutate(doc, hasPreciseTypingSelection ? null : target);
    } catch (error) {
      console.error(`Editor operation failed: ${input.operationType}`, error);
      this.restoreFailedOperation(doc, rollbackSnapshot, target, operationFallbackPath);
      return false;
    }
    if (!changed) {
      this.restoreFailedOperation(doc, rollbackSnapshot, target, operationFallbackPath);
      return false;
    }

    clearTableCellSelection(doc);
    const nextTarget = isElementNode(changed) ? changed : currentSelectionElement(doc) ?? target;
    const nextSelection = captureSelectionState(doc, nextTarget);
    this.rememberContext(doc, nextSelection, nextTarget);
    this.deps.lastEditorTargetRef.current = nextTarget;
    this.deps.lastResolvedTargetRef.current = nextTarget;
    this.deps.setToolbarState(readToolbarState(doc, nextTarget, nextSelection?.commonAncestorPath ?? operationFallbackPath));
    this.deps.setEditorStats(getEditorStats(doc));
    this.deps.setRuntime(this.deps.applier.syncFromFrame(before, doc, { ...input, replaceCurrentSnapshot: shouldMergeHistory, selection: nextSelection }));
    this.refocusFrame();
    return true;
  }

  applyHistoryOffset(runtime: RuntimeState | null, offset: -1 | 1) {
    if (this.deps.isReadOnly()) return;
    const doc = this.currentDocument();
    if (!doc || !runtime) return;
    const nextIndex = runtime.history.currentIndex + offset;
    const snapshot = runtime.history.snapshots[nextIndex];
    if (!snapshot) return;
    applyRuntimeSnapshot(doc, snapshot);
    this.refreshFrameAfterSnapshotRestore(doc, snapshot.selectionState);
    const restoredSelection = captureSelectionState(doc);
    const restoredTarget =
      currentSelectionElement(doc) ??
      resolveEditorTarget(doc, this.deps.lastEditorTargetRef.current, restoredSelection?.commonAncestorPath ?? "") ??
      this.deps.lastResolvedTargetRef.current;
    this.rememberContext(doc, restoredSelection, restoredTarget);
    this.deps.lastEditorTargetRef.current = restoredTarget ?? null;
    this.deps.lastResolvedTargetRef.current = restoredTarget ?? null;
    this.deps.setToolbarState(readToolbarState(doc, restoredTarget, restoredSelection?.commonAncestorPath ?? ""));
    this.deps.setEditorStats(getEditorStats(doc));
    this.deps.setRuntime((current) =>
      current
        ? this.deps.applier.apply(current, {
            type: "apply-history-index",
            index: nextIndex,
            document: runtimeDocumentFromFrame(doc),
            selection: restoredSelection,
          })
        : current,
    );
    this.deps.setToolbarState(readToolbarState(doc, restoredTarget, restoredSelection?.commonAncestorPath ?? ""));
    this.refocusFrame(doc, restoredTarget ?? null, restoredSelection);
  }

  refocusFrame(doc = this.currentDocument(), target?: Element | null, selection?: SelectionState | null) {
    this.focusFrame(doc, target ?? null, selection ?? null);
    requestAnimationFrame(() => this.focusFrame(doc, target ?? null, selection ?? null));
  }

  private currentDocument() {
    return this.deps.iframeRef.current?.contentDocument ?? null;
  }

  private focusFrame(doc: Document | null = this.currentDocument(), target?: Element | null, selection?: SelectionState | null) {
    const frame = this.deps.iframeRef.current;
    frame?.focus();
    frame?.contentWindow?.focus();
    if (!doc) return;
    const focusTarget = this.editableFocusTarget(doc, target ?? currentSelectionElement(doc) ?? null);
    focusTarget?.focus({ preventScroll: true });
    restoreSelectionState(doc, selection ?? this.deps.lastSelectionRef.current);
  }

  private rememberContext(doc: Document, selection: SelectionState | null, fallbackNode?: Node | null) {
    if (usableSelection(selection)) this.deps.lastSelectionRef.current = selection;
    const fallbackTarget = resolveEditorTarget(doc, fallbackNode ?? this.deps.lastEditorTargetRef.current, selection?.commonAncestorPath ?? "");
    const target = fallbackTarget ?? currentSelectionElement(doc) ?? null;
    if (target && target !== doc.body) {
      this.deps.lastResolvedTargetRef.current = target;
      this.deps.lastEditorTargetRef.current = target;
    }
  }

  private restoreFailedOperation(
    doc: Document,
    snapshot: ReturnType<typeof createRuntimeSnapshot>,
    previousTarget: Element | null,
    fallbackPath: string,
  ) {
    applyRuntimeSnapshot(doc, snapshot);
    this.refreshFrameAfterSnapshotRestore(doc, snapshot.selectionState);
    const restoredSelection = snapshot.selectionState;
    const restoredTarget =
      currentSelectionElement(doc) ??
      resolveEditorTarget(
        doc,
        previousTarget && doc.body.contains(previousTarget) ? previousTarget : this.deps.lastEditorTargetRef.current,
        restoredSelection?.commonAncestorPath ?? fallbackPath,
      ) ??
      null;
    this.deps.setToolbarState(readToolbarState(doc, restoredTarget, restoredSelection?.commonAncestorPath ?? fallbackPath));
    this.deps.setEditorStats(getEditorStats(doc));
    this.refocusFrame(doc, restoredTarget, restoredSelection);
  }

  private refreshFrameAfterSnapshotRestore(doc: Document, selection: SelectionState | null) {
    refreshEditableFrameContent(doc, this.deps.isReadOnly() ? { mode: "read-only" } : { mode: "editable" });
    restoreSelectionState(doc, selection);
  }

  private editableFocusTarget(doc: Document, target: Element | null) {
    const candidate = target?.closest<HTMLElement>('[contenteditable="true"]') ?? null;
    if (candidate && doc.body.contains(candidate)) return candidate;
    return doc.body;
  }
}
