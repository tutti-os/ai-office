export type InlineFormatTag = "strong" | "em" | "u" | "s";

export type RichTextStyle = Partial<
  Record<
    | "color"
    | "backgroundColor"
    | "fontSize"
    | "fontFamily"
    | "fontWeight"
    | "fontStyle"
    | "textDecoration"
    | "letterSpacing"
    | "lineHeight"
    | "textAlign",
    string
  >
>;

export interface RichTextSelectionState {
  selectedText: string;
  selectedHtml: string;
  selectionType: "write" | "text" | "element";
  commonAncestorPath: string;
  startPath: string;
  startOffset: number;
  endPath: string;
  endOffset: number;
}

const inlineCommandByTag: Record<InlineFormatTag, string> = {
  strong: "bold",
  em: "italic",
  u: "underline",
  s: "strikeThrough",
};

const inlineFormatSelectorByTag: Record<InlineFormatTag, string> = {
  strong: "strong,b",
  em: "em,i",
  u: "u,ins",
  s: "s,strike,del",
};

const inlineTags = ["b", "i", "u", "s", "strong", "em", "ins", "del", "mark", "small", "big", "span", "font"];
const blockSelector = [
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "ul",
].join(",");

export function captureRichTextSelection(doc: Document, fallbackNode?: Node | null): RichTextSelectionState | null {
  const selection = doc.getSelection();
  const fallbackDomPath = fallbackNode ? buildDomNodePath(fallbackNode, doc) : "";
  const fallbackOffset = fallbackNode ? nodeOffsetLength(fallbackNode) : 0;
  if (!selection || selection.rangeCount === 0) {
    return {
      selectedText: "",
      selectedHtml: "",
      selectionType: "write",
      commonAncestorPath: fallbackNode ? buildNodePath(fallbackNode, doc) : "",
      startPath: fallbackDomPath,
      startOffset: fallbackOffset,
      endPath: fallbackDomPath,
      endOffset: fallbackOffset,
    };
  }

  const range = selection.getRangeAt(0);
  const holder = doc.createElement("div");
  holder.append(range.cloneContents());
  const commonAncestor = nearestElement(range.commonAncestorContainer);
  return {
    selectedText: selection.toString(),
    selectedHtml: holder.innerHTML,
    selectionType: selection.isCollapsed ? "write" : selectedElementFromRange(range) ? "element" : "text",
    commonAncestorPath: commonAncestor ? buildElementPath(commonAncestor, doc) : "",
    startPath: buildDomNodePath(range.startContainer, doc),
    startOffset: range.startOffset,
    endPath: buildDomNodePath(range.endContainer, doc),
    endOffset: range.endOffset,
  };
}

export function restoreRichTextSelection(doc: Document, selectionState: RichTextSelectionState | null) {
  const selection = doc.getSelection();
  if (!selection || !selectionState?.startPath || !selectionState.endPath) return false;
  const startNode = resolveDomNodePath(selectionState.startPath, doc);
  const endNode = resolveDomNodePath(selectionState.endPath, doc);
  if (!startNode || !endNode) return false;

  const range = doc.createRange();
  try {
    range.setStart(startNode, clampOffset(startNode, selectionState.startOffset));
    range.setEnd(endNode, clampOffset(endNode, selectionState.endOffset));
    if (selectionState.selectionType === "write") range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  } catch {
    range.detach?.();
    return false;
  }
}

export function selectionBelongsToElement(doc: Document, root: Element | null | undefined) {
  if (!root) return false;
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) || root === range.commonAncestorContainer;
}

export function selectedElementFromRange(range: Range) {
  if (range.collapsed || range.startContainer !== range.endContainer || range.endOffset !== range.startOffset + 1) return null;
  const selected = range.startContainer.childNodes[range.startOffset];
  return selected?.nodeType === Node.ELEMENT_NODE ? (selected as Element) : null;
}

export function applyInlineFormat(doc: Document, tagName: InlineFormatTag, targetElement?: Element | null) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) {
    if (targetElement && targetElement !== doc.body) {
      toggleFormattingOnElement(doc, targetElement, tagName);
      return true;
    }
    return execNativeCommand(doc, inlineCommandByTag[tagName]);
  }

  const range = selection.getRangeAt(0);
  const explicitElement = selectedElementFromRange(range);
  if (explicitElement && explicitElement !== doc.body) {
    toggleFormattingOnElement(doc, explicitElement, tagName);
    return true;
  }

  if (!range.collapsed) {
    if (rangeHasMostlyFormatting(doc, range, tagName) || rangeFragmentHasMostlyFormatting(range, tagName)) {
      return removeInlineFormatInRange(doc, range, selection, tagName);
    }
    return wrapTextSelection(doc, range, selection, tagName);
  }

  if (targetElement && targetElement !== doc.body && targetElement.textContent?.trim()) {
    toggleFormattingOnElement(doc, targetElement, tagName);
    return true;
  }
  return execNativeCommand(doc, inlineCommandByTag[tagName]);
}

