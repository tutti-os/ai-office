import { operationPanelModes, type AttributeDraft, type OperationPanelMode, type ToolbarState } from "./runtimeWorkbenchTypes";
import {
  canEditElementContent,
  canMutateElement,
  canSetElementAttributes,
  getCurrentImageAttributes,
  getCurrentLinkHref,
  getCurrentLinkText,
  getSelectedTableCells,
  getSelectedTableCellTarget,
  getTableActionAvailability,
  getTableHeaderState,
  selectionContainsLink,
  tableEditActions,
  type Alignment,
  type ElementStyleAttributes,
  type HeadingTag,
  type ImageAttributes,
  type ListKind,
  type TableActionAvailability,
  type TableEditAction,
  type TableHeaderState,
} from "../artifact/runtime/operations";
import type { RuntimeState, SelectionState } from "../artifact/runtime/types";
import { backgroundImageUrl, imageFromNode } from "./htmlImageDom";
export {
  imageAltFromFileName,
  imageFromNode,
  imageResizeHandleStyle,
  positionImageSelectionOverlay,
  readFileAsDataUrl,
  removeImageSelectionOverlay,
  removeSelectedImageObject,
  resizedImageSizeForHandle,
  sanitizeImageSource,
  selectElementInDocument,
  upsertSelectedImageObject,
} from "./htmlImageDom";
export { parseCustomAttributes } from "./htmlAttributeDom";

const minimumHtmlFrameHeight = 860;
const mergeableColorOperationTypes = new Set(["setForeColor", "setBackColor"]);
const colorHistoryMergeWindowMs = 2000;
const mergeableInputOperationTypes = new Set(["input", "setLineHeight", "setLetterSpacing", "setLayout"]);
const inputHistoryMergeWindowMs = 3000;

function defaultTableActions(): TableActionAvailability {
  return Object.fromEntries(tableEditActions.map((action) => [action, false])) as TableActionAvailability;
}

function defaultTableHeaderState(): TableHeaderState {
  return { rowHeader: false, columnHeader: false };
}

export function isOperationPanelMode(action: string): action is Exclude<OperationPanelMode, null> {
  return (operationPanelModes as readonly string[]).includes(action);
}

export function measureBodyContentBottom(doc: Document) {
  const childBottom = Array.from(doc.body.children).reduce((bottom, child) => {
    const rect = child.getBoundingClientRect();
    return Math.max(bottom, rect.bottom);
  }, 0);
  if (childBottom > 0) return childBottom;
  const range = doc.createRange();
  range.selectNodeContents(doc.body);
  const rangeRect = range.getBoundingClientRect();
  range.detach();
  if (rangeRect.width || rangeRect.height) return rangeRect.bottom;
  return doc.body.getBoundingClientRect().bottom;
}

export function isContentBoundOperation(action: string) {
  return action === "appendText" || action === "appendHtml";
}

export function isPositionBoundOperation(action: string) {
  return action === "insertAtPosition";
}

export function isTableEditAction(action: string): action is TableEditAction {
  return (tableEditActions as readonly string[]).includes(action);
}

export function tableActionTitle(action: TableEditAction, headerState: TableHeaderState = defaultTableHeaderState()) {
  const titles: Record<TableEditAction, string> = {
    addRowBefore: "Add row before",
    addRowAfter: "Add row after",
    addColumnBefore: "Add column before",
    addColumnAfter: "Add column after",
    toggleHeaderRow: headerState.rowHeader ? "Remove row header" : "Set row header",
    toggleHeaderColumn: headerState.columnHeader ? "Remove column header" : "Set column header",
    distributeRows: "Distribute rows",
    distributeColumns: "Distribute columns",
    copyRow: "Copy row",
    copyColumn: "Copy column",
    moveRowUp: "Move row up",
    moveRowDown: "Move row down",
    moveColumnLeft: "Move column left",
    moveColumnRight: "Move column right",
    deleteRow: "Delete row",
    deleteColumn: "Delete column",
    deleteTable: "Delete table",
    mergeCellRight: "Merge cell right",
    mergeCellDown: "Merge cell down",
    splitCell: "Split cell",
  };
  return titles[action];
}

