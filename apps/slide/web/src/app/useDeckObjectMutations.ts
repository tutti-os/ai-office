import type { ChangeEvent } from "react";
import {
  applyInlineFormat,
  applyPresentationStyle,
  captureRichTextSelection,
  restoreRichTextSelectionByTextOffsets,
  type InlineFormatTag,
  type RichTextStyle,
} from "@ai-app/ui/rich-text";
import {
  alignedDeckObjectRect,
  applyDeckObjectRect,
  applyDeckObjectRotation,
  readDeckObjectGeometry,
  type DeckObjectAlignment,
  type DeckObjectElement,
  type DeckObjectGeometry,
  type DeckObjectGeometryPatch,
} from "../artifact/deckInteractionLayer";
import { uploadDeckAsset } from "../api/projects";
import { projectAssetUrl } from "./deckAssetUrls";
import {
  applyTextAlignmentToObject,
  applyTextColorToObject,
  enableTextResizeWrapping,
  isHtmlElement,
  offsetPx,
  readActualDeckToolbarState,
  readDeckToolbarState,
  readSelectionBox,
  replaceDeckImageObjectSource,
} from "./deckEditorDom";
import type { ActiveDeckObject, ActiveDeckSelectionBox, ActiveTextEdit, ActiveTextSelection, DeckSelectionMode, DeckToolbarState } from "./deckEditorTypes";

