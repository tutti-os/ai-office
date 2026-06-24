import { HeadingTag, PresentationProperty, PresentationStyle, inlineTags, presentationProperties } from './types';
import { clearInlineElementNode, clearPresentationAttributes } from './clearFormatHelpers';
import { canConvertBlockElement, convertBlockElement } from './inlineHelpers';
import { copyPresentation, isHtmlElement, kebabCase, unwrapElement } from './sanitizeHelpers';
import { findTableCellFromElement, isTableCellElement, selectedTableStyleTargets } from './tableSelection';
export function convertTableCellContentBlock(doc: Document, cell: HTMLTableCellElement, tagName: HeadingTag): HTMLElement | null {
  const childBlock = Array.from(cell.children).find((child) => isHtmlElement(child) && canConvertBlockElement(child));
  if (childBlock && isHtmlElement(childBlock)) return convertBlockElement(doc, childBlock, tagName);

  const wrapper = doc.createElement(tagName) as HTMLElement;
  copyPresentation(cell, wrapper);
  const nodes = Array.from(cell.childNodes).filter((node) => !(node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "BR"));
  if (nodes.length === 0) wrapper.append(doc.createElement("br"));
  nodes.forEach((node) => wrapper.append(node));
  cell.replaceChildren(wrapper);
  return wrapper;
}

export function presentationSourceElement(doc: Document, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) return selectedCells[selectedCells.length - 1];

  const selection = doc.getSelection();
  const rangeElement =
    selection && selection.rangeCount > 0
      ? selectedElement(doc) ?? nearestElement(selection.getRangeAt(0).commonAncestorContainer)
      : null;
  const source = rangeElement && rangeElement !== doc.body ? rangeElement : isHtmlElement(targetElement) ? targetElement : null;
  return source && source !== doc.body && doc.body.contains(source) ? source : null;
}

export function presentationApplicationElement(doc: Document, targetElement?: Element | null) {
  const explicitlySelectedElement = selectedNodeElement(doc);
  if (explicitlySelectedElement && explicitlySelectedElement !== doc.body && explicitlySelectedElement !== doc.documentElement) return explicitlySelectedElement;

  const target = targetElement && doc.body.contains(targetElement) ? targetElement : null;
  const link = target?.closest("a");
  if (isHtmlElement(link)) return link;

  const tableCell = findTableCellFromElement(target);
  if (tableCell) return tableCell;

  if (!isHtmlElement(target) || target === doc.body || target === doc.documentElement) return null;
  return isBlockElement(target) ? null : target;
}

export function readPresentationStyle(source: HTMLElement): PresentationStyle | null {
  const computed = source.ownerDocument.defaultView?.getComputedStyle(source);
  if (!computed) return null;
  const style: PresentationStyle = {};
  presentationProperties.forEach((property) => {
    const value = computed.getPropertyValue(kebabCase(property));
    if (!isSkippablePresentationValue(value)) style[property] = value;
  });
  return Object.keys(style).length > 0 ? style : null;
}