export function shouldMergeEditorHistory(runtime: RuntimeState, operationType: string) {
  if (runtime.history.currentIndex !== runtime.history.snapshots.length - 1) return false;
  const currentSnapshot = runtime.history.snapshots[runtime.history.currentIndex];
  if (!currentSnapshot || currentSnapshot.operationType !== operationType) return false;
  if (mergeableColorOperationTypes.has(operationType)) return Date.now() - currentSnapshot.timestamp < colorHistoryMergeWindowMs;
  if (mergeableInputOperationTypes.has(operationType)) return Date.now() - currentSnapshot.timestamp < inputHistoryMergeWindowMs;
  return false;
}

export function operationPanelPlaceholder(mode: OperationPanelMode) {
  if (mode === "replaceSelection") return "Replacement text or HTML...";
  if (mode === "insertHtml" || mode === "appendHtml" || mode === "insertAtPosition") return "<p>Paste HTML or text...</p>";
  if (mode === "appendText") return "Text to append...";
  return "Text to insert...";
}

export function usableSelection(selection: SelectionState | null) {
  return Boolean(selection?.startPath || selection?.commonAncestorPath || selection?.selectedText);
}

export function isFallbackOnlySelection(selection: SelectionState | null) {
  return Boolean(selection?.selectionType === "write" && selection.startPath && !selection.anchorPath && !selection.focusPath);
}

