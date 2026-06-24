import { AdjacentInsertPosition } from './types';
import { ensureInsertionSelection, insertAdjacentFragment, insertAdjacentNode, insertedContentTarget, moveSelectionAfterNode } from './clearFormatHelpers';
import { elementContentTarget, elementMutationTarget } from './presentationHelpers';
import { normalizeEditableDocument, sanitizeHtml } from './sanitizeHelpers';
export function insertText(doc: Document, text: string, targetElement?: Element | null) {
  ensureInsertionSelection(doc, targetElement);
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = doc.createTextNode(text);
  range.insertNode(textNode);
  moveSelectionAfterNode(doc, textNode);
  return insertedContentTarget(doc, textNode) ?? true;
}

export function insertHtml(doc: Document, html: string, targetElement?: Element | null) {
  ensureInsertionSelection(doc, targetElement);
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  const fragment = doc.createRange().createContextualFragment(sanitizeHtml(doc, html));
  const lastNode = fragment.lastChild;
  range.deleteContents();
  range.insertNode(fragment);
  if (lastNode) moveSelectionAfterNode(doc, lastNode);
  normalizeEditableDocument(doc);
  return insertedContentTarget(doc, lastNode) ?? true;
}

export function replaceSelection(doc: Document, content: string, isHtml = false, targetElement?: Element | null) {
  if (content.length === 0) {
    ensureInsertionSelection(doc, targetElement);
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    normalizeEditableDocument(doc);
    return insertedContentTarget(doc, range.startContainer) ?? true;
  }
  return isHtml ? insertHtml(doc, content, targetElement) : insertText(doc, content, targetElement);
}

export function insertHorizontalRule(doc: Document, targetElement?: Element | null) {
  ensureInsertionSelection(doc, targetElement);
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const rule = doc.createElement("hr");
  range.insertNode(rule);
  moveSelectionAfterNode(doc, rule);
  return rule;
}

export function insertAtPosition(
  doc: Document,
  target: Element,
  content: string,
  position: AdjacentInsertPosition = "afterend",
  isHtml = false,
) {
  const safeTarget = elementMutationTarget(doc, target);
  if (!safeTarget) return false;
  if (!["beforebegin", "afterbegin", "beforeend", "afterend"].includes(position)) return false;
  let lastNode: Node | null = null;
  if (isHtml) {
    const fragment = doc.createRange().createContextualFragment(sanitizeHtml(doc, content));
    lastNode = fragment.lastChild;
    insertAdjacentFragment(safeTarget, fragment, position);
    normalizeEditableDocument(doc);
  } else {
    const textNode = doc.createTextNode(content);
    lastNode = textNode;
    insertAdjacentNode(safeTarget, textNode, position);
  }
  if (lastNode) moveSelectionAfterNode(doc, lastNode);
  return insertedContentTarget(doc, lastNode) ?? safeTarget;
}

export function appendToElement(doc: Document, target: Element, content: string, isHtml = false) {
  const safeTarget = elementContentTarget(doc, target);
  if (!safeTarget) return false;
  let lastNode: Node | null = null;
  if (isHtml) {
    const fragment = doc.createRange().createContextualFragment(sanitizeHtml(doc, content));
    lastNode = fragment.lastChild;
    safeTarget.append(fragment);
    normalizeEditableDocument(doc);
  } else {
    const textNode = doc.createTextNode(content);
    lastNode = textNode;
    safeTarget.append(textNode);
  }
  if (lastNode) moveSelectionAfterNode(doc, lastNode);
  return insertedContentTarget(doc, lastNode) ?? safeTarget;
}
