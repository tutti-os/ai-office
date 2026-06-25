import { ElementStyleAttributes, HeadingTag, InlineFormatTag, blockSelector, inlineFormatSelectorByTag, inlineTags, zeroWidthSpace } from './types';
import { descendantDepth, selectNodeRange } from './clearFormatHelpers';
import { selectElement, selectTableEditingTarget } from './mediaElements';
import { convertTableCellContentBlock, findNearestBlock, hasBlockDescendantInSet, isBlockElement, nearestElement, rangeIntersectsNode, selectedNodeElement } from './presentationHelpers';
import { applyLinkAttributes, copyPresentation, isElementNode, isHtmlElement, kebabCase, normalizeBorderStyle, normalizeBoxSize, normalizeColor, normalizeCssSize, normalizeCssSizeOrNormal, normalizeEditableDocument, normalizeLineHeight, normalizeVerticalAlign, replaceElementWithText, unwrapElement } from './sanitizeHelpers';
import { findTableCellFromElement, isTableCellElement, selectedTableStyleTargets } from './tableSelection';
export function getFormattingContext(doc: Document) {
  const selection = doc.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  return {
    selection,
    range,
    hasTextSelection: Boolean(selection && range && !range.collapsed),
    currentElement: range ? nearestElement(range.commonAncestorContainer) : null,
  };
}

export function hasCollapsedTypingSelection(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  return selection.getRangeAt(0).collapsed && !selectedNodeElement(doc);
}

export function insertTypingStyleMarker(doc: Document, styles: Partial<CSSStyleDeclaration>) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;

  const existingMarker = nearestElement(range.startContainer)?.closest("span[data-ai-typing-style]");
  const marker = isHtmlElement(existingMarker) ? existingMarker : doc.createElement("span");
  Object.assign(marker.style, styles);
  marker.setAttribute("data-ai-typing-style", "true");
  if (!marker.textContent?.includes(zeroWidthSpace)) marker.append(doc.createTextNode(zeroWidthSpace));
  if (!existingMarker) range.insertNode(marker);

  const markerText = Array.from(marker.childNodes).find((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.includes(zeroWidthSpace));
  if (!markerText) return marker;
  const nextRange = doc.createRange();
  const markerOffset = markerText.textContent?.indexOf(zeroWidthSpace) ?? -1;
  nextRange.setStart(markerText, markerOffset >= 0 ? markerOffset + 1 : markerText.textContent?.length ?? 0);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  return marker;
}

export function markerTextWithoutPlaceholders(marker: HTMLElement) {
  return (marker.textContent ?? "").replaceAll(zeroWidthSpace, "").trim();
}

export function wrapSelectionOrBlockWithStyle(doc: Document, styles: Partial<CSSStyleDeclaration>, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) {
    selectedCells.forEach((cell) => Object.assign(cell.style, styles));
    return true;
  }

  const selection = doc.getSelection();
  if ((!selection || selection.rangeCount === 0) && !targetElement) return false;
  if ((!selection || selection.rangeCount === 0) && isHtmlElement(targetElement)) {
    Object.assign(targetElement.style, styles);
    return true;
  }
  if (!selection) return false;
  const range = selection.getRangeAt(0);

  const explicitlySelectedElement = selectedNodeElement(doc);
  if (explicitlySelectedElement && explicitlySelectedElement !== doc.body && explicitlySelectedElement !== doc.documentElement) {
    Object.assign(explicitlySelectedElement.style, styles);
    selectElement(doc, explicitlySelectedElement);
    return true;
  }

  if (!range.collapsed) {
    return styleTextSelection(doc, range, selection, styles);
  }

  const block = targetElement ? findNearestBlock(targetElement, doc) : findNearestBlock(range.startContainer, doc);
  if (!block || block === doc.body) return false;
  Object.assign(block.style, styles);
  return true;
}

export function styleTextSelection(doc: Document, range: Range, selection: Selection, styles: Partial<CSSStyleDeclaration>) {
  const changed = wrapTextSelection(doc, range, selection, "span", (span) => {
    Object.assign(span.style, styles);
  });
  if (changed) {
    normalizeOverriddenInlineStyles(
      doc,
      Object.entries(styles)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([property]) => property),
    );
  }
  return changed;
}