export function ensureEditorSelection(
  doc: Document,
  fallbackNode: Node | null,
  input: { forceFallback?: boolean; fallbackPath?: string } = {},
) {
  const selection = doc.getSelection();
  if (!selection) return;
  if (!input.forceFallback && selection.rangeCount > 0) return;
  let element = isElementNode(fallbackNode) ? fallbackNode : fallbackNode?.parentElement;
  if (element && !doc.body.contains(element)) element = null;
  if (!element && input.fallbackPath) element = resolveRuntimePath(doc, input.fallbackPath);
  if (!element && input.fallbackPath?.startsWith("body:nth-of-type(1) > ")) {
    element = doc.body.querySelector(input.fallbackPath.replace("body:nth-of-type(1) > ", ""));
  }
  if (!element || !doc.body.contains(element)) return;
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function resolveEditorTarget(doc: Document, fallbackNode: Node | null, fallbackPath: string) {
  let element = isElementNode(fallbackNode) ? fallbackNode : fallbackNode?.parentElement ?? null;
  if (element && !doc.body.contains(element)) element = null;
  if (!element && fallbackPath) element = resolveRuntimePath(doc, fallbackPath);
  if (!element && fallbackPath.startsWith("body:nth-of-type(1) > ")) {
    element = doc.body.querySelector(fallbackPath.replace("body:nth-of-type(1) > ", ""));
  }
  if (element === doc.body) element = firstEditableChildForToolbar(doc.body);
  return element && doc.body.contains(element) ? element : null;
}

export function currentSelectionElement(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const element = selectedElementFromSelection(selection, doc) ?? nearestElementInDocument(selection.getRangeAt(0).commonAncestorContainer, doc);
  return element && element !== doc.body ? element : null;
}

export function frameEventTarget(doc: Document, event: Event) {
  const pointer = event as Event & { clientX?: number; clientY?: number };
  if (typeof pointer.clientX === "number" && typeof pointer.clientY === "number") {
    const pointed = doc.elementFromPoint(pointer.clientX, pointer.clientY);
    if (pointed && pointed !== doc.body && doc.body.contains(pointed)) return pointed;
  }
  return event.target instanceof Node ? event.target : null;
}

export function readToolbarState(doc: Document, fallbackNode: Node | null, fallbackPath: string): ToolbarState {
  const selection = doc.getSelection();
  const rangeElement =
    selection && selection.rangeCount > 0
      ? selectedElementFromSelection(selection, doc) ?? nearestElementInDocument(selection.getRangeAt(0).commonAncestorContainer, doc)
      : null;
  const fallbackTarget = resolveEditorTarget(doc, fallbackNode, fallbackPath);
  const selectionTarget = nearestSelectionTarget(doc, selection);
  const target = (rangeElement && rangeElement !== doc.body ? rangeElement : null) ?? selectionTarget ?? fallbackTarget ?? firstEditableChildForToolbar(doc.body) ?? doc.body;
  const block = nearestBlockForToolbar(target, doc);
  const styleTarget = target !== doc.body && !isToolbarBlock(target) ? target : block ?? target;
  const computed = doc.defaultView?.getComputedStyle(styleTarget);
  const inline = inlineStyleOf(styleTarget);
  const backgroundTarget = target.closest("td, th") ?? styleTarget;
  const backgroundComputed = doc.defaultView?.getComputedStyle(backgroundTarget);
  const tableTarget = tableToolbarTarget(doc, target, fallbackTarget);
  const tableActions = tableTarget ? getTableActionAvailability(doc, tableTarget) : defaultTableActions();
  const tableHeaderState = tableTarget ? getTableHeaderState(doc, tableTarget) : defaultTableHeaderState();
  const selectedTableCells = getSelectedTableCells(doc);
  return {
    targetLabel: styleTarget.tagName.toLowerCase(),
    block: blockTagForToolbar(block),
    fontFamily: normalizeToolbarFont(computed?.fontFamily || ""),
    fontSize: normalizeToolbarFontSize(computed?.fontSize || ""),
    foreColor: rgbToHex(computed?.color || "") || "#111111",
    backColor: colorStyleValue(backgroundComputed?.backgroundColor) || "#fff2a8",
    lineHeight: inline?.lineHeight || "",
    letterSpacing: inline?.letterSpacing || "",
    layout: {
      marginTop: inline?.marginTop || "",
      marginRight: inline?.marginRight || "",
      marginBottom: inline?.marginBottom || "",
      marginLeft: inline?.marginLeft || "",
      paddingTop: inline?.paddingTop || "",
      paddingRight: inline?.paddingRight || "",
      paddingBottom: inline?.paddingBottom || "",
      paddingLeft: inline?.paddingLeft || "",
    },
    alignment: normalizeToolbarAlignment(computed?.textAlign || ""),
    bold: toolbarFormatActive(doc, selection, target, selectedTableCells, ["strong", "b"], (style) => Number(style.fontWeight) >= 600),
    italic: toolbarFormatActive(doc, selection, target, selectedTableCells, ["em", "i"], (style) => style.fontStyle === "italic"),
    underline: toolbarFormatActive(doc, selection, target, selectedTableCells, ["u"], (style) => style.textDecorationLine.includes("underline")),
    strikethrough: toolbarFormatActive(doc, selection, target, selectedTableCells, ["s", "strike", "del"], (style) => style.textDecorationLine.includes("line-through")),
    link: selectedTableCells.length > 0 ? selectedTableCells.some((cell) => Boolean(cell.querySelector("a"))) : Boolean(target.closest("a")) || selectionContainsLink(doc),
    list: selectedTableCells.length > 0 ? listKindForToolbarCells(selectedTableCells) : listKindForToolbar(target),
    checklist: selectedTableCells.length > 0 ? selectedTableCells.every((cell) => Boolean(cell.querySelector(':scope > ul[data-ai-checklist="true"]'))) : Boolean(target.closest('ul[data-ai-checklist="true"]')),
    table: Object.values(tableActions).some(Boolean),
    tableActions,
    tableHeaderState,
    image: Boolean(imageFromNode(target, doc)),
    attributeElement: canSetElementAttributes(doc, target),
    mutableElement: canMutateElement(doc, target),
    contentElement: canEditElementContent(doc, target),
    textSelection: Boolean(selection?.toString().trim()),
    rangeSelection: Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed),
  };
}

export function selectedElementFromSelection(selection: Selection, doc: Document) {
  if (selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed || range.startContainer !== range.endContainer || range.endOffset !== range.startOffset + 1) return null;
  const selected = range.startContainer.childNodes[range.startOffset];
  return isElementNode(selected) && doc.body.contains(selected) ? selected : null;
}

export function nearestSelectionTarget(doc: Document, selection: Selection | null) {
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const startElement = nearestElementInDocument(range.startContainer, doc);
  const endElement = nearestElementInDocument(range.endContainer, doc);
  return nearestBlockForToolbar(startElement, doc) ?? nearestBlockForToolbar(endElement, doc) ?? startElement ?? endElement;
}

