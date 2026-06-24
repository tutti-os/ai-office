import type { CSSProperties } from "react";

export type DeckSelectionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function editingShieldRects(box: DeckSelectionBox, frameWidth: number, frameHeight: number): CSSProperties[] {
  const left = clampRectValue(box.left, frameWidth);
  const top = clampRectValue(box.top, frameHeight);
  const right = clampRectValue(box.left + box.width, frameWidth);
  const bottom = clampRectValue(box.top + box.height, frameHeight);
  return [
    { left: 0, top: 0, width: frameWidth, height: top },
    { left: 0, top, width: left, height: Math.max(0, bottom - top) },
    { left: right, top, width: Math.max(0, frameWidth - right), height: Math.max(0, bottom - top) },
    { left: 0, top: bottom, width: frameWidth, height: Math.max(0, frameHeight - bottom) },
  ].filter((rect) => rect.width > 0 && rect.height > 0);
}

export function clampRectValue(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}