export function applyPresentationStyle(doc: Document, style: RichTextStyle | null | undefined, targetElement?: Element | null) {
  const normalized = normalizeRichTextStyle(style);
  if (!normalized) return false;

  const selection = doc.getSelection();
  if ((!selection || selection.rangeCount === 0) && isHtmlElement(targetElement) && targetElement !== doc.body) {
    applyStyleToElement(targetElement, normalized);
    return true;
  }
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    const inlineStyle = omitStyle(normalized, ["textAlign"]);
    const textChanged = inlineStyle
      ? wrapTextSelection(doc, range, selection, "span", (span) => applyStyleToElement(span, inlineStyle))
      : false;
    let blockChanged = false;
    if (normalized.textAlign) {
      const blocks = getSelectedBlockElements(doc, selection);
      blocks.forEach((block) => {
        block.style.textAlign = normalized.textAlign ?? "";
        blockChanged = true;
      });
    }
    return textChanged || blockChanged;
  }

  const target = isHtmlElement(targetElement) && targetElement !== doc.body ? targetElement : findNearestBlock(range.startContainer, doc);
  if (!target || target === doc.body) return false;
  applyStyleToElement(target, normalized);
  return true;
}

function wrapTextSelection<K extends keyof HTMLElementTagNameMap>(
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
  normalizeRichTextDocument(doc);
  return true;
}

function toggleFormattingOnElement(doc: Document, element: Element, tagName: InlineFormatTag) {
  if (elementHasFormatting(element, tagName)) {
    removeFormattingFromElement(element, tagName);
    normalizeRichTextDocument(doc);
    return;
  }
  const wrapper = doc.createElement(tagName);
  while (element.firstChild) wrapper.appendChild(element.firstChild);
  element.appendChild(wrapper);
  selectElement(doc, wrapper);
  normalizeRichTextDocument(doc);
}

function elementHasFormatting(element: Element, tagName: InlineFormatTag) {
  if (element.tagName.toLowerCase() === tagName) return true;
  const matches = Array.from(element.querySelectorAll(inlineFormatSelectorByTag[tagName]));
  if (matches.length === 0) return false;
  const formattedChars = matches.reduce((total, item) => total + (item.textContent?.length ?? 0), 0);
  const totalChars = element.textContent?.length ?? 0;
  return totalChars > 0 && formattedChars / totalChars > 0.8;
}

function removeFormattingFromElement(element: Element, tagName: InlineFormatTag) {
  element.querySelectorAll(inlineFormatSelectorByTag[tagName]).forEach((item) => unwrapElement(item));
  if (element.matches(inlineFormatSelectorByTag[tagName])) unwrapElement(element);
}