export function tableToolbarTarget(doc: Document, target: Element, fallbackTarget?: Element | null) {
  const selectedCellTarget = getSelectedTableCellTarget(doc);
  if (selectedCellTarget) return selectedCellTarget;

  const fallbackTableTarget = tableTargetFromElement(fallbackTarget);
  if (fallbackTableTarget) return fallbackTableTarget;

  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return tableTargetFromElement(target);
  }
  if (selection.isCollapsed) {
    const rangeElement = nearestElementInDocument(selection.getRangeAt(0).commonAncestorContainer, doc);
    const rangeTableTarget = rangeElement?.closest("td, th") ?? null;
    return rangeTableTarget;
  }
  const selectedElement = selectedElementFromSelection(selection, doc);
  if (selectedElement?.tagName === "TABLE" || selectedElement?.closest("td, th")) return selectedElement;

  let sharedTable: Element | null = null;
  let firstCell: Element | null = null;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const startCell = nearestElementInDocument(range.startContainer, doc)?.closest("td, th");
    const endCell = nearestElementInDocument(range.endContainer, doc)?.closest("td, th");
    const startTable = startCell?.closest("table") ?? null;
    const endTable = endCell?.closest("table") ?? null;
    if (!startCell || !endCell || !startTable || startTable !== endTable) return null;
    if (sharedTable && sharedTable !== startTable) return null;
    sharedTable = startTable;
    firstCell ??= startCell;
  }
  return firstCell;
}

export function tableTargetFromElement(element: Element | null | undefined) {
  if (!element) return null;
  const targetCell = element.closest("td, th");
  return targetCell ?? (element.tagName === "TABLE" ? element : null);
}

export function nearestElementInDocument(node: Node | null, doc: Document) {
  const element = isElementNode(node) ? node : node?.parentElement ?? null;
  return element && doc.body.contains(element) ? element : null;
}

export function nearestBlockForToolbar(element: Element | null, doc: Document) {
  let current: Element | null = element;
  while (current && current !== doc.body) {
    if (isToolbarBlock(current)) return current;
    current = current.parentElement;
  }
  return null;
}

export function isToolbarBlock(element: Element) {
  return ["P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "LI", "TD", "TH", "DIV"].includes(element.tagName);
}

export function firstEditableChildForToolbar(element: Element) {
  const child = Array.from(element.children).find((item) => item.tagName !== "BR" && !["SCRIPT", "STYLE"].includes(item.tagName));
  return isElementNode(child) ? child : null;
}

export function blockTagForToolbar(element: Element | null): HeadingTag {
  const tag = element?.tagName.toLowerCase();
  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6" || tag === "blockquote") return tag;
  return "p";
}

export function normalizeToolbarFont(fontFamily: string) {
  return fontFamily.trim() || "Arial, sans-serif";
}

export function normalizeToolbarFontSize(fontSize: string) {
  const value = Math.round(Number.parseFloat(fontSize));
  return Number.isFinite(value) && value >= 1 && value <= 400 ? `${value}px` : "";
}

export function normalizeToolbarAlignment(textAlign: string): Alignment {
  if (textAlign === "center" || textAlign === "right" || textAlign === "justify") return textAlign;
  return "left";
}

export function hasAncestorTag(element: Element | null, tags: string[]) {
  let current: Element | null = element;
  while (current) {
    if (tags.includes(current.tagName.toLowerCase())) return true;
    current = current.parentElement;
  }
  return false;
}

export function toolbarFormatActive(
  doc: Document,
  selection: Selection | null,
  target: Element,
  selectedTableCells: HTMLTableCellElement[],
  tags: string[],
  styleCheck: (style: CSSStyleDeclaration) => boolean,
) {
  if (selectedTableCells.length > 0) {
    return selectedTableCells.every((cell) => elementTextFullyHasFormat(doc, cell, tags, styleCheck));
  }
  if (!selection || selection.rangeCount === 0) return elementHasInlineFormat(doc, target, tags, styleCheck);
  if (selection.isCollapsed) {
    const element = nearestElementInDocument(selection.anchorNode, doc) ?? target;
    return elementHasInlineFormat(doc, element, tags, styleCheck);
  }
  return selectionTextFullyHasFormat(doc, selection, tags, styleCheck);
}

export function elementHasInlineFormat(doc: Document, element: Element | null, tags: string[], styleCheck: (style: CSSStyleDeclaration) => boolean) {
  if (!element || !doc.body.contains(element)) return false;
  const style = doc.defaultView?.getComputedStyle(element);
  return hasAncestorTag(element, tags) || Boolean(style && styleCheck(style));
}

export function selectionTextFullyHasFormat(doc: Document, selection: Selection, tags: string[], styleCheck: (style: CSSStyleDeclaration) => boolean) {
  let sawText = false;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (!doc.body.contains(range.commonAncestorContainer)) continue;
    for (const node of selectedTextNodesForRange(doc.body, range)) {
      const selectedText = selectedTextForNode(range, node);
      if (!selectedText.trim()) continue;
      sawText = true;
      if (!elementHasInlineFormat(doc, node.parentElement, tags, styleCheck)) return false;
    }
  }
  return sawText;
}