export function wrapTextSelection<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  range: Range,
  selection: Selection,
  tagName: K,
  configure?: (element: HTMLElementTagNameMap[K]) => void,
) {
  const segments = textNodesIntersectingRange(range)
    .map((node) => selectedTextSegment(node, range))
    .filter((segment): segment is { node: Node; start: number; end: number } => Boolean(segment && segment.end > segment.start));
  if (segments.length === 0) return false;

  const wrappers: HTMLElement[] = [];
  segments.forEach(({ node, start, end }) => {
    const segmentRange = doc.createRange();
    segmentRange.setStart(node, start);
    segmentRange.setEnd(node, end);
    const wrapper = doc.createElement(tagName);
    configure?.(wrapper);
    try {
      segmentRange.surroundContents(wrapper);
      wrappers.push(wrapper);
    } catch {
      segmentRange.detach?.();
    }
  });

  if (wrappers.length === 0) return false;
  selectNodeRange(doc, selection, wrappers[0], wrappers[wrappers.length - 1]);
  normalizeEditableDocument(doc);
  return true;
}

export function currentBlockFromSelection(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  return findNearestBlock(selection.getRangeAt(0).commonAncestorContainer, doc);
}

export function styleTargetElement(element: Element, doc: Document) {
  const tableCell = findTableCellFromElement(element);
  if (tableCell) return tableCell;
  return findNearestBlock(element, doc);
}

export function normalizeStyleAttributes(attributes: ElementStyleAttributes): ElementStyleAttributes {
  const normalized: ElementStyleAttributes = {};
  if ("width" in attributes) normalized.width = normalizeCssSize(attributes.width ?? "");
  if ("height" in attributes) normalized.height = normalizeCssSize(attributes.height ?? "");
  if ("lineHeight" in attributes) normalized.lineHeight = normalizeLineHeight(attributes.lineHeight ?? "");
  if ("letterSpacing" in attributes) normalized.letterSpacing = normalizeCssSizeOrNormal(attributes.letterSpacing ?? "");
  if ("verticalAlign" in attributes) normalized.verticalAlign = normalizeVerticalAlign(attributes.verticalAlign ?? "");
  if ("borderWidth" in attributes) normalized.borderWidth = normalizeCssSize(attributes.borderWidth ?? "");
  if ("borderStyle" in attributes) normalized.borderStyle = normalizeBorderStyle(attributes.borderStyle ?? "");
  if ("borderColor" in attributes) normalized.borderColor = normalizeColor(attributes.borderColor ?? "");
  if ("borderRadius" in attributes) normalized.borderRadius = normalizeBoxSize(attributes.borderRadius ?? "");
  if ("padding" in attributes) normalized.padding = normalizeBoxSize(attributes.padding ?? "");
  if ("paddingTop" in attributes) normalized.paddingTop = normalizeBoxSize(attributes.paddingTop ?? "");
  if ("paddingRight" in attributes) normalized.paddingRight = normalizeBoxSize(attributes.paddingRight ?? "");
  if ("paddingBottom" in attributes) normalized.paddingBottom = normalizeBoxSize(attributes.paddingBottom ?? "");
  if ("paddingLeft" in attributes) normalized.paddingLeft = normalizeBoxSize(attributes.paddingLeft ?? "");
  if ("marginTop" in attributes) normalized.marginTop = normalizeBoxSize(attributes.marginTop ?? "");
  if ("marginRight" in attributes) normalized.marginRight = normalizeBoxSize(attributes.marginRight ?? "");
  if ("marginBottom" in attributes) normalized.marginBottom = normalizeBoxSize(attributes.marginBottom ?? "");
  if ("marginLeft" in attributes) normalized.marginLeft = normalizeBoxSize(attributes.marginLeft ?? "");
  return normalized;
}

export function wrapRange<K extends keyof HTMLElementTagNameMap>(doc: Document, range: Range, tagName: K) {
  const wrapper = doc.createElement(tagName);
  try {
    range.surroundContents(wrapper);
  } catch {
    const fragment = range.extractContents();
    wrapper.append(fragment);
    range.insertNode(wrapper);
  }

  const selection = doc.getSelection();
  const nextRange = doc.createRange();
  nextRange.selectNodeContents(wrapper);
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
  return wrapper;
}

function normalizeOverriddenInlineStyles(doc: Document, properties: string[]) {
  const styleProperties = Array.from(new Set(properties.filter((property) => property !== "textAlign")));
  if (styleProperties.length === 0) return;

  Array.from(doc.body.querySelectorAll<HTMLElement>(inlineTags.join(",")))
    .sort((left, right) => descendantDepth(right) - descendantDepth(left))
    .forEach((element) => {
      if (!element.isConnected) return;
      styleProperties.forEach((property) => {
        const cssProperty = kebabCase(property);
        if (hasInlineStyleValue(element, cssProperty) && isInlineStyleCoveredByDescendants(element, cssProperty)) {
          element.style.removeProperty(cssProperty);
        }
      });
      if (element.getAttribute("style") !== null && !element.style.cssText.trim()) element.removeAttribute("style");
      if (element.tagName === "SPAN" && element.attributes.length === 0) unwrapElement(element);
    });
}

