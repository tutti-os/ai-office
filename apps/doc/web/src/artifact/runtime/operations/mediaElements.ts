import { ImageAttributes, zeroWidthSpace } from './types';
import { ensureInsertionSelection, moveSelectionNearNode } from './clearFormatHelpers';
import { wrapRange } from './inlineHelpers';
import { elementAttributeTarget, elementContentTarget, elementMutationTarget, findNearestBlock } from './presentationHelpers';
import { applyImageAttributes, findTargetImage, isSafeAttributeName, normalizeEditableDocument, normalizeWrapperTag, sanitizeAttributeValue, sanitizeUrl } from './sanitizeHelpers';
import { isTableCellElement } from './tableSelection';
export function upsertImage(doc: Document, attributes: ImageAttributes, targetElement?: Element | null) {
  const src = sanitizeUrl(attributes.src);
  if (!src) return false;
  const existing = findTargetImage(doc, targetElement);
  if (existing) {
    applyImageAttributes(existing, { ...attributes, src });
    selectElement(doc, existing);
    return existing;
  }

  const image = doc.createElement("img");
  applyImageAttributes(image, { ...attributes, src });
  image.style.maxWidth = "100%";
  image.style.height = attributes.height?.trim() ? image.style.height : "auto";

  const selection = doc.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (!range.collapsed) range.deleteContents();
    range.insertNode(image);
  } else if (targetElement && targetElement !== doc.body && doc.body.contains(targetElement)) {
    const anchor = findNearestBlock(targetElement, doc) ?? targetElement;
    anchor.insertAdjacentElement("afterend", image);
  } else {
    ensureInsertionSelection(doc, targetElement);
    const nextSelection = doc.getSelection();
    if (nextSelection && nextSelection.rangeCount > 0) nextSelection.getRangeAt(0).insertNode(image);
    else doc.body.append(image);
  }

  selectElement(doc, image);
  normalizeEditableDocument(doc);
  return image;
}

export function removeImage(doc: Document, targetElement?: Element | null) {
  const image = findTargetImage(doc, targetElement);
  if (!image) return false;
  const next = image.nextSibling ?? image.previousSibling ?? image.parentElement;
  image.remove();
  if (next) moveSelectionNearNode(doc, next);
  return true;
}

export function getCurrentImageAttributes(doc: Document, targetElement?: Element | null): ImageAttributes {
  const image = findTargetImage(doc, targetElement);
  return {
    src: image?.getAttribute("src") ?? "",
    alt: image?.getAttribute("alt") ?? "",
    width: image ? image.style.width || image.getAttribute("width") || "" : "",
    height: image ? (image.style.height === "auto" ? "" : image.style.height || image.getAttribute("height") || "") : "",
  };
}

export function setElementAttributes(doc: Document, targetElement: Element | null | undefined, attributes: Record<string, string | null | undefined>) {
  const target = elementAttributeTarget(doc, targetElement);
  if (!target || target === doc.body || target === doc.documentElement) return false;
  Object.entries(attributes).forEach(([name, value]) => {
    if (!isSafeAttributeName(name)) return;
    if (value === null || value === undefined || value === "") target.removeAttribute(name);
    else {
      const safeValue = sanitizeAttributeValue(name, value);
      if (safeValue === null) target.removeAttribute(name);
      else target.setAttribute(name, safeValue);
    }
  });
  return true;
}

export function wrapSelection(
  doc: Document,
  tagName: string,
  attributes: Record<string, string | null | undefined> = {},
  targetElement?: Element | null,
) {
  const normalizedTag = normalizeWrapperTag(tagName);
  if (!normalizedTag) return false;
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
  const wrapper = wrapRange(doc, selection.getRangeAt(0), normalizedTag);
  Object.entries(attributes).forEach(([name, value]) => {
    if (!isSafeAttributeName(name)) return;
    if (value !== null && value !== undefined && value !== "") {
      const safeValue = sanitizeAttributeValue(name, value);
      if (safeValue !== null) wrapper.setAttribute(name, safeValue);
    }
  });
  selectElement(doc, wrapper);
  normalizeEditableDocument(doc);
  return wrapper;
}

export function duplicateElement(doc: Document, targetElement?: Element | null) {
  const target = elementMutationTarget(doc, targetElement);
  if (!target || !target.parentNode || target === doc.body) return false;
  const clone = target.cloneNode(true) as HTMLElement;
  if (clone.id) clone.id = `${clone.id}_copy_${Date.now()}`;
  target.parentNode.insertBefore(clone, target.nextSibling);
  selectElement(doc, clone);
  return true;
}

export function deleteSelectedElement(doc: Document, targetElement?: Element | null) {
  const target = elementMutationTarget(doc, targetElement);
  if (!target || !target.parentNode || target === doc.body) return false;
  const parent = target.parentNode;
  const next = target.nextSibling || target.previousSibling || parent;
  target.remove();
  if (next) moveSelectionNearNode(doc, next);
  return true;
}

export function canMutateElement(doc: Document, targetElement?: Element | null) {
  return Boolean(elementMutationTarget(doc, targetElement));
}

export function canSetElementAttributes(doc: Document, targetElement?: Element | null) {
  return Boolean(elementAttributeTarget(doc, targetElement));
}

export function canEditElementContent(doc: Document, targetElement?: Element | null) {
  return Boolean(elementContentTarget(doc, targetElement));
}

export function selectElement(doc: Document, element: Element) {
  const selection = doc.getSelection();
  if (!selection) return false;
  const range = doc.createRange();
  range.selectNode(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function selectTableEditingTarget(doc: Document, element: Element) {
  const cell = isTableCellElement(element) ? element : element.querySelector<HTMLTableCellElement>("td, th");
  if (!cell) return selectElement(doc, element);
  const selection = doc.getSelection();
  if (!selection) return false;
  const range = doc.createRange();
  range.selectNodeContents(cell);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function moveCursorToStart(doc: Document, element: Element) {
  const target = elementContentTarget(doc, element);
  if (!target) return false;
  const selection = doc.getSelection();
  if (!selection) return false;
  const range = doc.createRange();
  range.selectNodeContents(target);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function moveCursorToEnd(doc: Document, element: Element) {
  const target = elementContentTarget(doc, element);
  if (!target) return false;
  const selection = doc.getSelection();
  if (!selection) return false;
  const range = doc.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function moveSelectionCursorToStart(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function moveSelectionCursorToEnd(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function getEditorStats(doc: Document) {
  const text = (doc.body?.textContent ?? "").replaceAll(zeroWidthSpace, "");
  return {
    characterCount: text.length,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    paragraphCount: doc.body?.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6").length ?? 0,
    elementCount: doc.body?.querySelectorAll("*").length ?? 0,
  };
}