export function elementTextFullyHasFormat(doc: Document, root: Element, tags: string[], styleCheck: (style: CSSStyleDeclaration) => boolean) {
  let sawText = false;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const text = current.textContent ?? "";
    if (text.trim()) {
      sawText = true;
      if (!elementHasInlineFormat(doc, current.parentElement, tags, styleCheck)) return false;
    }
    current = walker.nextNode();
  }
  return sawText;
}

export function selectedTextNodesForRange(root: Element, range: Range) {
  const doc = root.ownerDocument;
  const nodes: Text[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (range.intersectsNode(current)) nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

export function selectedTextForNode(range: Range, node: Text) {
  const start = node === range.startContainer ? range.startOffset : 0;
  const end = node === range.endContainer ? range.endOffset : node.data.length;
  return node.data.slice(start, end);
}

export function listKindForToolbar(element: Element | null): ListKind | null {
  const list = element?.closest("ol, ul");
  if (!list) return null;
  if (list.getAttribute("data-ai-checklist") === "true") return null;
  return list.tagName.toLowerCase() === "ol" ? "ordered" : "unordered";
}

export function listKindForToolbarCells(cells: HTMLTableCellElement[]): ListKind | null {
  if (cells.length === 0) return null;
  const kinds = cells.map((cell) => {
    const list = cell.querySelector(":scope > ol, :scope > ul");
    if (!list || list.getAttribute("data-ai-checklist") === "true") return null;
    return list.tagName.toLowerCase() === "ol" ? "ordered" : "unordered";
  });
  const first = kinds[0];
  return first && kinds.every((kind) => kind === first) ? first : null;
}

export function readCurrentLinkHref(doc: Document | null, fallbackNode: Node | null) {
  if (!doc) return "";
  const target = currentPanelTarget(doc, fallbackNode);
  return getCurrentLinkHref(doc, target);
}

export function readCurrentLinkText(doc: Document | null, fallbackNode: Node | null) {
  if (!doc) return "";
  const target = currentPanelTarget(doc, fallbackNode);
  return getCurrentLinkText(doc, target);
}

export function readCurrentImageAttributes(doc: Document | null, fallbackNode: Node | null): ImageAttributes {
  if (!doc) return { src: "", alt: "", width: "", height: "" };
  const target = currentPanelTarget(doc, fallbackNode);
  const image = imageFromNode(target ?? fallbackNode, doc);
  if (image && image.tagName !== "IMG") {
    const computed = doc.defaultView?.getComputedStyle(image);
    return {
      src: backgroundImageUrl(computed?.backgroundImage || image.style.backgroundImage || ""),
      alt: image.getAttribute("aria-label") ?? image.getAttribute("title") ?? "",
      width: image.style.width || "",
      height: image.style.height || "",
    };
  }
  return getCurrentImageAttributes(doc, target);
}

export function readCurrentAttributes(doc: Document | null, fallbackNode: Node | null): AttributeDraft {
  if (!doc) return { id: "", className: "", title: "", custom: "" };
  const target = currentPanelTarget(doc, fallbackNode);
  if (!target || target === doc.body || target === doc.documentElement) return { id: "", className: "", title: "", custom: "" };
  const custom = Array.from(target.attributes)
    .filter((attribute) => !["id", "class", "title"].includes(attribute.name))
    .filter((attribute) => isReadableCustomAttribute(attribute.name))
    .map((attribute) => `${attribute.name}=${attribute.value}`)
    .join("\n");
  return {
    id: target.getAttribute("id") ?? "",
    className: target.getAttribute("class") ?? "",
    title: target.getAttribute("title") ?? "",
    custom,
  };
}

export function isReadableCustomAttribute(name: string) {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z_:][a-z0-9_:.-]*$/i.test(normalized)) return false;
  if (normalized.startsWith("on") || normalized === "srcdoc") return false;
  return (
    normalized === "style" ||
    normalized === "role" ||
    normalized.startsWith("data-") ||
    normalized.startsWith("aria-") ||
    ["href", "xlink:href", "src", "poster", "cite", "action", "formaction", "target", "rel", "name", "value", "type"].includes(normalized)
  );
}