function isInlineStyleCoveredByDescendants(element: HTMLElement, cssProperty: string) {
  const textNodes: Text[] = [];
  collectTextNodes(element, textNodes);
  const meaningfulTextNodes = textNodes.filter((node) => Boolean(node.textContent?.trim()));
  return meaningfulTextNodes.length > 0 && meaningfulTextNodes.every((node) => hasStyledDescendantAncestor(node, element, cssProperty));
}

function hasStyledDescendantAncestor(node: Node, boundary: HTMLElement, cssProperty: string) {
  let current = node.parentElement;
  while (current && current !== boundary) {
    if (isHtmlElement(current) && hasCoveringInlineStyleValue(current, cssProperty)) return true;
    current = current.parentElement;
  }
  return false;
}

function hasInlineStyleValue(element: HTMLElement, cssProperty: string) {
  const value = element.style.getPropertyValue(cssProperty).trim();
  return Boolean(value) && value !== "normal" && value !== "none" && value !== "rgba(0, 0, 0, 0)" && value !== "transparent";
}

function hasCoveringInlineStyleValue(element: HTMLElement, cssProperty: string) {
  const value = element.style.getPropertyValue(cssProperty);
  return hasInlineStyleValue(element, cssProperty) && isIndependentStyleValue(cssProperty, value);
}

function isIndependentStyleValue(cssProperty: string, value: string) {
  const normalized = value.trim().toLowerCase();
  if (cssProperty === "font-size") return /^(0|(\d+|\d*\.\d+)px)$/i.test(normalized);
  if (cssProperty === "letter-spacing") return /^(0|[-+]?(\d+|\d*\.\d+)px)$/i.test(normalized);
  if (cssProperty === "line-height") return /^(0|(\d+|\d*\.\d+)px)$/i.test(normalized);
  return !["inherit", "initial", "revert", "revert-layer", "unset", "currentcolor"].includes(normalized);
}

function collectTextNodes(node: Node, output: Text[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    output.push(node as Text);
    return;
  }
  node.childNodes.forEach((child) => collectTextNodes(child, output));
}

export function wrapRangeAsLink(doc: Document, range: Range) {
  const link = doc.createElement("a");
  const fragment = range.extractContents();
  clearLinksInFragment(fragment);
  link.append(fragment);
  range.insertNode(link);

  const selection = doc.getSelection();
  const nextRange = doc.createRange();
  nextRange.selectNodeContents(link);
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
  return link;
}

export function removeLinksInSelectedRange(doc: Document, range: Range, selection: Selection) {
  const preview = range.cloneContents();
  if (linksInFragment(preview).length === 0) return false;

  const fragment = range.extractContents();
  replaceLinksInFragmentWithText(fragment);
  const insertedNodes = Array.from(fragment.childNodes);
  if (insertedNodes.length === 0) return false;
  range.insertNode(fragment);
  selectNodeRange(doc, selection, insertedNodes[0], insertedNodes[insertedNodes.length - 1]);
  normalizeEditableDocument(doc);
  return true;
}

export function createLinksInTableCells(doc: Document, cells: HTMLTableCellElement[], href: string, text?: string) {
  const links = cells.map((cell) => wrapElementContentsAsLink(doc, cell, href, text));
  const first = cells.find((cell) => cell.isConnected);
  if (first) selectTableEditingTarget(doc, first);
  normalizeEditableDocument(doc);
  return links.length > 0;
}

export function wrapElementContentsAsLink(doc: Document, element: HTMLElement, href: string, text?: string) {
  const link = createTextLink(doc, href, text);
  const fragment = doc.createDocumentFragment();
  while (element.firstChild) fragment.appendChild(element.firstChild);
  clearLinksInFragment(fragment);
  if (text !== undefined) {
    link.textContent = text;
  } else if (fragment.childNodes.length > 0) {
    link.replaceChildren(fragment);
  }
  element.append(link);
  return link;
}

export function createTextLink(doc: Document, href: string, text = href) {
  const link = doc.createElement("a");
  applyLinkAttributes(link, href);
  link.textContent = text;
  return link;
}

