import { AdjacentInsertPosition, inlineTags } from './types';
import { selectedTextSegment, textNodesIntersectingRange } from './inlineHelpers';
import { clearElementFormatting, isBlockElement, isVoidElement, nearestElement, rangeIntersectsNode } from './presentationHelpers';
import { isElementNode, isHtmlElement, normalizeEditableDocument, unwrapElement } from './sanitizeHelpers';
export function clearFormatInElement(element: Element): { firstNode: Node | null; lastNode: Node | null } {
  if (isVoidElement(element)) {
    if (isHtmlElement(element)) {
      clearPresentationAttributes(element, ["class", "bgcolor", "color", "face", "size", "align", "valign", "background", "border", "cellpadding", "cellspacing", "width", "height"]);
    }
    return { firstNode: element, lastNode: element };
  }

  const plainText = extractPlainTextForClearFormat(element);
  const insertedNodes: Node[] = [];
  while (element.firstChild) element.removeChild(element.firstChild);

  if (plainText.includes("\n")) {
    const lines = plainText.split("\n").filter((line) => line.trim());
    lines.forEach((line, index) => {
      const textNode = element.ownerDocument.createTextNode(line);
      element.appendChild(textNode);
      insertedNodes.push(textNode);
      if (index < lines.length - 1) {
        const br = element.ownerDocument.createElement("br");
        element.appendChild(br);
        insertedNodes.push(br);
      }
    });
  } else {
    const textNode = element.ownerDocument.createTextNode(plainText);
    element.appendChild(textNode);
    insertedNodes.push(textNode);
  }

  if (isHtmlElement(element)) {
    clearPresentationAttributes(element, ["class", "bgcolor", "color", "face", "size", "align", "valign", "background", "border", "cellpadding", "cellspacing", "width", "height"]);
  }
  if (element.tagName === "A" || inlineTags.includes(element.tagName.toLowerCase())) clearInlineElementNode(element);
  const connectedNodes = insertedNodes.filter((node) => node.isConnected);
  return {
    firstNode: connectedNodes[0] ?? (element.isConnected ? element : null),
    lastNode: connectedNodes[connectedNodes.length - 1] ?? (element.isConnected ? element : null),
  };
}

export function selectClearedFormatResult(doc: Document, result: { firstNode: Node | null; lastNode: Node | null }, fallback: Element) {
  const selection = doc.getSelection();
  if (!selection) return;
  if (result.firstNode?.isConnected && result.lastNode?.isConnected) {
    selectNodeRange(doc, selection, result.firstNode, result.lastNode);
    return;
  }
  if (fallback.isConnected) moveSelectionNearNode(doc, fallback);
}

export function clearFormatInRange(doc: Document, range: Range, selection: Selection) {
  const fragment = range.extractContents();
  clearFragmentFormatting(fragment);
  const insertedNodes = Array.from(fragment.childNodes);
  if (insertedNodes.length === 0) return false;
  range.insertNode(fragment);
  selectNodeRange(doc, selection, insertedNodes[0], insertedNodes[insertedNodes.length - 1]);
  normalizeEditableDocument(doc);
  return true;
}

export function clearFragmentFormatting(fragment: DocumentFragment) {
  Array.from(fragment.children).forEach((child) => clearElementFormatting(child));
}

export function extractPlainTextForClearFormat(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  if (tagName === "br") return "\n";

  const newlineTags = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "li", "br"]);
  const wrapsWithNewline = newlineTags.has(tagName) && tagName !== "li";
  let text = wrapsWithNewline ? "\n" : "";
  element.childNodes.forEach((child) => {
    text += extractPlainTextForClearFormat(child);
  });
  if (wrapsWithNewline) text += "\n";
  return text;
}

export function clearSelectedTextFormatting(doc: Document, range: Range, selection: Selection) {
  const segments = textNodesIntersectingRange(range)
    .map((node) => selectedTextSegment(node, range))
    .filter((segment): segment is { node: Node; start: number; end: number } => Boolean(segment && segment.end > segment.start));
  if (segments.length === 0) return false;

  const clearedNodes: Node[] = [];
  segments
    .slice()
    .reverse()
    .forEach(({ node, start, end }) => {
      const textNode = isolateTextSegment(node, start, end);
      if (!textNode) return;
      const cleared = liftNodeOutOfInlineFormatting(textNode, doc);
      if (cleared.changed) clearedNodes.unshift(cleared.node);
    });

  if (clearedNodes.length === 0) return false;
  selectNodeRange(doc, selection, clearedNodes[0], clearedNodes[clearedNodes.length - 1]);
  normalizeEditableDocument(doc);
  return true;
}

export function isolateTextSegment(node: Node, start: number, end: number) {
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const textNode = node as Text;
  const length = textNode.data.length;
  const safeStart = Math.max(0, Math.min(length, start));
  const safeEnd = Math.max(safeStart, Math.min(length, end));
  if (safeStart === safeEnd) return null;
  if (safeEnd < length) textNode.splitText(safeEnd);
  return safeStart > 0 ? textNode.splitText(safeStart) : textNode;
}

export function liftNodeOutOfInlineFormatting(node: Node, doc: Document) {
  let currentNode = node;
  let parent = currentNode.parentElement;
  let changed = false;
  while (parent && parent !== doc.body && !isBlockElement(parent)) {
    const isLink = parent.tagName === "A";
    if (!isLink && !inlineTags.includes(parent.tagName.toLowerCase())) break;
    const source = parent;
    currentNode = splitInlineParentAroundChild(source, currentNode);
    if (!isLink && hasPreservedAttributes(source)) currentNode = wrapNodeWithPreservedInlineAttributes(doc, currentNode, source);
    changed = true;
    parent = currentNode.parentElement;
  }
  return { node, changed };
}