export function useDeckObjectMutations(input: {
  activeObject: ActiveDeckObject | null;
  activeTextEdit: ActiveTextEdit | null;
  activeTextSelectionRef: { current: ActiveTextSelection | null };
  canvas: { width: number; height: number };
  fileRef: string;
  findActiveObject: () => DeckObjectElement | null;
  findActiveTextTarget: (object: DeckObjectElement) => DeckObjectElement;
  imageFileInputRef: { current: HTMLInputElement | null };
  projectId: string;
  readOnlyRef: { current: boolean };
  restoreActiveTextSelection: (textTarget: HTMLElement) => void;
  scale: number;
  recordSlideHistory: (slideId: string, doc: Document) => void;
  scheduleSlideSave: (slideId: string) => void;
  setActiveObject: (object: ActiveDeckObject | null) => void;
  setActiveObjectGeometry: (geometry: DeckObjectGeometry | null) => void;
  setActiveSelectionBox: (box: ActiveDeckSelectionBox | null) => void;
  setActiveTextEdit: (edit: ActiveTextEdit | null) => void;
  setSaveState: (state: "saved" | "saving" | "error") => void;
  setSelectionMode: (mode: DeckSelectionMode) => void;
  setToolbarState: (state: DeckToolbarState) => void;
}) {
  const mutateActiveObject = (mutate: (object: DeckObjectElement, textTarget: DeckObjectElement) => void) => {
    if (input.readOnlyRef.current) return;
    const object = input.findActiveObject();
    if (!object || !input.activeObject) return;
    const textTarget = input.findActiveTextTarget(object);
    mutate(object, textTarget);
    if (!input.activeTextEdit) object.setAttribute("data-ai-slide-selected", "true");
    input.setActiveObjectGeometry(readDeckObjectGeometry(object));
    input.setActiveSelectionBox(readSelectionBox(input.activeObject.slideId, object, input.scale));
    input.setToolbarState(input.activeTextEdit ? readActualDeckToolbarState(object, textTarget) : readDeckToolbarState(object));
    input.recordSlideHistory(input.activeObject.slideId, object.ownerDocument);
    input.scheduleSlideSave(input.activeObject.slideId);
  };

  const applyActiveTextOperation = (operation: (doc: Document, textTarget: HTMLElement) => boolean) => {
    if (!input.activeTextEdit) return;
    mutateActiveObject((_object, textTarget) => {
      if (!isHtmlElement(textTarget)) return;
      input.restoreActiveTextSelection(textTarget);
      const preservedSelection = captureRichTextSelection(textTarget.ownerDocument, textTarget);
      operation(textTarget.ownerDocument, textTarget);
      if (preservedSelection) restoreRichTextSelectionByTextOffsets(textTarget.ownerDocument, textTarget, preservedSelection);
      const selection = captureRichTextSelection(textTarget.ownerDocument, textTarget);
      if (selection) input.activeTextSelectionRef.current = { ...input.activeTextEdit!, selection };
    });
  };

  const updateTextStyle = (style: RichTextStyle) => {
    applyActiveTextOperation((doc, textTarget) => applyPresentationStyle(doc, style, textTarget));
  };

  const updateTextAlignment = (align: "left" | "center" | "right") => {
    if (input.activeTextEdit) {
      updateTextStyle({ textAlign: align });
      return;
    }
    mutateActiveObject((object) => applyTextAlignmentToObject(object, align));
  };

  const updateTextColor = (color: string) => {
    if (input.activeTextEdit) {
      updateTextStyle({ color });
      return;
    }
    mutateActiveObject((object) => applyTextColorToObject(object, color));
  };

  const toggleInlineFormat = (tagName: InlineFormatTag) => {
    applyActiveTextOperation((doc, textTarget) => applyInlineFormat(doc, tagName, textTarget));
  };

  const updateObjectStyle = (style: Partial<CSSStyleDeclaration>) => {
    mutateActiveObject((object) => {
      Object.assign(object.style, style);
    });
  };

  const requestImageReplacement = () => {
    if (input.readOnlyRef.current) return;
    if (input.activeObject?.objectType !== "image") return;
    const fileInput = input.imageFileInputRef.current;
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.click();
  };

  const replaceActiveImageFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (input.readOnlyRef.current) return;
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const asset = await uploadDeckAsset(input.projectId, file);
      const src = projectAssetUrl(input.projectId, input.fileRef, `assets/${asset.fileName}`);
      mutateActiveObject((object) => replaceDeckImageObjectSource(object, src));
    } catch {
      input.setSaveState("error");
    }
  };

  const updateActiveObjectGeometry = (patch: DeckObjectGeometryPatch) => {
    mutateActiveObject((object) => {
      const current = readDeckObjectGeometry(object);
      const nextRect = {
        left: patch.left ?? current.left,
        top: patch.top ?? current.top,
        width: patch.width ?? current.width,
        height: patch.height ?? current.height,
      };
      const rectChanged =
        nextRect.left !== current.left ||
        nextRect.top !== current.top ||
        nextRect.width !== current.width ||
        nextRect.height !== current.height;
      if (rectChanged) {
        const sizeChanged = patch.width !== undefined || patch.height !== undefined;
        applyDeckObjectRect(object, nextRect, { onTextboxResize: enableTextResizeWrapping, preserveSize: !sizeChanged });
      }
      if (patch.rotation !== undefined) applyDeckObjectRotation(object, patch.rotation);
    });
  };

  const alignActiveObjectGeometry = (alignment: DeckObjectAlignment) => {
    mutateActiveObject((object) => {
      const current = readDeckObjectGeometry(object);
      const nextRect = alignedDeckObjectRect(current, alignment, input.canvas.width, input.canvas.height);
      applyDeckObjectRect(object, nextRect, { onTextboxResize: enableTextResizeWrapping, preserveSize: true });
    });
  };

  const duplicateActiveObject = () => {
    mutateActiveObject((object) => {
      const clone = object.cloneNode(true) as DeckObjectElement;
      clone.removeAttribute("data-ai-slide-selected");
      clone.removeAttribute("contenteditable");
      clone.querySelectorAll?.("[contenteditable], [data-ai-slide-text-edit-id]").forEach((element) => {
        element.removeAttribute("contenteditable");
        element.removeAttribute("spellcheck");
        element.removeAttribute("data-ai-slide-text-edit-id");
      });
      clone.setAttribute("data-ai-slide-object-id", `object-${Date.now().toString(36)}`);
      clone.style.left = offsetPx(clone.style.left, 24);
      clone.style.top = offsetPx(clone.style.top, 24);
      object.after(clone);
    });
  };

  const deleteActiveObject = () => {
    if (input.readOnlyRef.current) return;
    const object = input.findActiveObject();
    if (!object || !input.activeObject) return;
    object.remove();
    input.setActiveObject(null);
    input.setActiveObjectGeometry(null);
    input.setActiveSelectionBox(null);
    input.setActiveTextEdit(null);
    input.setSelectionMode("idle");
    input.recordSlideHistory(input.activeObject.slideId, object.ownerDocument);
    input.scheduleSlideSave(input.activeObject.slideId);
  };

  return {
    alignActiveObjectGeometry,
    deleteActiveObject,
    duplicateActiveObject,
    replaceActiveImageFromFile,
    requestImageReplacement,
    toggleInlineFormat,
    updateActiveObjectGeometry,
    updateObjectStyle,
    updateTextAlignment,
    updateTextColor,
    updateTextStyle,
  };
}
