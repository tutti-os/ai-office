import type { PointerEvent } from "react";
import {
  applyDeckObjectRect,
  applyDeckObjectRotation,
  collectDeckSnapTargets,
  isMovableDeckObject,
  movedDeckRectForDelta,
  readDeckObjectGeometry,
  readDeckObjectRect,
  resizedDeckRectForHandle,
  snappedDeckDragRect,
  type DeckObjectElement,
  type DeckObjectGeometry,
  type DeckSnapGuide,
} from "../artifact/deckInteractionLayer";
import { angleDelta, enableTextResizeWrapping, pointerAngle, readSelectionBox, snapRotation } from "./deckEditorDom";
import type { ActiveDeckObject, ActiveDeckSelectionBox, ResizeHandle } from "./deckEditorTypes";

export function useDeckObjectPointerActions(input: {
  activeObject: ActiveDeckObject | null;
  activeSelectionBox: ActiveDeckSelectionBox | null;
  canvas: { width: number; height: number };
  findActiveObject: () => DeckObjectElement | null;
  readOnlyRef: { current: boolean };
  scale: number;
  recordSlideHistory: (slideId: string, doc: Document) => void;
  scheduleSlideSave: (slideId: string) => void;
  setActiveObjectGeometry: (geometry: DeckObjectGeometry | null) => void;
  setActiveSelectionBox: (box: ActiveDeckSelectionBox | null) => void;
  setSnapGuides: (guides: DeckSnapGuide[]) => void;
}) {
  const beginResizeObject = (handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (input.readOnlyRef.current) return;
    const object = input.findActiveObject();
    if (!object || !input.activeObject || !input.activeSelectionBox || input.scale <= 0) return;
    const initialRect = readDeckObjectRect(object);
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - startClientX) / input.scale;
      const deltaY = (moveEvent.clientY - startClientY) / input.scale;
      const nextRect = resizedDeckRectForHandle(handle, initialRect, deltaX, deltaY, input.canvas.width, input.canvas.height);
      applyDeckObjectRect(object, nextRect, { onTextboxResize: enableTextResizeWrapping });
      input.setActiveObjectGeometry(readDeckObjectGeometry(object));
      input.setActiveSelectionBox(readSelectionBox(input.activeObject!.slideId, object, input.scale));
    };

    const onPointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      input.setActiveSelectionBox(readSelectionBox(input.activeObject!.slideId, object, input.scale));
      input.setActiveObjectGeometry(readDeckObjectGeometry(object));
      input.recordSlideHistory(input.activeObject!.slideId, object.ownerDocument);
      input.scheduleSlideSave(input.activeObject!.slideId);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  };

  const beginDragObject = (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (input.readOnlyRef.current) return;
    const object = input.findActiveObject();
    if (!object || !input.activeObject || input.scale <= 0 || !isMovableDeckObject(object)) return;
    const initialRect = readDeckObjectRect(object);
    const snapTargets = collectDeckSnapTargets(object, input.canvas.width, input.canvas.height);
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let didMove = false;
    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - startClientX) / input.scale;
      const deltaY = (moveEvent.clientY - startClientY) / input.scale;
      if (!didMove && Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY) < 2) return;
      didMove = true;
      const rawRect = movedDeckRectForDelta(initialRect, deltaX, deltaY, input.canvas.width, input.canvas.height);
      const snapped = snappedDeckDragRect(rawRect, snapTargets, 8 / input.scale, input.canvas.width, input.canvas.height);
      applyDeckObjectRect(object, snapped.rect, { onTextboxResize: enableTextResizeWrapping, preserveSize: true });
      input.setActiveObjectGeometry(readDeckObjectGeometry(object));
      input.setActiveSelectionBox(readSelectionBox(input.activeObject!.slideId, object, input.scale));
      input.setSnapGuides(snapped.guides);
    };

    const onPointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      input.setSnapGuides([]);
      input.setActiveSelectionBox(readSelectionBox(input.activeObject!.slideId, object, input.scale));
      input.setActiveObjectGeometry(readDeckObjectGeometry(object));
      if (!didMove) return;
      input.recordSlideHistory(input.activeObject!.slideId, object.ownerDocument);
      input.scheduleSlideSave(input.activeObject!.slideId);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  };

  const beginRotateObject = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (input.readOnlyRef.current) return;
    const object = input.findActiveObject();
    if (!object || !input.activeObject || !input.activeSelectionBox || input.scale <= 0) return;
    const selectionElement = event.currentTarget.parentElement;
    const stage = selectionElement?.offsetParent instanceof HTMLElement ? selectionElement.offsetParent : null;
    const stageRect = stage?.getBoundingClientRect();
    if (!stageRect) return;
    const initialGeometry = readDeckObjectGeometry(object);
    const centerClientX = stageRect.left + input.activeSelectionBox.left + input.activeSelectionBox.width / 2;
    const centerClientY = stageRect.top + input.activeSelectionBox.top + input.activeSelectionBox.height / 2;
    let previousAngle = pointerAngle(event.clientX, event.clientY, centerClientX, centerClientY);
    let rawRotation = initialGeometry.rotation;
    let totalDelta = 0;
    let didRotate = false;
    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const nextAngle = pointerAngle(moveEvent.clientX, moveEvent.clientY, centerClientX, centerClientY);
      const delta = angleDelta(previousAngle, nextAngle);
      previousAngle = nextAngle;
      rawRotation += delta;
      totalDelta += delta;
      if (!didRotate && Math.abs(totalDelta) < 0.5) return;
      didRotate = true;
      const rotation = moveEvent.shiftKey ? snapRotation(rawRotation, 15) : rawRotation;
      applyDeckObjectRotation(object, rotation);
      input.setActiveObjectGeometry(readDeckObjectGeometry(object));
      input.setActiveSelectionBox(readSelectionBox(input.activeObject!.slideId, object, input.scale));
    };

    const onPointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      input.setActiveObjectGeometry(readDeckObjectGeometry(object));
      input.setActiveSelectionBox(readSelectionBox(input.activeObject!.slideId, object, input.scale));
      if (!didRotate) return;
      input.recordSlideHistory(input.activeObject!.slideId, object.ownerDocument);
      input.scheduleSlideSave(input.activeObject!.slideId);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  };

  return { beginDragObject, beginResizeObject, beginRotateObject };
}