export function removeLinksInElements(doc: Document, elements: HTMLElement[]) {
  let changed = false;
  elements.forEach((element) => {
    const links = Array.from(element.querySelectorAll("a"));
    links
      .sort((left, right) => descendantDepth(right) - descendantDepth(left))
      .forEach((link) => {
        replaceElementWithText(link);
        changed = true;
      });
  });
  if (!changed) return false;
  const first = elements.find((element) => element.isConnected);
  if (first) selectTableEditingTarget(doc, first);
  normalizeEditableDocument(doc);
  return true;
}

export function clearLinksInFragment(fragment: DocumentFragment) {
  linksInFragment(fragment)
    .sort((left, right) => descendantDepth(right) - descendantDepth(left))
    .forEach((link) => unwrapElement(link));
}

export function replaceLinksInFragmentWithText(fragment: DocumentFragment) {
  linksInFragment(fragment)
    .sort((left, right) => descendantDepth(right) - descendantDepth(left))
    .forEach((link) => replaceElementWithText(link));
}

export function linksInFragment(fragment: DocumentFragment) {
  const links = new Set<HTMLAnchorElement>();
  Array.from(fragment.childNodes).forEach((node) => {
    if (!isElementNode(node)) return;
    if (node.matches("a")) links.add(node as HTMLAnchorElement);
    node.querySelectorAll("a").forEach((link) => links.add(link));
  });
  return Array.from(links);
}

export function toggleFormattingOnElement(doc: Document, element: Element, tagName: InlineFormatTag) {
  if (elementHasFormatting(element, tagName)) {
    removeFormattingFromElement(element, tagName);
    return;
  }
  const wrapper = doc.createElement(tagName);
  while (element.firstChild) wrapper.appendChild(element.firstChild);
  element.appendChild(wrapper);
  selectElement(doc, wrapper);
}

export function applyInlineFormatToElements(doc: Document, elements: HTMLElement[], tagName: InlineFormatTag) {
  const shouldRemove = elements.length > 0 && elements.every((element) => elementHasFormatting(element, tagName));
  elements.forEach((element) => {
    if (shouldRemove) {
      removeFormattingFromElement(element, tagName);
      return;
    }
    if (elementHasFormatting(element, tagName)) return;
    const wrapper = doc.createElement(tagName);
    while (element.firstChild) wrapper.appendChild(element.firstChild);
    element.appendChild(wrapper);
  });
  const first = elements.find((element) => element.isConnected);
  if (first) selectTableEditingTarget(doc, first);
}

export function elementHasFormatting(element: Element, tagName: InlineFormatTag) {
  if (element.tagName.toLowerCase() === tagName) return true;
  const matches = Array.from(element.querySelectorAll(inlineFormatSelectorByTag[tagName]));
  if (matches.length === 0) return false;
  const formattedChars = matches.reduce((total, item) => total + (item.textContent?.length ?? 0), 0);
  const totalChars = element.textContent?.length ?? 0;
  return totalChars > 0 && formattedChars / totalChars > 0.8;
}

export function removeFormattingFromElement(element: Element, tagName: InlineFormatTag) {
  element.querySelectorAll(inlineFormatSelectorByTag[tagName]).forEach((item) => unwrapElement(item));
  if (element.matches(inlineFormatSelectorByTag[tagName])) unwrapElement(element);
}

export function removeInlineFormatFromElements(doc: Document, elements: HTMLElement[], tagName: InlineFormatTag) {
  elements.forEach((element) => removeFormattingFromElement(element, tagName));
  const first = elements.find((element) => element.isConnected);
  if (first) selectTableEditingTarget(doc, first);
  normalizeEditableDocument(doc);
}

export function rangeHasMostlyFormatting(doc: Document, range: Range, tagName: InlineFormatTag) {
  const textNodes = textNodesIntersectingRange(range);
  let totalChars = 0;
  let formattedChars = 0;
  textNodes.forEach((node) => {
    const length = selectedTextLength(node, range);
    if (length <= 0) return;
    totalChars += length;
    if (textNodeHasFormatting(doc, node, tagName)) formattedChars += length;
  });
  return totalChars > 0 && formattedChars / totalChars > 0.8;
}

export function rangeFragmentHasMostlyFormatting(range: Range, tagName: InlineFormatTag) {
  const fragment = range.cloneContents();
  const totalChars = fragment.textContent?.length ?? 0;
  if (totalChars === 0) return false;
  const selector = inlineFormatSelectorByTag[tagName];
  const formattedElements = [
    ...Array.from(fragment.children).filter((child) => child.matches(selector)),
    ...Array.from(fragment.querySelectorAll(selector)),
  ];
  const formattedChars = formattedElements.reduce((total, element) => total + (element.textContent?.length ?? 0), 0);
  return formattedChars / totalChars > 0.8;
}