export function readCurrentStyles(doc: Document | null, fallbackNode: Node | null): ElementStyleAttributes {
  if (!doc) return {};
  const target = currentPanelTarget(doc, fallbackNode) ?? doc.body;
  const element = styleTargetForToolbar(target, doc);
  const inline = inlineStyleOf(element);
  return {
    width: inline?.width || "",
    height: inline?.height || "",
    lineHeight: inline?.lineHeight || "",
    letterSpacing: inline?.letterSpacing || "",
    verticalAlign: inline?.verticalAlign || "",
    borderWidth: inline?.borderWidth || "",
    borderStyle: inline?.borderStyle || "",
    borderColor: inline?.borderColor || "",
    borderRadius: inline?.borderRadius || "",
    padding: inline?.padding || "",
    paddingTop: inline?.paddingTop || "",
    paddingRight: inline?.paddingRight || "",
    paddingBottom: inline?.paddingBottom || "",
    paddingLeft: inline?.paddingLeft || "",
    marginTop: inline?.marginTop || "",
    marginRight: inline?.marginRight || "",
    marginBottom: inline?.marginBottom || "",
    marginLeft: inline?.marginLeft || "",
  };
}

export function currentPanelTarget(doc: Document, fallbackNode: Node | null) {
  return resolveEditorTarget(doc, fallbackNode, "") ?? currentSelectionElement(doc);
}

export function shouldKeepEditorSelectionOnToolbarCommand(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button")) && !Boolean(target.closest("input, textarea, select"));
}

export function styleTargetForToolbar(target: Element, doc: Document) {
  const cell = target.closest("td, th");
  if (cell && doc.body.contains(cell)) return cell;
  return nearestBlockForToolbar(target, doc) ?? target;
}

export function inlineStyleOf(element: Element | null) {
  return element && "style" in element ? (element as HTMLElement).style : null;
}

export function styleValue(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized === "normal" || normalized === "none" || normalized === "normal normal") return "";
  return normalized;
}

export function colorStyleValue(value: string | undefined) {
  const normalized = styleValue(value);
  if (!normalized || normalized === "transparent" || normalized === "rgba(0, 0, 0, 0)") return "";
  return rgbToHex(normalized) || normalized;
}

export function rgbToHex(color: string) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

export function isElementNode(node: unknown): node is Element {
  return Boolean(node && typeof node === "object" && (node as Node).nodeType === 1 && "tagName" in node);
}

export function resolveRuntimePath(doc: Document, path: string) {
  const parts = path.split(" > ").filter(Boolean);
  let current: Element | null = doc.documentElement;
  for (const part of parts) {
    const match = part.match(/^([a-z0-9-]+)(?::nth-of-type\((\d+)\))?$/i);
    if (!match) return null;
    const tag = match[1].toLowerCase();
    const index = Number(match[2] ?? "1") - 1;
    if (tag === "html") {
      current = doc.documentElement;
      continue;
    }
    if (tag === "body") {
      current = doc.body;
      continue;
    }
    const children: Element[] = Array.from(current.children).filter((child): child is Element => child.tagName.toLowerCase() === tag);
    current = children[index] ?? null;
    if (!current) return null;
  }
  return isElementNode(current) ? current : null;
}
