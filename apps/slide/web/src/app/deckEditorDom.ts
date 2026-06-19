import type { CSSProperties } from "react";
import { selectedElementFromRange, type RichTextSelectionState } from "@ai-app/ui/rich-text";
import { readDeckObjectGeometry, type DeckObjectElement } from "../artifact/deckInteractionLayer";

type ActiveDeckSelectionBox = {
  slideId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
};

type DeckToolbarState = {
  block: "normal" | "heading" | "shape" | "image";
  fontFamily: string;
  fontSize: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  textColor: string;
  fillColor: string;
  align: "left" | "center" | "right" | "";
};

const defaultDeckToolbarState: DeckToolbarState = {
  block: "normal",
  fontFamily: "'PingFang SC', sans-serif",
  fontSize: "16",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textColor: "#1f2937",
  fillColor: "#ffffff",
  align: "",
};

const selectedDeckObjectToolbarState: DeckToolbarState = {
  block: "normal",
  fontFamily: "Inter, sans-serif",
  fontSize: "16",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textColor: "#000000",
  fillColor: "#ffffff",
  align: "",
};

const textBlockTags = new Set(["DIV", "H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "TD", "TH", "BLOCKQUOTE", "FIGCAPTION"]);
const inlineTextTags = new Set(["SPAN", "STRONG", "EM", "B", "I", "SMALL", "A", "CODE", "MARK"]);

export function textTargetForObject(object: DeckObjectElement, preferredTarget?: Element): DeckObjectElement {
  if (isHtmlElement(object) && object.getAttribute("data-object-type") === "textbox") {
    return textTargetFromPreferredElement(object, preferredTarget) ?? firstTextTargetForObject(object) ?? object;
  }
  return object;
}

export function textTargetForObjectAtPoint(object: DeckObjectElement, x: number, y: number): DeckObjectElement {
  const hit = object.ownerDocument.elementFromPoint(x, y);
  return textTargetForObject(object, isElement(hit) ? hit : undefined);
}

export function textTargetFromPreferredElement(object: HTMLElement, preferredTarget: Element | undefined): DeckObjectElement | null {
  if (!preferredTarget || !object.contains(preferredTarget)) return null;
  let cursor: Element | null = preferredTarget;
  let inlineFallback: HTMLElement | null = null;
  while (cursor && cursor !== object) {
    if (isHtmlElement(cursor) && hasEditableText(cursor)) {
      if (textBlockTags.has(cursor.tagName)) return cursor;
      if (!inlineFallback && inlineTextTags.has(cursor.tagName)) inlineFallback = cursor;
    }
    cursor = cursor.parentElement;
  }
  if (inlineFallback) return inlineFallback;
  return hasEditableText(object) ? object : null;
}

export function firstTextTargetForObject(object: HTMLElement): DeckObjectElement | null {
  const candidates = Array.from(object.querySelectorAll<HTMLElement>("div, h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption, span"));
  return candidates.find(hasEditableText) ?? null;
}

export function hasEditableText(element: HTMLElement) {
  return Boolean(element.textContent?.replace(/\s+/g, " ").trim());
}

export function ensureTextTargetId(target: DeckObjectElement): DeckObjectElement | null {
  if (!isHtmlElement(target)) return null;
  if (!target.getAttribute("data-ai-slide-text-edit-id")) {
    target.setAttribute("data-ai-slide-text-edit-id", `text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
  }
  return target;
}

export function findTextTargetById(object: DeckObjectElement, textTargetId: string) {
  if (!textTargetId || !isHtmlElement(object)) return null;
  if (object.getAttribute("data-ai-slide-text-edit-id") === textTargetId) return object;
  return object.querySelector<DeckObjectElement>(`[data-ai-slide-text-edit-id="${CSS.escape(textTargetId)}"]`);
}

export function isHtmlElement(value: unknown): value is HTMLElement {
  return isElement(value) && value.ownerDocument.defaultView ? value instanceof value.ownerDocument.defaultView.HTMLElement : false;
}

export function isSvgElement(value: unknown): value is SVGElement {
  return isElement(value) && value.ownerDocument.defaultView ? value instanceof value.ownerDocument.defaultView.SVGElement : false;
}

export function isElement(value: unknown): value is Element {
  return Boolean(value && typeof value === "object" && "ownerDocument" in value && "closest" in value);
}

export function nearestElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

export function isInsideEditable(value: unknown) {
  return isElement(value) && Boolean(value.closest('[contenteditable="true"]'));
}

export function isInsideKeyboardInput(value: unknown) {
  return isElement(value) && Boolean(value.closest("input, textarea, select, [contenteditable='true']"));
}

export function selectElementText(element: HTMLElement) {
  const doc = element.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function placeCaretInElement(element: HTMLElement, point?: { x: number; y: number }) {
  const doc = element.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  if (!selection) return;
  const range = caretRangeFromPoint(doc, point);
  if (range && (element === range.startContainer || element.contains(range.startContainer))) {
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  const fallback = doc.createRange();
  fallback.selectNodeContents(element);
  fallback.collapse(false);
  selection.removeAllRanges();
  selection.addRange(fallback);
}

export function queueTextEditCaretPlacement(element: HTMLElement, point: { x: number; y: number } | undefined, afterPlace: () => void) {
  const view = element.ownerDocument.defaultView;
  const place = () => {
    if (!element.isConnected || element.getAttribute("contenteditable") !== "true") return;
    element.focus();
    placeCaretInElement(element, point);
    afterPlace();
  };
  if (view?.requestAnimationFrame) {
    view.requestAnimationFrame(place);
    return;
  }
  view?.setTimeout(place, 0);
}

export function caretRangeFromPoint(doc: Document, point?: { x: number; y: number }) {
  if (!point) return null;
  const docWithCaret = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = docWithCaret.caretPositionFromPoint?.(point.x, point.y);
  if (position?.offsetNode) {
    const range = doc.createRange();
    range.setStart(position.offsetNode, clampNodeOffset(position.offsetNode, position.offset));
    return range;
  }
  return docWithCaret.caretRangeFromPoint?.(point.x, point.y) ?? null;
}

export function clampNodeOffset(node: Node, offset: number) {
  const max = node.nodeType === Node.TEXT_NODE ? node.textContent?.length ?? 0 : node.childNodes.length;
  return Math.max(0, Math.min(max, offset));
}

export function pointerAngle(clientX: number, clientY: number, centerClientX: number, centerClientY: number) {
  return (Math.atan2(clientY - centerClientY, clientX - centerClientX) * 180) / Math.PI;
}

export function angleDelta(from: number, to: number) {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

export function snapRotation(rotation: number, step: number) {
  return Math.round(rotation / step) * step;
}

export function hitTestDeckObject(doc: Document, x: number, y: number): DeckObjectElement | null {
  const view = doc.defaultView;
  const candidates = Array.from(doc.querySelectorAll<DeckObjectElement>('[data-object="true"]'))
    .map((object, order) => {
      const rect = object.getBoundingClientRect();
      const zIndex = Number.parseInt(view?.getComputedStyle(object).zIndex ?? "0", 10);
      return {
        object,
        order,
        zIndex: Number.isFinite(zIndex) ? zIndex : 0,
        area: rect.width * rect.height,
        depth: objectDepth(object),
        rect,
      };
    })
    .filter(({ rect }) => rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  candidates.sort((a, b) => a.zIndex - b.zIndex || a.depth - b.depth || b.area - a.area || a.order - b.order);
  return candidates.at(-1)?.object ?? null;
}

export function hitTestDeckObjectFromElementPoint(doc: Document, x: number, y: number): DeckObjectElement | null {
  const hit = doc.elementFromPoint(x, y);
  return isElement(hit) ? hit.closest<DeckObjectElement>('[data-object="true"]') : null;
}

export function objectDepth(object: Element) {
  let depth = 0;
  let cursor = object.parentElement;
  while (cursor) {
    depth += 1;
    cursor = cursor.parentElement;
  }
  return depth;
}

export function readSelectionBox(slideId: string, object: DeckObjectElement, scale: number): ActiveDeckSelectionBox {
  const geometry = readDeckObjectGeometry(object);
  return {
    slideId,
    left: geometry.left * scale,
    top: geometry.top * scale,
    width: Math.max(1, geometry.width * scale),
    height: Math.max(1, geometry.height * scale),
    rotation: geometry.rotation,
  };
}

export function enableTextResizeWrapping(object: DeckObjectElement) {
  if (!isHtmlElement(object)) return;
  applyTextResizeWrapping(object);
  object.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, li, span, strong, em, b, i, small, a, div").forEach(applyTextResizeWrapping);
}

export function applyTextResizeWrapping(element: HTMLElement) {
  element.style.minWidth = "0";
  element.style.maxWidth = "100%";
  element.style.whiteSpace = "normal";
  element.style.overflowWrap = "anywhere";
  element.style.wordBreak = "normal";
  element.style.lineBreak = "anywhere";
}

export function applyTextAlignmentToObject(object: DeckObjectElement, align: "left" | "center" | "right") {
  if (!isHtmlElement(object) || object.getAttribute("data-object-type") !== "textbox") return;
  object.style.textAlign = align;
  object.querySelectorAll<HTMLElement>("div, h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption").forEach((element) => {
    if (hasEditableText(element)) element.style.textAlign = align;
  });
}

export function applyTextColorToObject(object: DeckObjectElement, color: string) {
  if (!isHtmlElement(object) || object.getAttribute("data-object-type") !== "textbox") return;
  object.style.color = color;
  object.querySelectorAll<HTMLElement>("div, h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption, span, strong, em, b, i, small, a").forEach((element) => {
    if (hasEditableText(element)) element.style.color = color;
  });
}

export function editingShieldRects(box: ActiveDeckSelectionBox, frameWidth: number, frameHeight: number): CSSProperties[] {
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

export function readDeckToolbarState(object: DeckObjectElement): DeckToolbarState {
  const objectComputed = object.ownerDocument.defaultView?.getComputedStyle(object);
  const textTarget = isHtmlElement(object) && object.getAttribute("data-object-type") === "textbox" ? textTargetForObject(object) : object;
  const textComputed = textTarget.ownerDocument.defaultView?.getComputedStyle(textTarget);
  return {
    ...selectedDeckObjectToolbarState,
    textColor: rgbToHex(textComputed?.color) || selectedDeckObjectToolbarState.textColor,
    fillColor:
      rgbToHex(objectComputed?.backgroundColor) ||
      rgbToHex(isSvgElement(object) ? object.getAttribute("fill") ?? "" : "") ||
      selectedDeckObjectToolbarState.fillColor,
    align: normalizeTextAlign(textComputed?.textAlign || objectComputed?.textAlign),
  };
}

export function readActualDeckToolbarState(object: DeckObjectElement, textTarget: DeckObjectElement = textTargetForObject(object)): DeckToolbarState {
  const styleSource = currentRichTextStyleSource(textTarget) ?? textTarget;
  const textComputed = styleSource.ownerDocument.defaultView?.getComputedStyle(styleSource);
  const objectComputed = object.ownerDocument.defaultView?.getComputedStyle(object);
  const fontWeight = textComputed?.fontWeight ?? "400";
  const decoration = textComputed?.textDecorationLine ?? "";
  const fontSize = textComputed?.fontSize || defaultDeckToolbarState.fontSize;
  return {
    block: blockForDeckObject(object, fontSize, textTarget),
    fontFamily: normalizeFontFamily(textComputed?.fontFamily || defaultDeckToolbarState.fontFamily),
    fontSize: fontSizeNumber(fontSize),
    bold: fontWeight === "bold" || Number.parseInt(fontWeight, 10) >= 600,
    italic: textComputed?.fontStyle === "italic",
    underline: decoration.includes("underline"),
    strikethrough: decoration.includes("line-through"),
    textColor: rgbToHex(textComputed?.color) || defaultDeckToolbarState.textColor,
    fillColor:
      rgbToHex(objectComputed?.backgroundColor) ||
      rgbToHex(isSvgElement(object) ? object.getAttribute("fill") ?? "" : "") ||
      defaultDeckToolbarState.fillColor,
    align: normalizeTextAlign(textComputed?.textAlign),
  };
}

export function currentRichTextStyleSource(textTarget: DeckObjectElement) {
  const selection = textTarget.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const selectedElement = selectedElementFromRange(range);
  if (selectedElement && textTarget.contains(selectedElement)) return selectedElement;
  const anchor = nearestElement(range.commonAncestorContainer);
  return anchor && textTarget.contains(anchor) ? anchor : null;
}

export function ensureSlideEditorStyles(doc: Document) {
  const styleId = "ai-slide-editor-selection-style";
  if (!doc.head || doc.getElementById(styleId)) return;
  const style = doc.createElement("style");
  style.id = styleId;
  style.setAttribute("data-ai-slide-editor", "true");
  style.textContent = `
    [data-object="true"] {
      cursor: default;
    }
    [contenteditable="true"],
    [contenteditable="true"]:focus {
      outline: none !important;
      box-shadow: none !important;
    }
    ::selection {
      background: rgba(148, 163, 184, 0.35);
    }
  `;
  doc.head.append(style);
}

export function prepareSlideEditorDocument(doc: Document) {
  ensureSlideEditorStyles(doc);
  doc.querySelectorAll<DeckObjectElement>('[data-object="true"]').forEach((object, index) => {
    if (!object.getAttribute("data-ai-slide-object-id")) object.setAttribute("data-ai-slide-object-id", `object-${index + 1}`);
    if (isHtmlElement(object)) object.tabIndex = 0;
  });
}

export function applySlideHtmlSnapshot(doc: Document, html: string) {
  const snapshot = new DOMParser().parseFromString(html, "text/html");
  doc.documentElement.replaceWith(doc.importNode(snapshot.documentElement, true));
}

export function serializeSlideDocument(doc: Document) {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-ai-slide-editor-attached");
  clone.querySelectorAll("[data-ai-slide-editor]").forEach((element) => element.remove());
  clone.querySelectorAll<HTMLElement>("[data-ai-slide-object-id]").forEach((element) => {
    element.removeAttribute("data-ai-slide-object-id");
  });
  clone.querySelectorAll<HTMLElement>("[data-ai-slide-text-edit-id]").forEach((element) => {
    element.removeAttribute("data-ai-slide-text-edit-id");
  });
  clone.querySelectorAll<HTMLElement>("[data-ai-slide-selected]").forEach((element) => {
    element.removeAttribute("data-ai-slide-selected");
  });
  clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach((element) => {
    element.removeAttribute("contenteditable");
    element.removeAttribute("spellcheck");
  });
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : "<!DOCTYPE html>";
  return `${doctype}\n${clone.outerHTML}`;
}

export function serializeDeckObjectForAgent(object: DeckObjectElement) {
  const clone = object.cloneNode(true) as HTMLElement;
  cleanupDeckEditorAttributes(clone);
  clone.querySelectorAll<HTMLElement>("*").forEach(cleanupDeckEditorAttributes);
  return clone.outerHTML;
}

export function cleanupDeckEditorAttributes(element: HTMLElement) {
  element.removeAttribute("data-ai-slide-object-id");
  element.removeAttribute("data-ai-slide-text-edit-id");
  element.removeAttribute("data-ai-slide-selected");
  element.removeAttribute("contenteditable");
  element.removeAttribute("spellcheck");
  element.removeAttribute("tabindex");
}

export function deckObjectSelectionPath(slideId: string, object: DeckObjectElement) {
  const index = deckObjectIndex(object);
  return index >= 0 ? `deck:${slideId}/objects[${index}]` : `deck:${slideId}/object`;
}

export function deckTextSelectionPath(slideId: string, object: DeckObjectElement, textTarget: DeckObjectElement, selection: RichTextSelectionState) {
  const objectPath = deckObjectSelectionPath(slideId, object);
  const textIndex = deckTextTargetIndex(object, textTarget);
  const textPath = textIndex >= 0 ? `${objectPath}/text[${textIndex}]` : `${objectPath}/text`;
  return `${textPath}#${selection.startPath}:${selection.startOffset}-${selection.endPath}:${selection.endOffset}`;
}

export function deckObjectIndex(object: DeckObjectElement) {
  return Array.from(object.ownerDocument.querySelectorAll<DeckObjectElement>('[data-object="true"]')).indexOf(object);
}

export function deckTextTargetIndex(object: DeckObjectElement, textTarget: DeckObjectElement) {
  const candidates = [object, ...Array.from(object.querySelectorAll<DeckObjectElement>("div, h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption, span"))]
    .filter((candidate, index, list) => list.indexOf(candidate) === index)
    .filter((candidate) => isHtmlElement(candidate) && hasEditableText(candidate));
  return candidates.indexOf(textTarget);
}

export function normalizeCssSize(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return defaultDeckToolbarState.fontSize;
  return /^\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

export function fontSizeNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed * 10) / 10).replace(/\.0$/, "") : defaultDeckToolbarState.fontSize;
}

export function offsetPx(value: string, delta: number) {
  const numeric = Number.parseFloat(value || "0");
  return `${(Number.isFinite(numeric) ? numeric : 0) + delta}px`;
}

export function normalizeTextAlign(value: string | undefined): DeckToolbarState["align"] {
  if (value === "left" || value === "center" || value === "right") return value;
  return "";
}

export function normalizeFontFamily(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("ibm plex sans")) return "'IBM Plex Sans', sans-serif";
  if (normalized.includes("ibm plex mono")) return "'IBM Plex Mono', monospace";
  if (value.includes("JetBrains Mono")) return "'JetBrains Mono', monospace";
  if (normalized.includes("stix two text")) return "'STIX Two Text', serif";
  if (normalized.includes("times new roman")) return "'Times New Roman', serif";
  if (value.includes("Georgia")) return "Georgia, serif";
  if (value.includes("Arial")) return "Arial, sans-serif";
  return "Inter, sans-serif";
}

export function fontFamilyLabel(value: string) {
  return value
    .split(",")[0]
    .replaceAll("\"", "")
    .replaceAll("'", "")
    .trim() || "Font";
}

export function replaceDeckImageObjectSource(object: DeckObjectElement, src: string) {
  if (isHtmlImageElement(object)) {
    applyHtmlImageSource(object, src);
    return;
  }
  const image = object.querySelector?.("img");
  if (isHtmlImageElement(image)) {
    applyHtmlImageSource(image, src);
    return;
  }
  if (isSvgImageElement(object)) {
    object.setAttribute("href", src);
    object.setAttribute("xlink:href", src);
    return;
  }
  const svgImage = object.querySelector?.("image");
  if (isSvgImageElement(svgImage)) {
    svgImage.setAttribute("href", src);
    svgImage.setAttribute("xlink:href", src);
    return;
  }
  if (isHtmlElement(object)) {
    object.style.backgroundImage = `url("${src.replaceAll("\"", "\\\"")}")`;
    object.style.backgroundSize ||= "cover";
    object.style.backgroundPosition ||= "center";
  }
}

export function isHtmlImageElement(value: unknown): value is HTMLImageElement {
  return isElement(value) && value.ownerDocument.defaultView ? value instanceof value.ownerDocument.defaultView.HTMLImageElement : false;
}

export function isSvgImageElement(value: unknown): value is SVGImageElement {
  return isElement(value) && value.ownerDocument.defaultView ? value instanceof value.ownerDocument.defaultView.SVGImageElement : false;
}

export function applyHtmlImageSource(image: HTMLImageElement, src: string) {
  image.src = src;
  image.removeAttribute("srcset");
}

export function blockForDeckObject(object: DeckObjectElement, fontSize: string, textTarget: DeckObjectElement = textTargetForObject(object)): DeckToolbarState["block"] {
  const objectType = object.getAttribute("data-object-type");
  if (objectType === "shape") return "shape";
  if (objectType === "image") return "image";
  const size = Number.parseFloat(fontSize);
  const tag = textTarget.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag) || (Number.isFinite(size) && size >= 32)) return "heading";
  return "normal";
}

export function rgbToHex(value: string | undefined) {
  if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return "";
  if (value.startsWith("#")) return value;
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return "";
  return [match[1], match[2], match[3]]
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("")
    .replace(/^/, "#");
}

export function projectAssetUrl(projectId: string, fileRef: string, filePath: string, revision?: number) {
  const path = `/local-assets/projects/${encodeURIComponent(projectId)}/${[fileRef, ...filePath.split("/")].map(encodeURIComponent).join("/")}`;
  return revision ? `${path}?v=${encodeURIComponent(String(revision))}` : path;
}