export function removeInlineFormatInRange(doc: Document, range: Range, selection: Selection, tagName: InlineFormatTag) {
  const fragment = range.extractContents();
  const selector = inlineFormatSelectorByTag[tagName];
  const formattedElements = [
    ...Array.from(fragment.children).filter((child) => child.matches(selector)),
    ...Array.from(fragment.querySelectorAll(selector)),
  ];
  formattedElements
    .sort((left, right) => descendantDepth(right) - descendantDepth(left))
    .forEach((element) => unwrapElement(element));
  const insertedNodes = Array.from(fragment.childNodes);
  if (insertedNodes.length === 0) return false;
  range.insertNode(fragment);
  selectNodeRange(doc, selection, insertedNodes[0], insertedNodes[insertedNodes.length - 1]);
  normalizeEditableDocument(doc);
  return true;
}

export function textNodesIntersectingRange(range: Range) {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return rangeIntersectsNode(range, root) ? [root] : [];
  const nodes: Node[] = [];
  collectTextNodesInRange(root, range, nodes);
  return nodes;
}

export function collectTextNodesInRange(node: Node, range: Range, output: Node[]) {
  if (!rangeIntersectsNode(range, node)) return;
  if (node.nodeType === Node.TEXT_NODE) {
    output.push(node);
    return;
  }
  node.childNodes.forEach((child) => collectTextNodesInRange(child, range, output));
}

export function selectedTextLength(node: Node, range: Range) {
  const segment = selectedTextSegment(node, range);
  return segment ? segment.end - segment.start : 0;
}

export function selectedTextSegment(node: Node, range: Range) {
  const value = node.textContent ?? "";
  let start = 0;
  let end = value.length;
  if (node === range.startContainer) start = range.startOffset;
  if (node === range.endContainer) end = range.endOffset;
  start = Math.max(0, Math.min(value.length, start));
  end = Math.max(start, Math.min(value.length, end));
  return end > start ? { node, start, end } : null;
}

export function textNodeHasFormatting(doc: Document, node: Node, tagName: InlineFormatTag) {
  const element = nearestElement(node);
  if (!element) return false;
  if (element.closest(inlineFormatSelectorByTag[tagName])) return true;
  const computed = doc.defaultView?.getComputedStyle(element);
  if (!computed) return false;
  if (tagName === "strong") return Number(computed.fontWeight) >= 600;
  if (tagName === "em") return computed.fontStyle === "italic";
  if (tagName === "u") return computed.textDecorationLine.includes("underline");
  return computed.textDecorationLine.includes("line-through");
}

export function getSelectedBlockElements(doc: Document, selection: Selection) {
  const blocks = new Set<HTMLElement>();
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (range.collapsed) {
      const block = findNearestBlock(range.startContainer, doc);
      if (block && block !== doc.body) blocks.add(block);
      continue;
    }

    const root = nearestElement(range.commonAncestorContainer) ?? doc.body;
    const candidates = [root, ...Array.from(root.querySelectorAll(blockSelector))];
    candidates.forEach((candidate) => {
      if (!isHtmlElement(candidate)) return;
      if (candidate === doc.body || !rangeIntersectsNode(range, candidate)) return;
      const nearestBlock = isBlockElement(candidate) ? candidate : findNearestBlock(candidate, doc);
      if (nearestBlock && nearestBlock !== doc.body) blocks.add(nearestBlock);
    });
  }
  return Array.from(blocks).filter((block) => !hasBlockDescendantInSet(block, blocks));
}

export function convertBlockElement(doc: Document, block: HTMLElement, tagName: HeadingTag): HTMLElement | null {
  if (isTableCellElement(block)) return convertTableCellContentBlock(doc, block, tagName);
  if (!canConvertBlockElement(block)) return null;
  if (block.tagName.toLowerCase() === tagName) return block;
  const replacement = doc.createElement(tagName) as HTMLElement;
  replacement.innerHTML = block.innerHTML;
  replacement.className = block.className;
  if (block.id) replacement.id = block.id;
  copyPresentation(block, replacement);
  block.parentNode?.replaceChild(replacement, block);
  return replacement;
}

export function canConvertBlockElement(element: HTMLElement) {
  return !["TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH"].includes(element.tagName);
}
