import { useEffect } from "react";
import type { ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import { clearTableCellSelection, getEditorStats } from "../artifact/runtime/operations";
import type { RuntimeApplier } from "../artifact/runtime/applier";
import { runtimeDocumentFromFrame } from "../artifact/runtime/document";
import { enableEditableFrame } from "../artifact/runtime/frame";
import type { RuntimeState } from "../artifact/runtime/types";
import { frameEventTarget, imageFromNode, removeImageSelectionOverlay } from "./htmlRuntimeDom";
import type { HtmlEditorController } from "./HtmlEditorController";
import type { EditorStats, ImageObjectElement } from "./runtimeWorkbenchTypes";

type Ref<T> = { current: T };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type HtmlFrameLifecycleInput = {
  applier: RuntimeApplier;
  artifactInteraction: ArtifactInteractionPolicy;
  artifactReadOnlyRef: Ref<boolean>;
  clearImageObjectSelection: (doc: Document) => void;
  currentDocumentType: "html" | "markdown" | "docx" | null;
  editorOpen: boolean;
  frameRevision: number;
  frameSrcDoc: string;
  htmlEditorController: HtmlEditorController;
  iframeRef: Ref<HTMLIFrameElement | null>;
  initializedFrameDocsRef: Ref<WeakSet<Document>>;
  lastEditorTargetRef: Ref<Node | null>;
  runtimeRef: Ref<RuntimeState | null>;
  selectImageObject: (doc: Document, image: ImageObjectElement) => void;
  setEditorStats: StateSetter<EditorStats>;
  setHtmlToolbarActive: (value: boolean) => void;
  setRuntime: StateSetter<RuntimeState | null>;
};

export function useHtmlFrameLifecycle(input: HtmlFrameLifecycleInput) {
  const handleFrameLoad = () => {
    const doc = input.iframeRef.current?.contentDocument;
    if (!doc) return;
    if (input.initializedFrameDocsRef.current.has(doc)) return;
    input.initializedFrameDocsRef.current.add(doc);
    enableEditableFrame(doc, input.artifactInteraction);
    input.setEditorStats(getEditorStats(doc));
    const queueSelectionSync = (fallbackNode?: Node | null) => {
      input.htmlEditorController.syncSelection(fallbackNode);
      const run = () => input.htmlEditorController.syncSelection(fallbackNode);
      if (doc.defaultView?.requestAnimationFrame) {
        doc.defaultView.requestAnimationFrame(run);
      } else {
        doc.defaultView?.setTimeout(run, 0);
      }
    };
    const activateToolbarFromFrame = () => input.setHtmlToolbarActive(true);
    doc.addEventListener("selectionchange", () => {
      if (doc.hasFocus() && doc.getSelection()?.rangeCount) activateToolbarFromFrame();
      queueSelectionSync(input.lastEditorTargetRef.current);
    });
    const syncFromFrameEvent = (event: Event) => {
      activateToolbarFromFrame();
      input.lastEditorTargetRef.current = frameEventTarget(doc, event);
      queueSelectionSync(input.lastEditorTargetRef.current);
    };
    const syncClickFromFrameEvent = (event: Event) => {
      activateToolbarFromFrame();
      const target = frameEventTarget(doc, event);
      const image = imageFromNode(target, doc);
      if (image) {
        event.preventDefault();
        event.stopPropagation();
        input.selectImageObject(doc, image);
        return;
      }
      input.clearImageObjectSelection(doc);
      input.lastEditorTargetRef.current = target;
      queueSelectionSync(target);
    };
    const handleFrameHistoryShortcut = (event: KeyboardEvent) => {
      const historyOffset = htmlHistoryShortcutOffset(event);
      if (!historyOffset) return;
      event.preventDefault();
      event.stopPropagation();
      if (input.artifactReadOnlyRef.current) return;
      input.htmlEditorController.applyHistoryOffset(input.runtimeRef.current, historyOffset);
    };
    clearTableCellSelection(doc);
    removeImageSelectionOverlay(doc);
    doc.addEventListener("focusin", activateToolbarFromFrame, true);
    doc.addEventListener("pointerdown", activateToolbarFromFrame, true);
    doc.addEventListener("keydown", handleFrameHistoryShortcut, true);
    doc.addEventListener("keyup", syncFromFrameEvent, true);
    doc.addEventListener("click", syncClickFromFrameEvent, true);
    doc.addEventListener("input", () => {
      activateToolbarFromFrame();
      input.htmlEditorController.syncMutation("input", "User edited doc body");
    });
    input.setRuntime((current) => {
      if (!current) return current;
      const loaded = input.applier.apply(current, {
        type: "frame-loaded",
        document: runtimeDocumentFromFrame(doc),
      });
      return loaded.history.snapshots.length > 0
        ? loaded
        : input.applier.recordSnapshot(loaded, doc, {
            operationType: "initial",
            description: "Initial doc load",
          });
    });
  };

  useEffect(() => {
    if (!input.editorOpen || input.currentDocumentType !== "html" || !input.frameSrcDoc) return;
    const frame = input.iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc?.body) return;
    const frameWindow = doc.defaultView;
    const run = () => handleFrameLoad();
    if (frameWindow?.requestAnimationFrame) {
      const id = frameWindow.requestAnimationFrame(run);
      return () => frameWindow.cancelAnimationFrame(id);
    }
    const id = window.setTimeout(run, 0);
    return () => window.clearTimeout(id);
  }, [input.currentDocumentType, input.editorOpen, input.frameRevision, input.frameSrcDoc]);

  return { handleFrameLoad };
}

function htmlHistoryShortcutOffset(event: KeyboardEvent): -1 | 1 | null {
  if (isNativeTextControlTarget(event.target)) return null;
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "y") return 1;
  if (key === "z") return event.shiftKey ? 1 : -1;
  return null;
}

function isNativeTextControlTarget(target: EventTarget | null) {
  if (!target || typeof target !== "object" || !("closest" in target)) return false;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== "function") return false;
  return Boolean((closest as (selector: string) => unknown).call(target, "input, textarea, select"));
}