function rangeHasMostlyFormatting(doc: Document, range: Range, tagName: InlineFormatTag) {
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

function rangeFragmentHasMostlyFormatting(range: Range, tagName: InlineFormatTag) {
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

function removeInlineFormatInRange(doc: Document, range: Range, selection: Selection, tagName: InlineFormatTag) {
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
  normalizeRichTextDocument(doc);
  return true;
}

function textNodesIntersectingRange(range: Range) {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return rangeIntersectsNode(range, root) ? [root] : [];
  const nodes: Node[] = [];
  collectTextNodesInRange(root, range, nodes);
  return nodes;
}

function collectTextNodesInRange(node: Node, range: Range, output: Node[]) {
  if (!rangeIntersectsNode(range, node)) return;
  if (node.nodeType === Node.TEXT_NODE) {
    output.push(node);
    return;
  }
  node.childNodes.forEach((child) => collectTextNodesInRange(child, range, output));
}

function rangeIntersectsNode(range: Range, node: Node) {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function selectedTextLength(node: Node, range: Range) {
  const segment = selectedTextSegment(node, range);
  return segment ? segment.end - segment.start : 0;
}

function selectedTextSegment(node: Node, range: Range) {
  const value = node.textContent ?? "";
  let start = 0;
  let end = value.length;
  if (node === range.startContainer) start = range.startOffset;
  if (node === range.endContainer) end = range.endOffset;
  start = Math.max(0, Math.min(value.length, start));
  end = Math.max(start, Math.min(value.length, end));
  return end > start ? { node, start, end } : null;
}

function textNodeHasFormatting(doc: Document, node: Node, tagName: InlineFormatTag) {
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

function getSelectedBlockElements(doc: Document, selection: Selection) {
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

function findNearestBlock(node: Node, doc: Document): HTMLElement | null {
  let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (current && current !== doc.body) {
    if (isHtmlElement(current) && isBlockElement(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function isBlockElement(element: Element) {
  return docDefaultView(element)?.getComputedStyle(element).display.includes("block") || element.matches(blockSelector);
}

function hasBlockDescendantInSet(block: HTMLElement, blocks: Set<HTMLElement>) {
  return Array.from(blocks).some((candidate) => candidate !== block && block.contains(candidate));
}

function selectElement(doc: Document, element: Element) {
  const selection = doc.getSelection();
  if (!selection) return false;
  const range = doc.createRange();
  range.selectNode(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function selectNodeRange(doc: Document, selection: Selection, first: Node, last: Node) {
  const range = doc.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  selection.removeAllRanges();
  selection.addRange(range);
}

function normalizeRichTextStyle(style: RichTextStyle | null | undefined) {
  if (!style) return null;
  const normalized: RichTextStyle = {};
  Object.entries(style).forEach(([property, value]) => {
    if (typeof value === "string" && !isSkippableStyleValue(value)) normalized[property as keyof RichTextStyle] = value;
  });
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function omitStyle(style: RichTextStyle, omitted: Array<keyof RichTextStyle>) {
  const next: RichTextStyle = {};
  Object.entries(style).forEach(([property, value]) => {
    if (!omitted.includes(property as keyof RichTextStyle) && value) next[property as keyof RichTextStyle] = value;
  });
  return Object.keys(next).length > 0 ? next : null;
}

function applyStyleToElement(element: HTMLElement, style: RichTextStyle) {
  Object.entries(style).forEach(([property, value]) => {
    if (value) element.style.setProperty(kebabCase(property), value);
  });
}

function isSkippableStyleValue(value: string) {
  const normalized = value.trim();
  return !normalized || normalized === "normal" || normalized === "none" || normalized === "rgba(0, 0, 0, 0)" || normalized === "transparent";
}

function normalizeRichTextDocument(doc: Document) {
  Array.from(doc.body.querySelectorAll(inlineTags.join(",")))
    .sort((left, right) => descendantDepth(right) - descendantDepth(left))
    .forEach((element) => {
      if (element.attributes.length > 0) return;
      if (element.textContent?.trim()) return;
      if (element.querySelector("img,svg,video,audio,canvas,input,textarea,select,br")) return;
      element.remove();
    });
  doc.body.normalize();
}

function nearestElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function isHtmlElement(value: unknown): value is HTMLElement {
  return value instanceof Element && value.ownerDocument.defaultView ? value instanceof value.ownerDocument.defaultView.HTMLElement : false;
}

function buildNodePath(node: Node, doc: Document) {
  const element = nearestElement(node);
  return element ? buildElementPath(element, doc) : "";
}

function buildElementPath(element: Element, doc: Document) {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== doc.documentElement) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const currentTag = current.tagName;
    const siblings: Element[] = Array.from(parent.children).filter((child): child is Element => child.tagName === currentTag);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${Math.max(1, index)})`);
    current = parent;
  }
  return parts.join(" > ");
}

function buildDomNodePath(node: Node, doc: Document) {
  if (node === doc.body) return "body";
  const parts: number[] = [];
  let current: Node | null = node;
  while (current && current !== doc.body) {
    const parent: Node | null = current.parentNode;
    if (!parent) break;
    parts.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === doc.body ? `body/${parts.join("/")}` : "";
}

function resolveDomNodePath(path: string, doc: Document) {
  if (!path || !path.startsWith("body")) return null;
  let current: Node | null = doc.body;
  const parts = path.split("/").slice(1);
  for (const part of parts) {
    const index = Number.parseInt(part, 10);
    if (!current || !Number.isFinite(index) || index < 0 || index >= current.childNodes.length) return null;
    current = current.childNodes[index] ?? null;
  }
  return current;
}

function clampOffset(node: Node, offset: number) {
  return Math.max(0, Math.min(nodeOffsetLength(node), offset));
}

function nodeOffsetLength(node: Node) {
  return node.nodeType === Node.TEXT_NODE ? node.textContent?.length ?? 0 : node.childNodes.length;
}

function descendantDepth(element: Element) {
  let depth = 0;
  let cursor = element.parentElement;
  while (cursor) {
    depth += 1;
    cursor = cursor.parentElement;
  }
  return depth;
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function execNativeCommand(doc: Document, command: string, value?: string) {
  doc.defaultView?.focus();
  return doc.execCommand(command, false, value);
}

function kebabCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function docDefaultView(element: Element) {
  return element.ownerDocument.defaultView;
}