export function normalizePresentationStyle(style: PresentationStyle | null | undefined): PresentationStyle | null {
  if (!style) return null;
  const normalized: PresentationStyle = {};
  presentationProperties.forEach((property) => {
    const value = style[property]?.trim();
    if (!isSkippablePresentationValue(value)) normalized[property] = value;
  });
  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function omitPresentationStyle(style: PresentationStyle, omitted: PresentationProperty[]) {
  const next: PresentationStyle = {};
  presentationProperties.forEach((property) => {
    if (!omitted.includes(property) && style[property]) next[property] = style[property];
  });
  return Object.keys(next).length > 0 ? next : null;
}

export function applyPresentationStyleToElement(element: HTMLElement, style: PresentationStyle) {
  Object.entries(style).forEach(([property, value]) => {
    if (value) element.style.setProperty(kebabCase(property), value);
  });
}

export function isSkippablePresentationValue(value: string | undefined) {
  const normalized = value?.trim();
  return !normalized || normalized === "normal" || normalized === "none" || normalized === "rgba(0, 0, 0, 0)" || normalized === "transparent";
}

export function restoreBlockSelection(doc: Document, selection: Selection, blocks: HTMLElement[]) {
  if (blocks.length === 0) return;
  const range = doc.createRange();
  if (blocks.length === 1) {
    range.selectNodeContents(blocks[0]);
  } else {
    range.setStartBefore(blocks[0]);
    range.setEndAfter(blocks[blocks.length - 1]);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

export function findNearestBlock(node: Node, doc: Document): HTMLElement | null {
  let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (current && current !== doc.body) {
    if (isHtmlElement(current) && isBlockElement(current)) return current;
    current = current.parentElement;
  }
  return null;
}

export function isBlockElement(element: Element) {
  return [
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DD",
    "DETAILS",
    "DIALOG",
    "DIV",
    "DL",
    "DT",
    "FIELDSET",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HGROUP",
    "HR",
    "LI",
    "MAIN",
    "NAV",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "TD",
    "TH",
    "UL",
  ].includes(element.tagName);
}

export function hasBlockDescendantInSet(block: HTMLElement, blocks: Set<HTMLElement>) {
  return Array.from(blocks).some((candidate) => candidate !== block && block.contains(candidate));
}

export function rangeIntersectsNode(range: Range, node: Node) {
  try {
    return range.intersectsNode(node);
  } catch {
    const nodeRange = node.ownerDocument?.createRange();
    if (!nodeRange) return false;
    nodeRange.selectNodeContents(node);
    return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 && range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
  }
}

export function findLinkInSelection(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const node = nearestElement(range.commonAncestorContainer);
    const closestLink = node?.closest("a");
    if (closestLink) return closestLink;
    const linkInRange = node ? Array.from(node.querySelectorAll("a")).find((link) => rangeIntersectsNode(range, link)) : null;
    if (linkInRange) return linkInRange;
  }
  return null;
}

export function linkForCurrentLinkEdit(doc: Document, targetElement?: Element | null) {
  const targetLink = targetElement?.closest("a") ?? null;
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return targetLink;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return targetLink ?? nearestElement(range.startContainer)?.closest("a") ?? null;
  if (targetLink && rangeInsideElement(range, targetLink)) return targetLink;
  const selected = selectedNodeElement(doc);
  if (selected?.tagName === "A") return selected as HTMLAnchorElement;
  return null;
}

export function rangeInsideElement(range: Range, element: Element) {
  return element.contains(range.startContainer) && element.contains(range.endContainer);
}

export function selectedElement(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const nodeElement = selectedNodeElement(doc);
  if (nodeElement) return nodeElement;
  return nearestElement(range.commonAncestorContainer);
}

export function selectedNodeElement(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed || range.startContainer !== range.endContainer || range.endOffset !== range.startOffset + 1) return null;
  const child = range.startContainer.childNodes[range.startOffset];
  return isHtmlElement(child) ? child : null;
}

export function elementMutationTarget(doc: Document, targetElement?: Element | null) {
  const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc);
  if (!isHtmlElement(target) || target === doc.body || target === doc.documentElement) return null;
  if (isTableCellElement(target)) return firstEditableChildElement(target);
  if (isTableStructureElement(target)) return null;
  return target;
}

export function elementAttributeTarget(doc: Document, targetElement?: Element | null) {
  const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc);
  if (!isHtmlElement(target) || target === doc.body || target === doc.documentElement) return null;
  if (isTableStructureElement(target) && !isTableCellElement(target) && target.tagName !== "TABLE") return null;
  return target;
}

export function elementContentTarget(doc: Document, targetElement?: Element | null) {
  const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc);
  if (!isHtmlElement(target) || target === doc.body || target === doc.documentElement) return null;
  if (isTableCellElement(target)) return target;
  if (isTableStructureElement(target) || isVoidElement(target)) return null;
  return target;
}

export function firstEditableChildElement(element: Element) {
  const child = Array.from(element.children).find((item) => item.tagName !== "BR" && !isTableStructureElement(item));
  return isHtmlElement(child) ? child : null;
}

export function isTableStructureElement(element: Element) {
  return ["TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "COLGROUP", "COL"].includes(element.tagName);
}

export function isVoidElement(element: Element) {
  return ["AREA", "BASE", "BR", "COL", "EMBED", "HR", "IMG", "INPUT", "LINK", "META", "PARAM", "SOURCE", "TRACK", "WBR"].includes(element.tagName);
}

export function nearestElement(node: Node | null): HTMLElement | null {
  if (!node) return null;
  if (isHtmlElement(node)) return node;
  return node.parentElement;
}

export function clearElementFormatting(element: Element) {
  if (isHtmlElement(element)) {
    clearPresentationAttributes(element, ["class", "bgcolor", "color", "face", "size", "align", "valign", "background", "border", "cellpadding", "cellspacing", "width", "height"]);
  }
  Array.from(element.children).forEach((child) => clearElementFormatting(child));
  if (element.tagName === "A") {
    unwrapElement(element);
    return;
  }
  if (inlineTags.includes(element.tagName.toLowerCase())) clearInlineElementNode(element);
}