export function splitInlineParentAroundChild(parent: Element, child: Node) {
  let directChild = child;
  while (directChild.parentNode && directChild.parentNode !== parent) directChild = directChild.parentNode;
  if (directChild.parentNode !== parent || !parent.parentNode) return child;

  const before = parent.cloneNode(false);
  const after = parent.cloneNode(false);
  while (parent.firstChild && parent.firstChild !== directChild) before.appendChild(parent.firstChild);
  parent.removeChild(directChild);
  while (parent.firstChild) after.appendChild(parent.firstChild);

  if (before.childNodes.length > 0) parent.parentNode.insertBefore(before, parent);
  parent.parentNode.insertBefore(directChild, parent);
  if (after.childNodes.length > 0) parent.parentNode.insertBefore(after, parent);
  parent.remove();
  return directChild;
}

export function clearResidualInlineFormattingInSelection(doc: Document, selection: Selection) {
  const inlineElements = new Set<Element>();
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    collectInlineAncestors(range.startContainer, inlineElements, doc);
    collectInlineAncestors(range.endContainer, inlineElements, doc);
    const root = nearestElement(range.commonAncestorContainer) ?? doc.body;
    root.querySelectorAll([...inlineTags, "a"].join(",")).forEach((element) => {
      if (rangeIntersectsNode(range, element)) inlineElements.add(element);
    });
  }

  Array.from(inlineElements)
    .sort((left, right) => descendantDepth(right) - descendantDepth(left))
    .forEach((element) => {
      clearInlineElementNode(element);
    });
}

export function collectInlineAncestors(node: Node, output: Set<Element>, doc: Document) {
  let current = nearestElement(node);
  while (current && current !== doc.body) {
    if (isBlockElement(current)) return;
    if (current.tagName === "A" || inlineTags.includes(current.tagName.toLowerCase())) output.add(current);
    current = current.parentElement;
  }
}

export function clearInlineElementFormatting(element: Element) {
  if (!isHtmlElement(element)) return;
  clearPresentationAttributes(element, ["class", "color", "face", "size", "background"]);
}

export function clearInlineElementNode(element: Element) {
  if (!isHtmlElement(element)) return;
  clearInlineElementFormatting(element);
  if (element.tagName === "A") {
    unwrapElement(element);
    return;
  }
  if (!inlineTags.includes(element.tagName.toLowerCase()) || !element.parentNode) return;
  if (element.tagName === "SPAN" && hasPreservedAttributes(element)) return;
  if (hasPreservedAttributes(element)) {
    replaceInlineFormattingElementWithSpan(element);
    return;
  }
  unwrapElement(element);
}

export function clearPresentationAttributes(element: HTMLElement, attributes: string[]) {
  element.removeAttribute("style");
  attributes.forEach((attribute) => element.removeAttribute(attribute));
}

export function hasPreservedAttributes(element: Element) {
  return Array.from(element.attributes).some((attribute) => !isPresentationAttribute(attribute.name));
}

export function isPresentationAttribute(name: string) {
  return ["style", "class", "bgcolor", "color", "face", "size", "align", "valign", "background", "border", "cellpadding", "cellspacing", "width", "height"].includes(
    name.toLowerCase(),
  );
}

export function replaceInlineFormattingElementWithSpan(element: Element) {
  const doc = element.ownerDocument;
  const span = doc.createElement("span");
  copyPreservedAttributes(element, span);
  while (element.firstChild) span.appendChild(element.firstChild);
  element.parentNode?.replaceChild(span, element);
}

export function wrapNodeWithPreservedInlineAttributes(doc: Document, node: Node, source: Element) {
  if (!node.parentNode) return node;
  const span = doc.createElement("span");
  copyPreservedAttributes(source, span);
  node.parentNode.insertBefore(span, node);
  span.appendChild(node);
  return span;
}

export function copyPreservedAttributes(source: Element, target: Element) {
  Array.from(source.attributes).forEach((attribute) => {
    if (!isPresentationAttribute(attribute.name)) target.setAttribute(attribute.name, attribute.value);
  });
}

export function descendantDepth(element: Element) {
  let depth = 0;
  let current = element.parentElement;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

export function selectNodeRange(doc: Document, selection: Selection, firstNode: Node, lastNode: Node) {
  const range = doc.createRange();
  range.setStartBefore(firstNode);
  range.setEndAfter(lastNode);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function moveSelectionAfterNode(doc: Document, node: Node) {
  const selection = doc.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function insertedContentTarget(doc: Document, node: Node | null) {
  if (!node) return null;
  const element = isElementNode(node) ? node : node.parentElement;
  return element && doc.body.contains(element) && element !== doc.body ? element : null;
}

export function insertAdjacentFragment(target: Element, fragment: DocumentFragment, position: AdjacentInsertPosition) {
  insertAdjacentNode(target, fragment, position);
}

export function insertAdjacentNode(target: Element, node: Node, position: AdjacentInsertPosition) {
  if (position === "beforebegin") {
    target.parentNode?.insertBefore(node, target);
    return;
  }
  if (position === "afterend") {
    target.parentNode?.insertBefore(node, target.nextSibling);
    return;
  }
  if (position === "afterbegin") {
    target.insertBefore(node, target.firstChild);
    return;
  }
  target.append(node);
}

export function ensureInsertionSelection(doc: Document, targetElement?: Element | null) {
  const selection = doc.getSelection();
  if (!selection) return;
  if (selection.rangeCount > 0) return;
  const target = targetElement && doc.body.contains(targetElement) && targetElement !== doc.body ? targetElement : doc.body;
  const range = doc.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function moveSelectionNearNode(doc: Document, node: Node) {
  const selection = doc.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  if (isElementNode(node)) range.selectNodeContents(node);
  else range.selectNode(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
