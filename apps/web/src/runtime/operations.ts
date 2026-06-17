export type InlineFormatTag = "strong" | "em" | "u" | "s";
export type HeadingTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote";
export type Alignment = "left" | "center" | "right" | "justify";
export type ListKind = "ordered" | "unordered";
export type AdjacentInsertPosition = "beforebegin" | "afterbegin" | "beforeend" | "afterend";
export const tableEditActions = [
  "addRowBefore",
  "addRowAfter",
  "addColumnBefore",
  "addColumnAfter",
  "toggleHeaderRow",
  "toggleHeaderColumn",
  "distributeRows",
  "distributeColumns",
  "copyRow",
  "copyColumn",
  "moveRowUp",
  "moveRowDown",
  "moveColumnLeft",
  "moveColumnRight",
  "deleteRow",
  "deleteColumn",
  "deleteTable",
  "mergeCellRight",
  "mergeCellDown",
  "splitCell",
] as const;
export type TableEditAction = (typeof tableEditActions)[number];
export type TableActionAvailability = Record<TableEditAction, boolean>;
export type TableBorderAction = "all" | "outer" | "inner" | "top" | "right" | "bottom" | "left" | "none";
export type TableHeaderState = {
  rowHeader: boolean;
  columnHeader: boolean;
};
type TableGridSlot = {
  cell: HTMLTableCellElement;
  row: HTMLTableRowElement;
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  colSpan: number;
};
type TableMergeRegion = {
  slots: TableGridSlot[];
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  colSpan: number;
};
type TableCellSelection = {
  table: HTMLTableElement;
  anchor: HTMLTableCellElement;
  focus: HTMLTableCellElement;
};
export type ImageAttributes = {
  src: string;
  alt?: string;
  width?: string;
  height?: string;
};
export type ElementStyleAttributes = {
  width?: string;
  height?: string;
  lineHeight?: string;
  letterSpacing?: string;
  verticalAlign?: string;
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;
  borderRadius?: string;
  padding?: string;
  marginTop?: string;
  marginBottom?: string;
};
const presentationProperties = [
  "color",
  "backgroundColor",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "letterSpacing",
  "lineHeight",
  "textAlign",
] as const;
type PresentationProperty = (typeof presentationProperties)[number];
export type PresentationStyle = Partial<Record<PresentationProperty, string>>;

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
const zeroWidthSpace = "\u200B";
const tableCellSelectionAttribute = "data-ai-table-cell-selected";
const tableCellSelections = new WeakMap<Document, TableCellSelection>();
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
  "hr",
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

export function applyInlineFormat(doc: Document, tagName: InlineFormatTag, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) {
    applyInlineFormatToElements(doc, selectedCells, tagName);
    normalizeEditableDocument(doc);
    return true;
  }

  const context = getFormattingContext(doc);
  if (!context.selection || context.selection.rangeCount === 0) {
    if (targetElement && targetElement !== doc.body) {
      toggleFormattingOnElement(doc, targetElement, tagName);
      return true;
    }
    return execNativeCommand(doc, inlineCommandByTag[tagName]);
  }

  const explicitlySelectedElement = selectedNodeElement(doc);
  if (explicitlySelectedElement && explicitlySelectedElement !== doc.body) {
    toggleFormattingOnElement(doc, explicitlySelectedElement, tagName);
    return true;
  }

  if (context.hasTextSelection) {
    const range = context.selection.getRangeAt(0);
    if (rangeHasMostlyFormatting(doc, range, tagName)) {
      const changed = execNativeCommand(doc, inlineCommandByTag[tagName]);
      normalizeEditableDocument(doc);
      return changed;
    }
    return wrapTextSelection(doc, range, context.selection, tagName);
  }

  if (context.range?.collapsed) return execNativeCommand(doc, inlineCommandByTag[tagName]);

  const element = targetElement ?? context.currentElement;
  if (element && element !== doc.body && element.textContent?.trim()) {
    toggleFormattingOnElement(doc, element, tagName);
    return true;
  }

  return execNativeCommand(doc, inlineCommandByTag[tagName]);
}

export function setHeading(doc: Document, tagName: HeadingTag, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) {
    const converted = selectedCells
      .map((cell) => convertTableCellContentBlock(doc, cell, tagName))
      .filter((item): item is HTMLElement => Boolean(item));
    if (converted.length === 0) return false;
    selectTableEditingTarget(doc, converted[0]);
    normalizeEditableDocument(doc);
    return true;
  }

  const selection = doc.getSelection();
  if ((!selection || selection.rangeCount === 0) && !targetElement) return false;

  const hasTextSelection = Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
  const targetBlock = !hasTextSelection && targetElement ? findNearestBlock(targetElement, doc) : null;
  const affected = targetBlock && targetBlock !== doc.body ? [targetBlock] : selection ? getSelectedBlockElements(doc, selection) : [];
  if (affected.length === 0) return false;

  const converted = affected
    .map((block) => convertBlockElement(doc, block, tagName))
    .filter((item): item is HTMLElement => Boolean(item));
  if (selection) restoreBlockSelection(doc, selection, converted);
  return converted.length > 0;
}

export function setFontFamily(doc: Document, fontFamily: string, targetElement?: Element | null) {
  if (hasCollapsedTypingSelection(doc)) return insertTypingStyleMarker(doc, { fontFamily });
  return wrapSelectionOrBlockWithStyle(doc, { fontFamily }, targetElement);
}

export function setFontSize(doc: Document, fontSize: string, targetElement?: Element | null) {
  if (hasCollapsedTypingSelection(doc)) {
    const normalized = normalizeCssSize(fontSize);
    return normalized ? insertTypingStyleMarker(doc, { fontSize: normalized }) : false;
  }
  return wrapSelectionOrBlockWithStyle(doc, { fontSize }, targetElement);
}

export function cleanupTypingStyleMarkers(doc: Document) {
  let changed = false;
  doc.querySelectorAll<HTMLElement>("span[data-ai-typing-style]").forEach((marker) => {
    marker.childNodes.forEach((child) => {
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.includes(zeroWidthSpace)) return;
      child.textContent = child.textContent.replaceAll(zeroWidthSpace, "");
      changed = true;
    });
    if (!marker.textContent) {
      marker.remove();
      changed = true;
      return;
    }
    marker.removeAttribute("data-ai-typing-style");
    changed = true;
  });
  if (changed) normalizeEditableDocument(doc);
  return changed;
}

export function cleanupAbandonedTypingStyleMarkers(doc: Document) {
  const selection = doc.getSelection();
  const anchor = selection && selection.rangeCount > 0 ? nearestElement(selection.getRangeAt(0).commonAncestorContainer) : null;
  let changed = false;
  doc.querySelectorAll<HTMLElement>("span[data-ai-typing-style]").forEach((marker) => {
    if (anchor && marker.contains(anchor)) return;
    if (markerTextWithoutPlaceholders(marker)) return;
    marker.remove();
    changed = true;
  });
  if (changed) normalizeEditableDocument(doc);
  return changed;
}

export function setElementStyle(doc: Document, targetElement: Element | null | undefined, attributes: ElementStyleAttributes) {
  const normalized = normalizeStyleAttributes(attributes);
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) return applyElementStyles(selectedCells, normalized);

  const rawTarget = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc) ?? currentBlockFromSelection(doc);
  const target = rawTarget ? styleTargetElement(rawTarget, doc) ?? rawTarget : currentBlockFromSelection(doc);
  if (!isHtmlElement(target) || target === doc.body) return false;
  return applyElementStyles([target], normalized);
}

export function beginTableCellSelection(doc: Document, targetNode: Node | null | undefined) {
  const cell = findTableCellFromNode(targetNode);
  const table = cell?.closest("table");
  if (!cell || !table) {
    clearTableCellSelection(doc);
    return null;
  }
  tableCellSelections.set(doc, { table, anchor: cell, focus: cell });
  paintTableCellSelection(doc);
  return cell;
}

export function updateTableCellSelection(doc: Document, targetNode: Node | null | undefined) {
  const current = activeTableCellSelection(doc);
  const cell = findTableCellFromNode(targetNode);
  if (!current || !cell || cell.closest("table") !== current.table) return null;
  if (current.anchor === cell && current.focus === cell) {
    paintTableCellSelection(doc);
    return null;
  }
  tableCellSelections.set(doc, { ...current, focus: cell });
  paintTableCellSelection(doc);
  return cell;
}

export function clearTableCellSelection(doc: Document) {
  tableCellSelections.delete(doc);
  clearTableCellSelectionVisuals(doc);
}

export function getSelectedTableCellTarget(doc: Document) {
  const selection = activeTableCellSelection(doc);
  if (!selection || selection.anchor === selection.focus) return null;
  return selection?.focus ?? selection?.anchor ?? null;
}

export function getSelectedTableCells(doc: Document) {
  return selectedTableStyleTargets(doc);
}

function clearTableCellSelectionVisuals(doc: Document) {
  doc.querySelectorAll(`[${tableCellSelectionAttribute}]`).forEach((cell) => {
    cell.removeAttribute(tableCellSelectionAttribute);
  });
}

function paintTableCellSelection(doc: Document) {
  clearTableCellSelectionVisuals(doc);
  const selection = activeTableCellSelection(doc);
  if (!selection || selection.anchor === selection.focus) return;
  tableCellsForSelection(selection).forEach((cell) => {
    cell.setAttribute(tableCellSelectionAttribute, "true");
  });
}

function applyElementStyles(targets: HTMLElement[], attributes: ElementStyleAttributes) {
  let changed = false;
  targets.forEach((target) => {
    Object.entries(attributes).forEach(([property, value]) => {
      const cssProperty = kebabCase(property);
      if (value) {
        target.style.setProperty(cssProperty, value);
        changed = true;
      } else if (property in target.style) {
        target.style.removeProperty(cssProperty);
        changed = true;
      }
    });
  });
  return changed;
}

export function copyCurrentPresentationStyle(doc: Document, targetElement?: Element | null): PresentationStyle | null {
  const source = presentationSourceElement(doc, targetElement);
  return source ? readPresentationStyle(source) : null;
}

export function applyPresentationStyle(doc: Document, style: PresentationStyle | null | undefined, targetElement?: Element | null) {
  const normalized = normalizePresentationStyle(style);
  if (!normalized) return false;

  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) {
    selectedCells.forEach((cell) => applyPresentationStyleToElement(cell, normalized));
    return true;
  }

  const selection = doc.getSelection();
  if ((!selection || selection.rangeCount === 0) && isHtmlElement(targetElement) && targetElement !== doc.body) {
    applyPresentationStyleToElement(targetElement, normalized);
    return true;
  }
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    const inlineStyle = omitPresentationStyle(normalized, ["textAlign"]);
    const textChanged = inlineStyle ? styleTextSelection(doc, range, selection, inlineStyle) : false;
    const blocks = getSelectedBlockElements(doc, selection);
    let blockChanged = false;
    if (normalized.textAlign && blocks.length > 0) {
      blocks.forEach((block) => {
        block.style.textAlign = normalized.textAlign ?? "";
      });
      blockChanged = true;
    }
    return textChanged || blockChanged;
  }

  const elementTarget = presentationApplicationElement(doc, targetElement);
  if (elementTarget) {
    applyPresentationStyleToElement(elementTarget, normalized);
    return true;
  }

  const block = targetElement ? findNearestBlock(targetElement, doc) : findNearestBlock(range.startContainer, doc);
  if (!block || block === doc.body) return false;
  applyPresentationStyleToElement(block, normalized);
  return true;
}

export function createLink(doc: Document, url: string, targetElement?: Element | null) {
  const href = normalizeLinkUrl(url);
  if (!href) return false;
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) return createLinksInTableCells(doc, selectedCells, href);

  const selection = doc.getSelection();
  const existingLink = linkForCurrentLinkEdit(doc, targetElement);
  if (existingLink) {
    applyLinkAttributes(existingLink, href);
    selectElement(doc, existingLink);
    return existingLink;
  }

  if (!selection || selection.rangeCount === 0) {
    const target = targetElement && doc.body.contains(targetElement) ? targetElement : null;
    if (!isHtmlElement(target) || target === doc.body) return false;
    const link = createTextLink(doc, href);
    target.append(link);
    selectElement(doc, link);
    normalizeEditableDocument(doc);
    return link;
  }

  if (selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const link = createTextLink(doc, href);
    range.insertNode(link);
    selectElement(doc, link);
    normalizeEditableDocument(doc);
    return link;
  }

  const range = selection.getRangeAt(0);
  const link = wrapRangeAsLink(doc, range);
  applyLinkAttributes(link, href);
  selectElement(doc, link);
  normalizeEditableDocument(doc);
  return link;
}

export function removeLink(doc: Document, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) return removeLinksInElements(doc, selectedCells);

  const selection = doc.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const link = targetElement?.closest("a") ?? (range?.collapsed ? nearestElement(range.startContainer)?.closest("a") : null);

  if (link) {
    replaceLinkWithTextAndSelect(doc, link);
    return true;
  }

  if (selection && range && !range.collapsed) return removeLinksInSelectedRange(doc, range, selection);
  const selectedLink = findLinkInSelection(doc);
  if (!selectedLink) return false;
  replaceLinkWithTextAndSelect(doc, selectedLink);
  return true;
}

export function selectionContainsLink(doc: Document) {
  return Boolean(findLinkInSelection(doc));
}

export function getCurrentLinkHref(doc: Document, targetElement?: Element | null) {
  const link = targetElement?.closest("a") ?? findLinkInSelection(doc);
  return link?.getAttribute("href") ?? "";
}

export function setForeColor(doc: Document, color: string, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) {
    const normalized = normalizeColor(color);
    if (!normalized) return false;
    selectedCells.forEach((cell) => {
      cell.style.color = normalized;
    });
    return true;
  }

  if (hasCollapsedTypingSelection(doc)) {
    const normalized = normalizeColor(color);
    return normalized ? insertTypingStyleMarker(doc, { color: normalized }) : false;
  }
  return wrapSelectionOrBlockWithStyle(doc, { color }, targetElement);
}

export function setBackColor(doc: Document, color: string, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) {
    const normalized = normalizeColor(color);
    if (!normalized) return false;
    selectedCells.forEach((cell) => {
      cell.style.backgroundColor = normalized;
    });
    return true;
  }

  const selection = doc.getSelection();
  const hasTextSelection = Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
  if (!hasTextSelection) {
    const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc);
    const cell = findTableCellFromElement(target);
    if (cell) {
      cell.style.backgroundColor = color;
      return true;
    }
    if (hasCollapsedTypingSelection(doc)) {
      const normalized = normalizeColor(color);
      return normalized ? insertTypingStyleMarker(doc, { backgroundColor: normalized }) : false;
    }
  }
  return wrapSelectionOrBlockWithStyle(doc, { backgroundColor: color }, targetElement);
}

export function setAlignment(doc: Document, alignment: Alignment, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) {
    selectedCells.forEach((cell) => {
      cell.style.textAlign = alignment;
    });
    return true;
  }

  const selection = doc.getSelection();
  if ((!selection || selection.rangeCount === 0) && !targetElement) return false;
  const hasTextSelection = Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
  const targetBlock = !hasTextSelection && targetElement ? findNearestBlock(targetElement, doc) : null;
  const blocks = targetBlock && targetBlock !== doc.body ? [targetBlock] : selection ? getSelectedBlockElements(doc, selection) : [];
  if (blocks.length === 0) return false;
  blocks.forEach((block) => {
    block.style.textAlign = alignment;
  });
  if (selection) restoreBlockSelection(doc, selection, blocks);
  return true;
}

export function toggleList(doc: Document, kind: ListKind, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) return toggleListInTableCells(doc, selectedCells, kind);

  ensureSelectionOnTarget(doc, targetElement);
  const customResult = toggleListWithBlockElements(doc, kind);
  if (customResult) return true;
  const command = kind === "ordered" ? "insertOrderedList" : "insertUnorderedList";
  return execNativeCommand(doc, command);
}

export function toggleChecklist(doc: Document, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) return toggleChecklistInTableCells(doc, selectedCells);

  ensureSelectionOnTarget(doc, targetElement);
  const selection = doc.getSelection();
  const blocks = checklistBlocksForOperation(doc, selection, targetElement);
  if (blocks.length === 0) return false;

  const listItems = blocks.filter((block) => block.tagName === "LI");
  if (listItems.length === blocks.length) {
    if (listItems.every((item) => isChecklistItem(item))) {
      const paragraphs = unwrapChecklistItems(doc, listItems);
      if (selection && paragraphs.length > 0) restoreBlockSelection(doc, selection, paragraphs);
      normalizeEditableDocument(doc);
      return paragraphs.length > 0;
    }
    const lists = uniqueListParents(listItems);
    if (lists.length === 0) return false;
    const converted = lists.map((list) => convertListElementToChecklist(doc, list));
    if (selection) restoreBlockSelection(doc, selection, converted);
    normalizeEditableDocument(doc);
    return true;
  }

  const converted = blocks
    .filter((block) => block.tagName !== "LI")
    .map((block) => convertBlockToChecklist(doc, block))
    .filter((item): item is HTMLElement => Boolean(item));
  if (converted.length === 0) return false;
  mergeAdjacentLists(converted);
  if (selection) restoreBlockSelection(doc, selection, converted.filter((item) => item.isConnected));
  normalizeEditableDocument(doc);
  return true;
}

export function indentBlock(doc: Document, targetElement?: Element | null) {
  if (adjustTableCellIndent(doc, 1)) return true;
  ensureSelectionOnTarget(doc, targetElement);
  if (adjustSelectedListItems(doc, 1, targetElement)) return true;
  if (adjustBlockIndent(doc, 1)) return true;
  return execNativeCommand(doc, "indent");
}

export function outdentBlock(doc: Document, targetElement?: Element | null) {
  if (adjustTableCellIndent(doc, -1)) return true;
  ensureSelectionOnTarget(doc, targetElement);
  if (adjustSelectedListItems(doc, -1, targetElement)) return true;
  if (adjustBlockIndent(doc, -1)) return true;
  return execNativeCommand(doc, "outdent");
}

export function clearFormat(doc: Document, targetElement?: Element | null) {
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) {
    selectedCells.forEach((cell) => clearFormatInElement(cell));
    normalizeEditableDocument(doc);
    return true;
  }

  const selection = doc.getSelection();
  if ((!selection || selection.rangeCount === 0) && !targetElement) return false;
  if ((!selection || selection.rangeCount === 0) && targetElement) {
    selectClearedFormatResult(doc, clearFormatInElement(targetElement), targetElement);
    return true;
  }
  if (!selection) return false;
  const range = selection.getRangeAt(0);

  if (range.collapsed) {
    const target = nearestElement(range.startContainer);
    if (!target || target === doc.body || target === doc.documentElement) return false;
    selectClearedFormatResult(doc, clearFormatInElement(target), target);
    return true;
  }

  if (clearSelectedTextFormatting(doc, range, selection)) return true;

  if (execNativeCommand(doc, "removeFormat")) {
    clearResidualInlineFormattingInSelection(doc, selection);
    normalizeEditableDocument(doc);
    return true;
  }
  return clearFormatInRange(doc, range, selection);
}

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

export function insertTable(doc: Document, targetElement?: Element | null, rows = 3, columns = 3) {
  const table = createEditableTable(doc, rows, columns);
  const selection = doc.getSelection();
  const hasRangeSelection = Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);

  if (hasRangeSelection && selection) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(table);
  } else if (targetElement && targetElement !== doc.body && doc.body.contains(targetElement)) {
    const anchor = findNearestBlock(targetElement, doc) ?? targetElement;
    anchor.insertAdjacentElement("afterend", table);
  } else {
    ensureInsertionSelection(doc, targetElement);
    const nextSelection = doc.getSelection();
    if (nextSelection && nextSelection.rangeCount > 0) nextSelection.getRangeAt(0).insertNode(table);
    else doc.body.append(table);
  }

  selectTableEditingTarget(doc, table);
  normalizeEditableDocument(doc);
  return table;
}

export function editTable(doc: Document, action: TableEditAction, targetElement?: Element | null) {
  const context = getTableContext(doc, targetElement);
  if (!context) return false;
  const { cell, row, table } = context;
  const grid = buildTableGrid(table);
  const currentSlot = findTableCellSlot(grid, cell);
  if (!currentSlot && action !== "deleteTable") return false;
  const currentRowIndex = currentSlot?.rowIndex ?? 0;
  const columnIndex = currentSlot?.columnIndex ?? -1;
  const selectedMergeRegion = selectedTableMergeRegion(doc, table, grid);
  const actionRegion = selectedMergeRegion ?? (currentSlot ? singleSlotRegion(currentSlot) : null);
  const selectedRowIndexes = tableActionRowIndexes(doc, table, grid, currentSlot);
  const selectedColumnIndexes = tableActionColumnIndexes(doc, table, grid, currentSlot);

  if (action === "deleteTable") {
    const next = table.nextSibling ?? table.previousSibling ?? table.parentElement;
    table.remove();
    if (next) moveSelectionNearNode(doc, next);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "deleteRow") {
    if (selectedRowIndexes.length === 0 || selectedRowIndexes.length >= table.rows.length) return false;
    const minRow = Math.min(...selectedRowIndexes);
    const hadStructuredSections = tableHasStructuredSections(table);
    [...selectedRowIndexes].sort((left, right) => right - left).forEach((rowIndex) => {
      const targetRow = table.rows[rowIndex];
      if (targetRow) deleteTableRowAtVisualIndex(table, rowIndex, targetRow);
    });
    cleanupEmptyTableSections(table);
    if (hadStructuredSections) flattenTableRowsIntoBody(table);
    selectTableEditingTarget(doc, tableCellAtVisualPosition(table, minRow, columnIndex) ?? table);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "deleteColumn") {
    if (selectedColumnIndexes.length === 0 || grid.columnCount <= 1 || selectedColumnIndexes.length >= grid.columnCount) return false;
    const minColumn = Math.min(...selectedColumnIndexes);
    const hadStructuredSections = tableHasStructuredSections(table);
    [...selectedColumnIndexes].sort((left, right) => right - left).forEach((nextColumnIndex) => {
      deleteTableColumnAtVisualIndex(table, nextColumnIndex, currentRowIndex);
    });
    if (hadStructuredSections) flattenTableRowsIntoBody(table);
    selectTableEditingTarget(doc, tableCellAtVisualPosition(table, currentRowIndex, minColumn) ?? table);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "toggleHeaderRow") {
    const rowIndex = currentSlot?.rowIndex ?? Array.from(table.rows).indexOf(row);
    const targetRowIndexes = selectedRowIndexes.length > 0 ? selectedRowIndexes : [rowIndex];
    const changedRows = toggleTableHeaderRows(doc, table, targetRowIndexes, !tableRowsAreHeader(table, targetRowIndexes));
    if (changedRows.length === 0) return false;
    const nextGrid = buildTableGrid(table);
    const nextRowIndex = Math.max(0, Array.from(table.rows).indexOf(changedRows[0]));
    const nextCell = nextGrid.rows[nextRowIndex]?.[Math.max(0, columnIndex)]?.cell ?? changedRows[0].cells[0] ?? table;
    selectTableEditingTarget(doc, nextCell);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "toggleHeaderColumn") {
    if (columnIndex < 0) return false;
    const targetColumnIndexes = selectedColumnIndexes.length > 0 ? selectedColumnIndexes : [columnIndex];
    const changed = toggleTableHeaderColumns(doc, table, targetColumnIndexes, !tableColumnsAreHeader(table, grid, targetColumnIndexes));
    if (!changed) return false;
    const nextGrid = buildTableGrid(table);
    const nextCell = nextGrid.rows[currentSlot?.rowIndex ?? 0]?.[columnIndex]?.cell ?? table.rows[0]?.cells[0] ?? table;
    selectTableEditingTarget(doc, nextCell);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "distributeColumns") {
    const changed = distributeTableColumns(table);
    if (!changed) return false;
    selectTableEditingTarget(doc, cell);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "distributeRows") {
    const changed = distributeTableRows(table);
    if (!changed) return false;
    selectTableEditingTarget(doc, cell);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "copyRow") {
    if (!canCopyTableRows(table, selectedRowIndexes)) return false;
    const copied = copyTableRows(table, selectedRowIndexes);
    if (!copied) return false;
    const targetRowIndex = Math.min(table.rows.length - 1, Math.max(...selectedRowIndexes) + 1);
    selectTableEditingTarget(doc, tableCellAtVisualPosition(table, targetRowIndex, columnIndex) ?? table);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "copyColumn") {
    if (selectedColumnIndexes.length === 0 || tableHasColSpans(table)) return false;
    const hadStructuredSections = tableHasStructuredSections(table);
    const copied = copyTableColumns(table, selectedColumnIndexes);
    if (!copied) return false;
    if (hadStructuredSections) flattenTableRowsIntoBody(table);
    const targetColumnIndex = Math.min(buildTableGrid(table).columnCount - 1, Math.max(...selectedColumnIndexes) + 1);
    selectTableEditingTarget(doc, tableCellAtVisualPosition(table, currentRowIndex, targetColumnIndex) ?? table);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "moveRowUp" || action === "moveRowDown") {
    if (!actionRegion || tableHasRowSpans(table)) return false;
    const hadStructuredSections = tableHasStructuredSections(table);
    const moved = moveTableRows(table, actionRegion.rowIndex, actionRegion.rowSpan, action === "moveRowUp" ? -1 : 1);
    if (!moved) return false;
    cleanupEmptyTableSections(table);
    if (hadStructuredSections) flattenTableRowsIntoBody(table);
    selectTableEditingTarget(doc, tableCellAtVisualPosition(table, actionRegion.rowIndex + (action === "moveRowUp" ? -1 : 1), actionRegion.columnIndex) ?? table);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "moveColumnLeft" || action === "moveColumnRight") {
    if (!actionRegion || tableHasColSpans(table)) return false;
    const hadStructuredSections = tableHasStructuredSections(table);
    const moved = moveTableColumns(table, actionRegion.columnIndex, actionRegion.colSpan, action === "moveColumnLeft" ? -1 : 1);
    if (!moved) return false;
    if (hadStructuredSections) flattenTableRowsIntoBody(table);
    selectTableEditingTarget(doc, tableCellAtVisualPosition(table, actionRegion.rowIndex, actionRegion.columnIndex + (action === "moveColumnLeft" ? -1 : 1)) ?? table);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "mergeCellRight") {
    if (selectedMergeRegion) return mergeTableRegion(doc, selectedMergeRegion);
    if (!currentSlot) return false;
    const nextSlot = grid.rows[currentSlot.rowIndex]?.[currentSlot.columnIndex + currentSlot.colSpan];
    if (!canMergeCellsHorizontally(currentSlot, nextSlot)) return false;
    mergeTableCellContent(doc, cell, nextSlot.cell);
    setCellColSpan(cell, currentSlot.colSpan + nextSlot.colSpan);
    nextSlot.cell.remove();
    selectTableEditingTarget(doc, cell);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "mergeCellDown") {
    if (selectedMergeRegion) return mergeTableRegion(doc, selectedMergeRegion);
    if (!currentSlot) return false;
    const nextSlot = grid.rows[currentSlot.rowIndex + currentSlot.rowSpan]?.[currentSlot.columnIndex];
    if (!canMergeCellsVertically(currentSlot, nextSlot)) return false;
    mergeTableCellContent(doc, cell, nextSlot.cell);
    setCellRowSpan(cell, currentSlot.rowSpan + nextSlot.rowSpan);
    nextSlot.cell.remove();
    selectTableEditingTarget(doc, cell);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "splitCell") {
    if (!currentSlot) return false;
    const colSpan = Math.max(1, cell.colSpan || 1);
    const rowSpan = Math.max(1, cell.rowSpan || 1);
    if (colSpan <= 1 && rowSpan <= 1) return false;
    setCellColSpan(cell, 1);
    setCellRowSpan(cell, 1);
    for (let index = 1; index < colSpan; index += 1) cell.insertAdjacentElement("afterend", createTableCellLike(doc, cell));
    if (rowSpan > 1) {
      for (let offset = 1; offset < rowSpan; offset += 1) {
        const targetRow = table.rows[currentSlot.rowIndex + offset];
        if (targetRow) insertCellsAtVisualColumn(doc, table, targetRow, columnIndex, colSpan, "next", cell);
      }
    }
    selectTableEditingTarget(doc, cell);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "addRowBefore" || action === "addRowAfter") {
    if (!actionRegion) return false;
    const region = actionRegion;
    const insertIndex = action === "addRowBefore" ? region.rowIndex : region.rowIndex + region.rowSpan;
    const hadStructuredSections = tableHasStructuredSections(table);
    const newRow = insertTableRowAtVisualIndex(doc, table, row, insertIndex, action === "addRowAfter" ? "previous" : "next");
    if (hadStructuredSections) flattenTableRowsIntoBody(table);
    selectTableEditingTarget(doc, newRow.cells[0] ?? newRow);
    normalizeEditableDocument(doc);
    return true;
  }

  if (action === "addColumnBefore" || action === "addColumnAfter") {
    if (!actionRegion) return false;
    const region = actionRegion;
    const insertIndex = action === "addColumnBefore" ? region.columnIndex : region.columnIndex + region.colSpan;
    const hadStructuredSections = tableHasStructuredSections(table);
    insertTableColumnAtVisualIndex(doc, table, insertIndex, action === "addColumnAfter" ? "previous" : "next");
    if (hadStructuredSections) flattenTableRowsIntoBody(table);
    selectTableEditingTarget(doc, tableCellAtVisualPosition(table, region.rowIndex, insertIndex) ?? table);
    normalizeEditableDocument(doc);
    return true;
  }

  return false;
}

export function getTableActionAvailability(doc: Document, targetElement?: Element | null): TableActionAvailability {
  const unavailable = createTableActionAvailability(false);
  const context = getTableContext(doc, targetElement);
  if (!context) return unavailable;

  const { cell, table } = context;
  const grid = buildTableGrid(table);
  const currentSlot = findTableCellSlot(grid, cell);
  const columnIndex = currentSlot?.columnIndex ?? -1;
  const nextRightSlot = currentSlot ? grid.rows[currentSlot.rowIndex]?.[currentSlot.columnIndex + currentSlot.colSpan] : undefined;
  const nextDownSlot = currentSlot ? grid.rows[currentSlot.rowIndex + currentSlot.rowSpan]?.[currentSlot.columnIndex] : undefined;
  const selectedMergeRegion = selectedTableMergeRegion(doc, table, grid);
  const actionRegion = selectedMergeRegion ?? (currentSlot ? singleSlotRegion(currentSlot) : null);
  const hasSpans = tableHasSpans(table);
  const hasColSpans = tableHasColSpans(table);
  const hasRowSpans = tableHasRowSpans(table);
  const selectedRowIndexes = tableActionRowIndexes(doc, table, grid, currentSlot);
  const selectedColumnIndexes = tableActionColumnIndexes(doc, table, grid, currentSlot);
  const canReorderRows = selectedRowIndexes.length > 0 && !hasRowSpans;
  const canCopyRows = canCopyTableRows(table, selectedRowIndexes);

  return {
    addRowBefore: true,
    addRowAfter: true,
    addColumnBefore: columnIndex >= 0,
    addColumnAfter: columnIndex >= 0,
    toggleHeaderRow: true,
    toggleHeaderColumn: columnIndex >= 0,
    distributeRows: table.rows.length > 1,
    distributeColumns: grid.columnCount > 1,
    copyRow: canCopyRows,
    copyColumn: selectedColumnIndexes.length > 0 && !hasColSpans,
    moveRowUp: Boolean(canReorderRows && actionRegion && actionRegion.rowIndex > 0),
    moveRowDown: Boolean(canReorderRows && actionRegion && actionRegion.rowIndex + actionRegion.rowSpan < table.rows.length),
    moveColumnLeft: Boolean(actionRegion && !hasColSpans && actionRegion.columnIndex > 0),
    moveColumnRight: Boolean(actionRegion && !hasColSpans && actionRegion.columnIndex + actionRegion.colSpan < grid.columnCount),
    deleteRow: selectedRowIndexes.length > 0 && selectedRowIndexes.length < table.rows.length,
    deleteColumn: selectedColumnIndexes.length > 0 && grid.columnCount > 1 && selectedColumnIndexes.length < grid.columnCount,
    deleteTable: true,
    mergeCellRight: Boolean(selectedMergeRegion) || canMergeCellsHorizontally(currentSlot, nextRightSlot),
    mergeCellDown: Boolean(selectedMergeRegion) || canMergeCellsVertically(currentSlot, nextDownSlot),
    splitCell: Math.max(1, cell.colSpan || 1) > 1 || Math.max(1, cell.rowSpan || 1) > 1,
  };
}

export function getTableHeaderState(doc: Document, targetElement?: Element | null): TableHeaderState {
  const context = getTableContext(doc, targetElement);
  if (!context) return { rowHeader: false, columnHeader: false };
  const grid = buildTableGrid(context.table);
  const currentSlot = findTableCellSlot(grid, context.cell);
  const selectedRowIndexes = tableActionRowIndexes(doc, context.table, grid, currentSlot);
  const selectedColumnIndexes = tableActionColumnIndexes(doc, context.table, grid, currentSlot);
  return {
    rowHeader: tableRowsAreHeader(context.table, selectedRowIndexes.length > 0 ? selectedRowIndexes : currentSlot ? [currentSlot.rowIndex] : []),
    columnHeader: tableColumnsAreHeader(context.table, grid, selectedColumnIndexes.length > 0 ? selectedColumnIndexes : currentSlot ? [currentSlot.columnIndex] : []),
  };
}

export function setTableCellBorders(
  doc: Document,
  action: TableBorderAction,
  targetElement?: Element | null,
  input: { width?: string; style?: string; color?: string } = {},
) {
  const borderRegion = tableBorderRegion(doc, targetElement);
  if (!borderRegion) return false;

  const value = `${normalizeCssSize(input.width ?? "1px") || "1px"} ${normalizeBorderStyle(input.style ?? "solid") || "solid"} ${
    normalizeColor(input.color ?? "#d0d5dd") || "#d0d5dd"
  }`;
  let changed = false;
  borderRegion.slots.forEach((slot) => {
    const sides = tableBorderSidesForSlot(action, slot, borderRegion);
    sides.forEach((side) => {
      slot.cell.style.setProperty(`border-${side}`, action === "none" ? "none" : value);
      changed = true;
    });
  });
  return changed;
}

export function setTableColumnWidth(doc: Document, targetElement: Element | null | undefined, width: string) {
  return applyTableColumnWidth(doc, targetElement, normalizeCssSize(width ?? ""));
}

export function clearTableColumnWidth(doc: Document, targetElement?: Element | null) {
  return applyTableColumnWidth(doc, targetElement, "");
}

export function setTableRowHeight(doc: Document, targetElement: Element | null | undefined, height: string) {
  return applyTableRowHeight(doc, targetElement, normalizeCssSize(height ?? ""));
}

export function clearTableRowHeight(doc: Document, targetElement?: Element | null) {
  return applyTableRowHeight(doc, targetElement, "");
}

function createTableActionAvailability(available: boolean): TableActionAvailability {
  return tableEditActions.reduce((actions, action) => {
    actions[action] = available;
    return actions;
  }, {} as TableActionAvailability);
}

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

function selectTableEditingTarget(doc: Document, element: Element) {
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

export function getEditorStats(doc: Document) {
  const text = (doc.body?.textContent ?? "").replaceAll(zeroWidthSpace, "");
  return {
    characterCount: text.length,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    paragraphCount: doc.body?.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6").length ?? 0,
    elementCount: doc.body?.querySelectorAll("*").length ?? 0,
  };
}

function getFormattingContext(doc: Document) {
  const selection = doc.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  return {
    selection,
    range,
    hasTextSelection: Boolean(selection && range && !range.collapsed),
    currentElement: range ? nearestElement(range.commonAncestorContainer) : null,
  };
}

function hasCollapsedTypingSelection(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  return selection.getRangeAt(0).collapsed && !selectedNodeElement(doc);
}

function insertTypingStyleMarker(doc: Document, styles: Partial<CSSStyleDeclaration>) {
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

function markerTextWithoutPlaceholders(marker: HTMLElement) {
  return (marker.textContent ?? "").replaceAll(zeroWidthSpace, "").trim();
}

function wrapSelectionOrBlockWithStyle(doc: Document, styles: Partial<CSSStyleDeclaration>, targetElement?: Element | null) {
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

function styleTextSelection(doc: Document, range: Range, selection: Selection, styles: Partial<CSSStyleDeclaration>) {
  return wrapTextSelection(doc, range, selection, "span", (span) => {
    Object.assign(span.style, styles);
  });
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
  normalizeEditableDocument(doc);
  return true;
}

function currentBlockFromSelection(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  return findNearestBlock(selection.getRangeAt(0).commonAncestorContainer, doc);
}

function styleTargetElement(element: Element, doc: Document) {
  const tableCell = findTableCellFromElement(element);
  if (tableCell) return tableCell;
  return findNearestBlock(element, doc);
}

function normalizeStyleAttributes(attributes: ElementStyleAttributes): ElementStyleAttributes {
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
  if ("marginTop" in attributes) normalized.marginTop = normalizeBoxSize(attributes.marginTop ?? "");
  if ("marginBottom" in attributes) normalized.marginBottom = normalizeBoxSize(attributes.marginBottom ?? "");
  return normalized;
}

function wrapRange<K extends keyof HTMLElementTagNameMap>(doc: Document, range: Range, tagName: K) {
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

function wrapRangeAsLink(doc: Document, range: Range) {
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

function removeLinksInSelectedRange(doc: Document, range: Range, selection: Selection) {
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

function createLinksInTableCells(doc: Document, cells: HTMLTableCellElement[], href: string) {
  const links = cells.map((cell) => wrapElementContentsAsLink(doc, cell, href));
  const first = cells.find((cell) => cell.isConnected);
  if (first) selectTableEditingTarget(doc, first);
  normalizeEditableDocument(doc);
  return links.length > 0;
}

function wrapElementContentsAsLink(doc: Document, element: HTMLElement, href: string) {
  const link = createTextLink(doc, href);
  const fragment = doc.createDocumentFragment();
  while (element.firstChild) fragment.appendChild(element.firstChild);
  clearLinksInFragment(fragment);
  if (fragment.childNodes.length > 0) {
    link.replaceChildren(fragment);
  }
  element.append(link);
  return link;
}

function createTextLink(doc: Document, href: string) {
  const link = doc.createElement("a");
  applyLinkAttributes(link, href);
  link.textContent = href;
  return link;
}

function removeLinksInElements(doc: Document, elements: HTMLElement[]) {
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

function clearLinksInFragment(fragment: DocumentFragment) {
  linksInFragment(fragment)
    .sort((left, right) => descendantDepth(right) - descendantDepth(left))
    .forEach((link) => unwrapElement(link));
}

function replaceLinksInFragmentWithText(fragment: DocumentFragment) {
  linksInFragment(fragment)
    .sort((left, right) => descendantDepth(right) - descendantDepth(left))
    .forEach((link) => replaceElementWithText(link));
}

function linksInFragment(fragment: DocumentFragment) {
  const links = new Set<HTMLAnchorElement>();
  Array.from(fragment.childNodes).forEach((node) => {
    if (!isElementNode(node)) return;
    if (node.matches("a")) links.add(node as HTMLAnchorElement);
    node.querySelectorAll("a").forEach((link) => links.add(link));
  });
  return Array.from(links);
}

function toggleFormattingOnElement(doc: Document, element: Element, tagName: InlineFormatTag) {
  if (elementHasFormatting(element, tagName)) {
    removeFormattingFromElement(element, tagName);
    return;
  }
  const wrapper = doc.createElement(tagName);
  while (element.firstChild) wrapper.appendChild(element.firstChild);
  element.appendChild(wrapper);
  selectElement(doc, wrapper);
}

function applyInlineFormatToElements(doc: Document, elements: HTMLElement[], tagName: InlineFormatTag) {
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

function convertBlockElement(doc: Document, block: HTMLElement, tagName: HeadingTag): HTMLElement | null {
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

function canConvertBlockElement(element: HTMLElement) {
  return !["TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH"].includes(element.tagName);
}

function toggleListWithBlockElements(doc: Document, kind: ListKind) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const blocks = getSelectedBlockElements(doc, selection).filter((block) => isListConvertibleBlock(block));
  if (blocks.length === 0) return false;

  const listItems = blocks.filter((block) => block.tagName === "LI");
  if (listItems.length === blocks.length) {
    const lists = uniqueListParents(listItems);
    if (lists.length === 0) return false;
    if (lists.every((list) => listKindFromElement(list) === kind)) {
      const paragraphs = unwrapListItems(doc, listItems);
      if (paragraphs.length > 0) restoreBlockSelection(doc, selection, paragraphs);
      normalizeEditableDocument(doc);
      return paragraphs.length > 0;
    }
    if (lists.every((list) => areAllListItemsSelected(list, listItems))) {
      const converted = lists.map((list) => convertListElementKind(doc, list, kind));
      restoreBlockSelection(doc, selection, converted);
      normalizeEditableDocument(doc);
      return true;
    }
    return false;
  }

  const converted = blocks
    .filter((block) => block.tagName !== "LI")
    .map((block) => convertBlockToList(doc, block, kind))
    .filter((item): item is HTMLElement => Boolean(item));
  if (converted.length === 0) return false;
  mergeAdjacentLists(converted);
  restoreBlockSelection(doc, selection, converted.filter((item) => item.isConnected));
  normalizeEditableDocument(doc);
  return true;
}

function isListConvertibleBlock(block: HTMLElement) {
  return block.tagName === "LI" || isTableCellElement(block) || canConvertBlockElement(block);
}

function checklistBlocksForOperation(doc: Document, selection: Selection | null, targetElement?: Element | null) {
  const selectedBlocks = selection && selection.rangeCount > 0
    ? getSelectedBlockElements(doc, selection)
    : [];
  const fallbackBlock = targetElement && doc.body.contains(targetElement)
    ? findNearestBlock(targetElement, doc)
    : null;
  const hasTextSelection = Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed && selection.toString().trim());

  if (fallbackBlock && fallbackBlock !== doc.body) {
    const selectionCoversFallback = selectedBlocks.some((block) => block === fallbackBlock || block.contains(fallbackBlock) || fallbackBlock.contains(block));
    if (!hasTextSelection || selectedBlocks.length === 0 || !selectionCoversFallback) {
      return [fallbackBlock].filter((block) => isListConvertibleBlock(block));
    }
  }

  return selectedBlocks.filter((block) => isListConvertibleBlock(block));
}

function listTagName(kind: ListKind) {
  return kind === "ordered" ? "ol" : "ul";
}

function listKindFromElement(list: Element): ListKind | null {
  if (isChecklistList(list)) return null;
  if (list.tagName === "OL") return "ordered";
  if (list.tagName === "UL") return "unordered";
  return null;
}

function uniqueListParents(items: HTMLElement[]) {
  const lists = new Set<HTMLElement>();
  items.forEach((item) => {
    const list = item.closest("ol, ul");
    if (isHtmlElement(list)) lists.add(list);
  });
  return Array.from(lists);
}

function areAllListItemsSelected(list: HTMLElement, selectedItems: HTMLElement[]) {
  const selected = new Set(selectedItems);
  return Array.from(list.children).filter((child) => child.tagName === "LI").every((item) => selected.has(item as HTMLElement));
}

function unwrapListItems(doc: Document, items: HTMLElement[]) {
  const selected = new Set(items);
  const created: HTMLElement[] = [];
  uniqueListParents(items).forEach((list) => {
    const parent = list.parentNode;
    if (!parent) return;
    const fragment = doc.createDocumentFragment();
    let currentListClone: HTMLElement | null = null;
    Array.from(list.children).forEach((child) => {
      if (child.tagName !== "LI") return;
      if (selected.has(child as HTMLElement)) {
        currentListClone = null;
        const paragraph = doc.createElement("p");
        paragraph.innerHTML = child.innerHTML;
        copyPresentation(child as HTMLElement, paragraph);
        fragment.append(paragraph);
        created.push(paragraph);
      } else {
        if (!currentListClone) {
          currentListClone = list.cloneNode(false) as HTMLElement;
          fragment.append(currentListClone);
        }
        currentListClone.append(child);
      }
    });
    parent.insertBefore(fragment, list);
    list.remove();
  });
  return created;
}

function convertListElementKind(doc: Document, list: HTMLElement, kind: ListKind) {
  if (listKindFromElement(list) === kind) return list;
  const replacement = doc.createElement(listTagName(kind));
  Array.from(list.attributes).forEach((attribute) => replacement.setAttribute(attribute.name, attribute.value));
  replacement.removeAttribute("data-ai-checklist");
  replacement.style.removeProperty("list-style-type");
  replacement.style.removeProperty("padding-left");
  while (list.firstChild) replacement.append(list.firstChild);
  Array.from(replacement.children).forEach((child) => {
    if (child.tagName === "LI") unwrapChecklistItemContent(doc, child as HTMLElement);
  });
  list.parentNode?.replaceChild(replacement, list);
  return replacement;
}

function convertBlockToList(doc: Document, block: HTMLElement, kind: ListKind): HTMLElement | null {
  if (isTableCellElement(block)) return convertTableCellContentToList(doc, block, kind);
  if (!canConvertBlockElement(block)) return null;
  const list = doc.createElement(listTagName(kind));
  const item = doc.createElement("li");
  item.innerHTML = block.innerHTML;
  copyPresentation(block, item);
  list.append(item);
  block.parentNode?.replaceChild(list, block);
  return list;
}

function convertTableCellContentToList(doc: Document, cell: HTMLTableCellElement, kind: ListKind) {
  const existingList = Array.from(cell.children).find((child) => child.tagName === "OL" || child.tagName === "UL");
  if (isHtmlElement(existingList)) return convertListElementKind(doc, existingList, kind);
  const list = doc.createElement(listTagName(kind));
  const item = doc.createElement("li");
  const nodes = Array.from(cell.childNodes).filter((node) => !(node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "BR"));
  if (nodes.length === 0) item.append(doc.createElement("br"));
  nodes.forEach((node) => item.append(node));
  list.append(item);
  cell.replaceChildren(list);
  return list;
}

function toggleListInTableCells(doc: Document, cells: HTMLTableCellElement[], kind: ListKind) {
  const lists = cells
    .map((cell) => directListElementInCell(cell))
    .filter((list): list is HTMLElement => Boolean(list));
  if (lists.length === cells.length && lists.every((list) => listKindFromElement(list) === kind)) {
    const items = lists.flatMap((list) => Array.from(list.children).filter((child): child is HTMLElement => isHtmlElement(child) && child.tagName === "LI"));
    const paragraphs = unwrapListItems(doc, items);
    selectTableEditingTarget(doc, paragraphs[0] ?? cells.find((cell) => cell.isConnected) ?? cells[0]);
    normalizeEditableDocument(doc);
    return paragraphs.length > 0;
  }

  const converted = cells
    .map((cell) => convertTableCellContentToList(doc, cell, kind))
    .filter((list): list is HTMLElement => Boolean(list));
  selectTableEditingTarget(doc, converted[0] ?? cells.find((cell) => cell.isConnected) ?? cells[0]);
  normalizeEditableDocument(doc);
  return converted.length > 0;
}

function directListElementInCell(cell: HTMLTableCellElement) {
  return Array.from(cell.children).find((child) => child.tagName === "OL" || child.tagName === "UL");
}

function mergeAdjacentLists(lists: HTMLElement[]) {
  lists.forEach((list) => {
    mergeWithPreviousList(list);
    mergeWithNextList(list);
  });
}

function mergeWithPreviousList(list: HTMLElement) {
  const previous = list.previousElementSibling;
  if (!previous || !isMergeableList(previous, list)) return;
  while (list.firstChild) previous.append(list.firstChild);
  list.remove();
}

function mergeWithNextList(list: HTMLElement) {
  if (!list.parentNode) return;
  const next = list.nextElementSibling;
  if (!next || !isMergeableList(next, list)) return;
  while (next.firstChild) list.append(next.firstChild);
  next.remove();
}

function isMergeableList(candidate: Element | null, list: HTMLElement) {
  return Boolean(candidate && candidate.tagName === list.tagName && isChecklistList(candidate) === isChecklistList(list));
}

function isChecklistList(element: Element | null | undefined) {
  return element?.tagName === "UL" && element.getAttribute("data-ai-checklist") === "true";
}

function isChecklistItem(item: HTMLElement) {
  return Boolean(item.closest('ul[data-ai-checklist="true"]'));
}

function convertBlockToChecklist(doc: Document, block: HTMLElement): HTMLElement | null {
  if (isTableCellElement(block)) return convertTableCellContentToChecklist(doc, block);
  if (!canConvertBlockElement(block)) return null;
  const list = createChecklist(doc);
  const item = createChecklistItem(doc);
  moveNodesIntoChecklistItem(doc, item, Array.from(block.childNodes));
  copyPresentation(block, item);
  list.append(item);
  block.parentNode?.replaceChild(list, block);
  return list;
}

function convertTableCellContentToChecklist(doc: Document, cell: HTMLTableCellElement) {
  const existingList = Array.from(cell.children).find((child) => child.tagName === "OL" || child.tagName === "UL");
  if (isHtmlElement(existingList)) return convertListElementToChecklist(doc, existingList);
  const list = createChecklist(doc);
  const item = createChecklistItem(doc);
  const nodes = Array.from(cell.childNodes).filter((node) => !(node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "BR"));
  moveNodesIntoChecklistItem(doc, item, nodes);
  list.append(item);
  cell.replaceChildren(list);
  return list;
}

function toggleChecklistInTableCells(doc: Document, cells: HTMLTableCellElement[]) {
  const lists = cells
    .map((cell) => directListElementInCell(cell))
    .filter((list): list is HTMLElement => Boolean(list));
  if (lists.length === cells.length && lists.every((list) => isChecklistList(list))) {
    const items = lists.flatMap((list) => Array.from(list.children).filter((child): child is HTMLElement => isHtmlElement(child) && child.tagName === "LI"));
    const paragraphs = unwrapChecklistItems(doc, items);
    selectTableEditingTarget(doc, paragraphs[0] ?? cells.find((cell) => cell.isConnected) ?? cells[0]);
    normalizeEditableDocument(doc);
    return paragraphs.length > 0;
  }

  const converted = cells
    .map((cell) => convertTableCellContentToChecklist(doc, cell))
    .filter((list): list is HTMLElement => Boolean(list));
  selectTableEditingTarget(doc, converted[0] ?? cells.find((cell) => cell.isConnected) ?? cells[0]);
  normalizeEditableDocument(doc);
  return converted.length > 0;
}

function convertListElementToChecklist(doc: Document, list: HTMLElement) {
  const checklist = list.tagName === "UL" ? list : doc.createElement("ul");
  if (checklist !== list) {
    Array.from(list.attributes).forEach((attribute) => checklist.setAttribute(attribute.name, attribute.value));
    while (list.firstChild) checklist.append(list.firstChild);
    list.parentNode?.replaceChild(checklist, list);
  }
  configureChecklistList(checklist);
  Array.from(checklist.children).forEach((child) => {
    if (child.tagName === "LI") ensureChecklistItem(doc, child as HTMLElement);
  });
  return checklist;
}

function createChecklist(doc: Document) {
  const list = doc.createElement("ul");
  configureChecklistList(list);
  return list;
}

function configureChecklistList(list: HTMLElement) {
  list.setAttribute("data-ai-checklist", "true");
  list.style.listStyleType = "none";
  list.style.paddingLeft = "0";
}

function createChecklistItem(doc: Document) {
  const item = doc.createElement("li");
  ensureChecklistItem(doc, item);
  return item;
}

function ensureChecklistItem(doc: Document, item: HTMLElement) {
  if (item.querySelector(':scope > label > input[type="checkbox"]')) return item;
  moveNodesIntoChecklistItem(doc, item, Array.from(item.childNodes));
  return item;
}

function moveNodesIntoChecklistItem(doc: Document, item: HTMLElement, nodes: Node[]) {
  const label = doc.createElement("label");
  label.style.display = "flex";
  label.style.gap = "8px";
  label.style.alignItems = "flex-start";
  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("contenteditable", "false");
  checkbox.style.marginTop = "0.25em";
  const content = doc.createElement("span");
  content.style.flex = "1";
  const meaningfulNodes = nodes.filter((node) => !(node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "BR"));
  if (meaningfulNodes.length === 0) content.append(doc.createElement("br"));
  meaningfulNodes.forEach((node) => content.append(node));
  label.append(checkbox, content);
  item.replaceChildren(label);
}

function unwrapChecklistItems(doc: Document, items: HTMLElement[]) {
  const selected = new Set(items);
  const created: HTMLElement[] = [];
  uniqueListParents(items).forEach((list) => {
    const parent = list.parentNode;
    if (!parent) return;
    const fragment = doc.createDocumentFragment();
    let currentListClone: HTMLElement | null = null;
    Array.from(list.children).forEach((child) => {
      if (child.tagName !== "LI") return;
      if (selected.has(child as HTMLElement)) {
        currentListClone = null;
        const paragraph = doc.createElement("p");
        moveChecklistItemContent(doc, child as HTMLElement, paragraph);
        fragment.append(paragraph);
        created.push(paragraph);
      } else {
        if (!currentListClone) {
          currentListClone = list.cloneNode(false) as HTMLElement;
          fragment.append(currentListClone);
        }
        currentListClone.append(child);
      }
    });
    parent.insertBefore(fragment, list);
    list.remove();
  });
  return created;
}

function unwrapChecklistItemContent(doc: Document, item: HTMLElement) {
  const fragment = doc.createDocumentFragment();
  moveChecklistItemContent(doc, item, fragment);
  item.replaceChildren(fragment);
}

function moveChecklistItemContent(doc: Document, item: HTMLElement, target: Node) {
  const content = item.querySelector(":scope > label > span");
  if (content) {
    while (content.firstChild) target.appendChild(content.firstChild);
  } else {
    Array.from(item.childNodes).forEach((node) => target.appendChild(node));
  }
  if (!target.textContent?.trim() && !Array.from(target.childNodes).some((node) => node.nodeType === Node.ELEMENT_NODE)) {
    target.appendChild(doc.createElement("br"));
  }
}

function adjustTableCellIndent(doc: Document, direction: 1 | -1) {
  const cells = selectedTableStyleTargets(doc);
  if (cells.length === 0) return false;
  let changed = false;
  cells.forEach((cell) => {
    const current = currentIndentPixels(cell, "paddingLeft");
    const next = Math.max(0, current + direction * 24);
    if (next === current) return;
    if (next === 0) cell.style.removeProperty("padding-left");
    else cell.style.paddingLeft = `${next}px`;
    changed = true;
  });
  if (!changed) return false;
  selectTableEditingTarget(doc, cells.find((cell) => cell.isConnected) ?? cells[0]);
  normalizeEditableDocument(doc);
  return true;
}

function adjustBlockIndent(doc: Document, direction: 1 | -1) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const blocks = getSelectedBlockElements(doc, selection).filter((block) => canAdjustBlockIndent(block));
  if (blocks.length === 0) return false;
  let changed = false;
  blocks.forEach((block) => {
    const property = isTableCellElement(block) ? "paddingLeft" : "marginLeft";
    const current = currentIndentPixels(block, property);
    const next = Math.max(0, current + direction * 24);
    if (next === current) return;
    if (next === 0) block.style.removeProperty(kebabCase(property));
    else block.style.setProperty(kebabCase(property), `${next}px`);
    changed = true;
  });
  if (changed) restoreBlockSelection(doc, selection, blocks);
  return changed;
}

function adjustSelectedListItems(doc: Document, direction: 1 | -1, targetElement?: Element | null) {
  const selection = doc.getSelection();
  const selectedItems = selection && selection.rangeCount > 0 ? getSelectedBlockElements(doc, selection) : [];
  const fallbackItem = targetElement && doc.body.contains(targetElement) ? targetElement.closest("li") : null;
  const items = sortElementsByDocumentOrder(uniqueElements([
    ...selectedItems,
    ...(isHtmlElement(fallbackItem) ? [fallbackItem] : []),
  ]))
    .filter((block): block is HTMLElement => block.tagName === "LI")
    .filter((item) => item.parentElement?.tagName === "OL" || item.parentElement?.tagName === "UL");
  if (items.length === 0) return false;
  const changed = direction > 0 ? indentListItems(doc, items) : outdentListItems(items);
  if (!changed) return false;
  if (selection) restoreBlockSelection(doc, selection, items.filter((item) => item.isConnected));
  normalizeEditableDocument(doc);
  return true;
}

function uniqueElements<T extends Element>(elements: T[]) {
  return Array.from(new Set(elements));
}

function sortElementsByDocumentOrder<T extends Element>(elements: T[]) {
  return [...elements].sort((left, right) => {
    if (left === right) return 0;
    return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  });
}

function indentListItems(doc: Document, items: HTMLElement[]) {
  let changed = false;
  items.forEach((item) => {
    const list = item.parentElement;
    const previous = item.previousElementSibling;
    if (!list || !previous || previous.tagName !== "LI") return;
    const nestedList = findOrCreateNestedList(doc, previous as HTMLElement, list.tagName.toLowerCase() as "ol" | "ul");
    nestedList.append(item);
    changed = true;
  });
  return changed;
}

function outdentListItems(items: HTMLElement[]) {
  let changed = false;
  const groups = groupListItemsByParentList(items);
  groups.forEach((groupItems, list) => {
    const parentItem = list.parentElement;
    if (!parentItem || parentItem.tagName !== "LI" || !parentItem.parentNode) return;
    let insertionPoint: ChildNode = parentItem;
    groupItems.forEach((item) => {
      if (item.parentElement !== list) return;
      parentItem.parentNode?.insertBefore(item, insertionPoint.nextSibling);
      insertionPoint = item;
      changed = true;
    });
    if (list.children.length === 0) list.remove();
  });
  return changed;
}

function findOrCreateNestedList(doc: Document, item: HTMLElement, tagName: "ol" | "ul") {
  const existing = Array.from(item.children).find((child) => child.tagName.toLowerCase() === tagName);
  if (isHtmlElement(existing)) return existing;
  const list = doc.createElement(tagName);
  item.append(list);
  return list;
}

function groupListItemsByParentList(items: HTMLElement[]) {
  const groups = new Map<HTMLElement, HTMLElement[]>();
  items.forEach((item) => {
    const list = item.parentElement;
    if (!isHtmlElement(list)) return;
    const group = groups.get(list) ?? [];
    group.push(item);
    groups.set(list, group);
  });
  return groups;
}

function canAdjustBlockIndent(block: HTMLElement) {
  if (block.tagName === "LI" || block.tagName === "OL" || block.tagName === "UL") return false;
  return isTableCellElement(block) || canConvertBlockElement(block);
}

function currentIndentPixels(element: HTMLElement, property: "marginLeft" | "paddingLeft") {
  const inline = element.style[property];
  const computed = element.ownerDocument.defaultView?.getComputedStyle(element)[property] ?? "";
  return cssPixels(inline || computed);
}

function cssPixels(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "auto") return 0;
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? Math.max(0, Number.parseFloat(match[1])) : 0;
}

function convertTableCellContentBlock(doc: Document, cell: HTMLTableCellElement, tagName: HeadingTag): HTMLElement | null {
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

function presentationSourceElement(doc: Document, targetElement?: Element | null) {
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

function presentationApplicationElement(doc: Document, targetElement?: Element | null) {
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

function readPresentationStyle(source: HTMLElement): PresentationStyle | null {
  const computed = source.ownerDocument.defaultView?.getComputedStyle(source);
  if (!computed) return null;
  const style: PresentationStyle = {};
  presentationProperties.forEach((property) => {
    const value = computed.getPropertyValue(kebabCase(property));
    if (!isSkippablePresentationValue(value)) style[property] = value;
  });
  return Object.keys(style).length > 0 ? style : null;
}

function normalizePresentationStyle(style: PresentationStyle | null | undefined): PresentationStyle | null {
  if (!style) return null;
  const normalized: PresentationStyle = {};
  presentationProperties.forEach((property) => {
    const value = style[property]?.trim();
    if (!isSkippablePresentationValue(value)) normalized[property] = value;
  });
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function omitPresentationStyle(style: PresentationStyle, omitted: PresentationProperty[]) {
  const next: PresentationStyle = {};
  presentationProperties.forEach((property) => {
    if (!omitted.includes(property) && style[property]) next[property] = style[property];
  });
  return Object.keys(next).length > 0 ? next : null;
}

function applyPresentationStyleToElement(element: HTMLElement, style: PresentationStyle) {
  Object.entries(style).forEach(([property, value]) => {
    if (value) element.style.setProperty(kebabCase(property), value);
  });
}

function isSkippablePresentationValue(value: string | undefined) {
  const normalized = value?.trim();
  return !normalized || normalized === "normal" || normalized === "none" || normalized === "rgba(0, 0, 0, 0)" || normalized === "transparent";
}

function restoreBlockSelection(doc: Document, selection: Selection, blocks: HTMLElement[]) {
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

function findNearestBlock(node: Node, doc: Document): HTMLElement | null {
  let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (current && current !== doc.body) {
    if (isHtmlElement(current) && isBlockElement(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function isBlockElement(element: Element) {
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

function hasBlockDescendantInSet(block: HTMLElement, blocks: Set<HTMLElement>) {
  return Array.from(blocks).some((candidate) => candidate !== block && block.contains(candidate));
}

function rangeIntersectsNode(range: Range, node: Node) {
  try {
    return range.intersectsNode(node);
  } catch {
    const nodeRange = node.ownerDocument?.createRange();
    if (!nodeRange) return false;
    nodeRange.selectNodeContents(node);
    return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 && range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
  }
}

function findLinkInSelection(doc: Document) {
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

function linkForCurrentLinkEdit(doc: Document, targetElement?: Element | null) {
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

function rangeInsideElement(range: Range, element: Element) {
  return element.contains(range.startContainer) && element.contains(range.endContainer);
}

function selectedElement(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const nodeElement = selectedNodeElement(doc);
  if (nodeElement) return nodeElement;
  return nearestElement(range.commonAncestorContainer);
}

function selectedNodeElement(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed || range.startContainer !== range.endContainer || range.endOffset !== range.startOffset + 1) return null;
  const child = range.startContainer.childNodes[range.startOffset];
  return isHtmlElement(child) ? child : null;
}

function elementMutationTarget(doc: Document, targetElement?: Element | null) {
  const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc);
  if (!isHtmlElement(target) || target === doc.body || target === doc.documentElement) return null;
  if (isTableCellElement(target)) return firstEditableChildElement(target);
  if (isTableStructureElement(target)) return null;
  return target;
}

function elementAttributeTarget(doc: Document, targetElement?: Element | null) {
  const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc);
  if (!isHtmlElement(target) || target === doc.body || target === doc.documentElement) return null;
  if (isTableStructureElement(target) && !isTableCellElement(target) && target.tagName !== "TABLE") return null;
  return target;
}

function elementContentTarget(doc: Document, targetElement?: Element | null) {
  const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc);
  if (!isHtmlElement(target) || target === doc.body || target === doc.documentElement) return null;
  if (isTableCellElement(target)) return target;
  if (isTableStructureElement(target) || isVoidElement(target)) return null;
  return target;
}

function firstEditableChildElement(element: Element) {
  const child = Array.from(element.children).find((item) => item.tagName !== "BR" && !isTableStructureElement(item));
  return isHtmlElement(child) ? child : null;
}

function isTableStructureElement(element: Element) {
  return ["TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "COLGROUP", "COL"].includes(element.tagName);
}

function isVoidElement(element: Element) {
  return ["AREA", "BASE", "BR", "COL", "EMBED", "HR", "IMG", "INPUT", "LINK", "META", "PARAM", "SOURCE", "TRACK", "WBR"].includes(element.tagName);
}

function nearestElement(node: Node | null): HTMLElement | null {
  if (!node) return null;
  if (isHtmlElement(node)) return node;
  return node.parentElement;
}

function clearElementFormatting(element: Element) {
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

function clearFormatInElement(element: Element): { firstNode: Node | null; lastNode: Node | null } {
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

function selectClearedFormatResult(doc: Document, result: { firstNode: Node | null; lastNode: Node | null }, fallback: Element) {
  const selection = doc.getSelection();
  if (!selection) return;
  if (result.firstNode?.isConnected && result.lastNode?.isConnected) {
    selectNodeRange(doc, selection, result.firstNode, result.lastNode);
    return;
  }
  if (fallback.isConnected) moveSelectionNearNode(doc, fallback);
}

function clearFormatInRange(doc: Document, range: Range, selection: Selection) {
  const fragment = range.extractContents();
  clearFragmentFormatting(fragment);
  const insertedNodes = Array.from(fragment.childNodes);
  if (insertedNodes.length === 0) return false;
  range.insertNode(fragment);
  selectNodeRange(doc, selection, insertedNodes[0], insertedNodes[insertedNodes.length - 1]);
  normalizeEditableDocument(doc);
  return true;
}

function clearFragmentFormatting(fragment: DocumentFragment) {
  Array.from(fragment.children).forEach((child) => clearElementFormatting(child));
}

function extractPlainTextForClearFormat(node: Node): string {
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

function clearSelectedTextFormatting(doc: Document, range: Range, selection: Selection) {
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

function isolateTextSegment(node: Node, start: number, end: number) {
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const textNode = node as Text;
  const length = textNode.data.length;
  const safeStart = Math.max(0, Math.min(length, start));
  const safeEnd = Math.max(safeStart, Math.min(length, end));
  if (safeStart === safeEnd) return null;
  if (safeEnd < length) textNode.splitText(safeEnd);
  return safeStart > 0 ? textNode.splitText(safeStart) : textNode;
}

function liftNodeOutOfInlineFormatting(node: Node, doc: Document) {
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

function splitInlineParentAroundChild(parent: Element, child: Node) {
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

function clearResidualInlineFormattingInSelection(doc: Document, selection: Selection) {
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

function collectInlineAncestors(node: Node, output: Set<Element>, doc: Document) {
  let current = nearestElement(node);
  while (current && current !== doc.body) {
    if (isBlockElement(current)) return;
    if (current.tagName === "A" || inlineTags.includes(current.tagName.toLowerCase())) output.add(current);
    current = current.parentElement;
  }
}

function clearInlineElementFormatting(element: Element) {
  if (!isHtmlElement(element)) return;
  clearPresentationAttributes(element, ["class", "color", "face", "size", "background"]);
}

function clearInlineElementNode(element: Element) {
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

function clearPresentationAttributes(element: HTMLElement, attributes: string[]) {
  element.removeAttribute("style");
  attributes.forEach((attribute) => element.removeAttribute(attribute));
}

function hasPreservedAttributes(element: Element) {
  return Array.from(element.attributes).some((attribute) => !isPresentationAttribute(attribute.name));
}

function isPresentationAttribute(name: string) {
  return ["style", "class", "bgcolor", "color", "face", "size", "align", "valign", "background", "border", "cellpadding", "cellspacing", "width", "height"].includes(
    name.toLowerCase(),
  );
}

function replaceInlineFormattingElementWithSpan(element: Element) {
  const doc = element.ownerDocument;
  const span = doc.createElement("span");
  copyPreservedAttributes(element, span);
  while (element.firstChild) span.appendChild(element.firstChild);
  element.parentNode?.replaceChild(span, element);
}

function wrapNodeWithPreservedInlineAttributes(doc: Document, node: Node, source: Element) {
  if (!node.parentNode) return node;
  const span = doc.createElement("span");
  copyPreservedAttributes(source, span);
  node.parentNode.insertBefore(span, node);
  span.appendChild(node);
  return span;
}

function copyPreservedAttributes(source: Element, target: Element) {
  Array.from(source.attributes).forEach((attribute) => {
    if (!isPresentationAttribute(attribute.name)) target.setAttribute(attribute.name, attribute.value);
  });
}

function descendantDepth(element: Element) {
  let depth = 0;
  let current = element.parentElement;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function selectNodeRange(doc: Document, selection: Selection, firstNode: Node, lastNode: Node) {
  const range = doc.createRange();
  range.setStartBefore(firstNode);
  range.setEndAfter(lastNode);
  selection.removeAllRanges();
  selection.addRange(range);
}

function moveSelectionAfterNode(doc: Document, node: Node) {
  const selection = doc.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertedContentTarget(doc: Document, node: Node | null) {
  if (!node) return null;
  const element = isElementNode(node) ? node : node.parentElement;
  return element && doc.body.contains(element) && element !== doc.body ? element : null;
}

function insertAdjacentFragment(target: Element, fragment: DocumentFragment, position: AdjacentInsertPosition) {
  insertAdjacentNode(target, fragment, position);
}

function insertAdjacentNode(target: Element, node: Node, position: AdjacentInsertPosition) {
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

function ensureInsertionSelection(doc: Document, targetElement?: Element | null) {
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

function moveSelectionNearNode(doc: Document, node: Node) {
  const selection = doc.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  if (isElementNode(node)) range.selectNodeContents(node);
  else range.selectNode(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getTableContext(doc: Document, targetElement?: Element | null) {
  const selectionTarget = selectedElement(doc);
  const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectionTarget && doc.body.contains(selectionTarget) ? selectionTarget : null;
  const tableTarget = target?.tagName === "TABLE" ? (target as HTMLTableElement) : null;
  const rowTarget = target?.tagName === "TR" ? (target as HTMLTableRowElement) : null;
  const cell =
    findTableCellFromElement(target) ??
    findTableCellInSelection(doc) ??
    tableTarget?.querySelector("td, th") ??
    rowTarget?.querySelector("td, th") ??
    null;
  if (!isTableCellElement(cell)) return null;
  const row = cell.closest("tr") as HTMLTableRowElement | null;
  const table = cell.closest("table") as HTMLTableElement | null;
  if (!row || !table) return null;
  return { cell: cell as HTMLTableCellElement, row, table };
}

function findTableCellFromElement(element?: Element | null) {
  const cell = element?.closest("td, th") ?? null;
  return isTableCellElement(cell) ? cell : null;
}

function findTableCellFromNode(node?: Node | null) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement ?? null;
  return findTableCellFromElement(element);
}

function activeTableCellSelection(doc: Document) {
  const selection = tableCellSelections.get(doc);
  if (
    !selection ||
    !selection.table.isConnected ||
    !selection.anchor.isConnected ||
    !selection.focus.isConnected ||
    selection.anchor.closest("table") !== selection.table ||
    selection.focus.closest("table") !== selection.table
  ) {
    tableCellSelections.delete(doc);
    return null;
  }
  return selection;
}

function findTableCellInSelection(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const ancestor = nearestElement(range.commonAncestorContainer);
    const ancestorCell = findTableCellFromElement(ancestor);
    if (ancestorCell) return ancestorCell;
    const cellInRange = ancestor
      ? Array.from(ancestor.querySelectorAll("td, th")).find((cell) => rangeIntersectsNode(range, cell))
      : null;
    if (isTableCellElement(cellInRange)) return cellInRange;
  }
  return null;
}

function isTableCellElement(element: Element | null | undefined): element is HTMLTableCellElement {
  return Boolean(element && (element instanceof HTMLTableCellElement || element.tagName === "TD" || element.tagName === "TH"));
}

function buildTableGrid(table: HTMLTableElement) {
  const rows: TableGridSlot[][] = [];
  let columnCount = 0;

  Array.from(table.rows).forEach((row, rowIndex) => {
    rows[rowIndex] ??= [];
    let columnIndex = 0;
    Array.from(row.cells).forEach((cell) => {
      while (rows[rowIndex][columnIndex]) columnIndex += 1;
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      const colSpan = Math.max(1, cell.colSpan || 1);
      const slot: TableGridSlot = { cell, row, rowIndex, columnIndex, rowSpan, colSpan };

      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const targetRow = rowIndex + rowOffset;
        rows[targetRow] ??= [];
        for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
          rows[targetRow][columnIndex + columnOffset] = slot;
        }
      }

      columnIndex += colSpan;
      columnCount = Math.max(columnCount, columnIndex);
    });
    columnCount = Math.max(columnCount, rows[rowIndex].length);
  });

  return { rows, columnCount: Math.max(1, columnCount) };
}

function findTableCellSlot(grid: ReturnType<typeof buildTableGrid>, cell: HTMLTableCellElement) {
  for (const row of grid.rows) {
    for (const slot of row) {
      if (slot?.cell === cell) return slot;
    }
  }
  return null;
}

function canMergeCellsHorizontally(current?: TableGridSlot | null, next?: TableGridSlot) {
  return Boolean(
    current &&
      next &&
      current.cell !== next.cell &&
      current.rowIndex === next.rowIndex &&
      current.columnIndex + current.colSpan === next.columnIndex &&
      current.rowSpan === next.rowSpan,
  );
}

function canMergeCellsVertically(current?: TableGridSlot | null, next?: TableGridSlot) {
  return Boolean(
    current &&
      next &&
      current.cell !== next.cell &&
      current.columnIndex === next.columnIndex &&
      current.rowIndex + current.rowSpan === next.rowIndex &&
      current.colSpan === next.colSpan,
  );
}

function selectedTableMergeRegion(doc: Document, table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>): TableMergeRegion | null {
  const activeRegion = selectedTableCellRegion(doc, table, grid);
  if (activeRegion) return activeRegion;

  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = -1;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxColumn = -1;
  let hasIntersectedCell = false;

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const slots = tableSlotsIntersectingRange(table, grid, range);
    if (slots.length === 0) continue;
    hasIntersectedCell = true;
    slots.forEach((slot) => {
      minRow = Math.min(minRow, slot.rowIndex);
      maxRow = Math.max(maxRow, slot.rowIndex + slot.rowSpan - 1);
      minColumn = Math.min(minColumn, slot.columnIndex);
      maxColumn = Math.max(maxColumn, slot.columnIndex + slot.colSpan - 1);
    });
  }

  return hasIntersectedCell ? tableRegionFromBounds(grid, minRow, maxRow, minColumn, maxColumn) : null;
}

function tableSlotsIntersectingRange(table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>, range: Range) {
  return uniqueSlots(grid.rows.flat()).filter((slot) => slot.cell.closest("table") === table && rangeIntersectsNode(range, slot.cell));
}

function tableActionSlots(doc: Document, table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>) {
  const activeRegion = selectedTableCellRegion(doc, table, grid);
  if (activeRegion) return activeRegion.slots;

  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];
  const slots: TableGridSlot[] = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    slots.push(...tableSlotsIntersectingRange(table, grid, selection.getRangeAt(index)));
  }
  return uniqueSlots(slots);
}

function tableActionRowIndexes(
  doc: Document,
  table: HTMLTableElement,
  grid: ReturnType<typeof buildTableGrid>,
  fallbackSlot?: TableGridSlot | null,
) {
  const slots = tableActionSlots(doc, table, grid);
  if (slots.length === 0) return fallbackSlot ? [fallbackSlot.rowIndex] : [];
  const indexes = new Set<number>();
  slots.forEach((slot) => {
    for (let offset = 0; offset < slot.rowSpan; offset += 1) indexes.add(slot.rowIndex + offset);
  });
  return [...indexes].filter((index) => index >= 0 && index < table.rows.length).sort((left, right) => left - right);
}

function tableActionColumnIndexes(
  doc: Document,
  table: HTMLTableElement,
  grid: ReturnType<typeof buildTableGrid>,
  fallbackSlot?: TableGridSlot | null,
) {
  const slots = tableActionSlots(doc, table, grid);
  if (slots.length === 0) return fallbackSlot ? tableSlotColumnIndexes(fallbackSlot, grid.columnCount) : [];
  const indexes = new Set<number>();
  slots.forEach((slot) => {
    tableSlotColumnIndexes(slot, grid.columnCount).forEach((index) => indexes.add(index));
  });
  return [...indexes].sort((left, right) => left - right);
}

function tableSlotColumnIndexes(slot: TableGridSlot, columnCount: number) {
  return Array.from({ length: Math.max(1, slot.colSpan) }, (_, offset) => slot.columnIndex + offset).filter(
    (index) => index >= 0 && index < columnCount,
  );
}

function selectedTableCellRegion(doc: Document, table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>) {
  const selection = activeTableCellSelection(doc);
  if (!selection || selection.table !== table || selection.anchor === selection.focus) return null;
  const anchorSlot = findTableCellSlot(grid, selection.anchor);
  const focusSlot = findTableCellSlot(grid, selection.focus);
  if (!anchorSlot || !focusSlot) return null;
  return tableRegionFromBounds(
    grid,
    Math.min(anchorSlot.rowIndex, focusSlot.rowIndex),
    Math.max(anchorSlot.rowIndex + anchorSlot.rowSpan - 1, focusSlot.rowIndex + focusSlot.rowSpan - 1),
    Math.min(anchorSlot.columnIndex, focusSlot.columnIndex),
    Math.max(anchorSlot.columnIndex + anchorSlot.colSpan - 1, focusSlot.columnIndex + focusSlot.colSpan - 1),
  );
}

function tableCellsForSelection(selection: TableCellSelection) {
  const grid = buildTableGrid(selection.table);
  const region = selectedTableCellRegion(selection.table.ownerDocument, selection.table, grid);
  if (region) return region.slots.map((slot) => slot.cell);
  return [selection.anchor];
}

function tableRegionFromBounds(
  grid: ReturnType<typeof buildTableGrid>,
  minRow: number,
  maxRow: number,
  minColumn: number,
  maxColumn: number,
) {
  if (!Number.isFinite(minRow) || minRow > maxRow || minColumn > maxColumn) return null;
  const slots: TableGridSlot[] = [];
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex += 1) {
      const slot = grid.rows[rowIndex]?.[columnIndex];
      if (!slot) return null;
      if (
        slot.rowIndex < minRow ||
        slot.rowIndex + slot.rowSpan - 1 > maxRow ||
        slot.columnIndex < minColumn ||
        slot.columnIndex + slot.colSpan - 1 > maxColumn
      ) {
        return null;
      }
      slots.push(slot);
    }
  }

  const unique = uniqueSlots(slots).sort((left, right) => left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex);
  if (unique.length <= 1) return null;
  return {
    slots: unique,
    rowIndex: minRow,
    columnIndex: minColumn,
    rowSpan: maxRow - minRow + 1,
    colSpan: maxColumn - minColumn + 1,
  };
}

function selectedTableStyleTargets(doc: Document) {
  const activeSelection = activeTableCellSelection(doc);
  if (activeSelection && activeSelection.anchor !== activeSelection.focus) return tableCellsForSelection(activeSelection);

  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  const startCell = nearestElement(range.startContainer)?.closest("td, th");
  const table = startCell?.closest("table");
  if (!isTableCellElement(startCell) || !table) return [];
  const region = selectedTableMergeRegion(doc, table, buildTableGrid(table));
  return region ? region.slots.map((slot) => slot.cell) : [];
}

function tableBorderRegion(doc: Document, targetElement?: Element | null): TableMergeRegion | null {
  const context = getTableContext(doc, targetElement);
  if (!context) return null;
  const grid = buildTableGrid(context.table);
  const selectedRegion = selectedTableMergeRegion(doc, context.table, grid);
  if (selectedRegion) return selectedRegion;
  const slot = findTableCellSlot(grid, context.cell);
  return slot ? singleSlotRegion(slot) : null;
}

function singleSlotRegion(slot: TableGridSlot): TableMergeRegion {
  return {
    slots: [slot],
    rowIndex: slot.rowIndex,
    columnIndex: slot.columnIndex,
    rowSpan: slot.rowSpan,
    colSpan: slot.colSpan,
  };
}

function tableBorderSidesForSlot(action: TableBorderAction, slot: TableGridSlot, region: TableMergeRegion) {
  const sides: Array<"top" | "right" | "bottom" | "left"> = [];
  const minRow = region.rowIndex;
  const maxRow = region.rowIndex + region.rowSpan - 1;
  const minColumn = region.columnIndex;
  const maxColumn = region.columnIndex + region.colSpan - 1;
  const slotBottom = slot.rowIndex + slot.rowSpan - 1;
  const slotRight = slot.columnIndex + slot.colSpan - 1;

  if (action === "all" || action === "none") return ["top", "right", "bottom", "left"];
  if (action === "top" || (action === "outer" && slot.rowIndex === minRow)) sides.push("top");
  if (action === "right" || (action === "outer" && slotRight === maxColumn)) sides.push("right");
  if (action === "bottom" || (action === "outer" && slotBottom === maxRow)) sides.push("bottom");
  if (action === "left" || (action === "outer" && slot.columnIndex === minColumn)) sides.push("left");
  if (action === "inner") {
    if (slotRight < maxColumn) sides.push("right");
    if (slotBottom < maxRow) sides.push("bottom");
  }
  return sides;
}

function applyTableColumnWidth(doc: Document, targetElement: Element | null | undefined, width: string) {
  const region = tableBorderRegion(doc, targetElement);
  const table = region?.slots[0]?.cell.closest("table");
  if (!region || !table) return false;

  const grid = buildTableGrid(table);
  const minColumn = region.columnIndex;
  const maxColumn = region.columnIndex + region.colSpan - 1;
  const touched = new Set<HTMLTableCellElement>();
  let changed = false;

  for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex += 1) {
    grid.rows.forEach((row) => {
      const slot = row[columnIndex];
      if (!slot || touched.has(slot.cell)) return;
      touched.add(slot.cell);
      if (width) slot.cell.style.width = cssSizeForSpan(width, slot.colSpan);
      else slot.cell.style.removeProperty("width");
      changed = true;
    });
  }

  if (changed) normalizeEditableDocument(doc);
  return changed;
}

function applyTableRowHeight(doc: Document, targetElement: Element | null | undefined, height: string) {
  const region = tableBorderRegion(doc, targetElement);
  const table = region?.slots[0]?.cell.closest("table");
  if (!region || !table) return false;

  const grid = buildTableGrid(table);
  const minRow = region.rowIndex;
  const maxRow = region.rowIndex + region.rowSpan - 1;
  const touched = new Set<HTMLTableCellElement>();
  let changed = false;

  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    const row = table.rows[rowIndex];
    if (row) {
      if (height) row.style.height = height;
      else row.style.removeProperty("height");
      changed = true;
    }
    uniqueSlots(grid.rows[rowIndex] ?? []).forEach((slot) => {
      if (touched.has(slot.cell)) return;
      touched.add(slot.cell);
      if (height) slot.cell.style.height = cssSizeForSpan(height, slot.rowSpan);
      else slot.cell.style.removeProperty("height");
      changed = true;
    });
  }

  if (changed) normalizeEditableDocument(doc);
  return changed;
}

function cssSizeForSpan(value: string, span: number) {
  if (!value || span <= 1) return value;
  const match = value.match(/^([\d.]+)(px|%|rem|em|vw|vh)$/i);
  if (!match) return value;
  return `${roundCssNumber(Number.parseFloat(match[1]) * span)}${match[2]}`;
}

function mergeTableRegion(doc: Document, region: TableMergeRegion) {
  const anchor = region.slots.find((slot) => slot.rowIndex === region.rowIndex && slot.columnIndex === region.columnIndex) ?? region.slots[0];
  region.slots.forEach((slot) => {
    if (slot.cell === anchor.cell) return;
    mergeTableCellContent(doc, anchor.cell, slot.cell);
    slot.cell.remove();
  });
  setCellRowSpan(anchor.cell, region.rowSpan);
  setCellColSpan(anchor.cell, region.colSpan);
  clearTableCellSelection(doc);
  selectTableEditingTarget(doc, anchor.cell);
  normalizeEditableDocument(doc);
  return true;
}

function insertTableRowAtVisualIndex(
  doc: Document,
  table: HTMLTableElement,
  anchorRow: HTMLTableRowElement,
  rowIndex: number,
  referenceSide: "previous" | "next" = "next",
) {
  const grid = buildTableGrid(table);
  const safeRowIndex = Math.max(0, Math.min(rowIndex, table.rows.length));
  const referenceRow = table.rows[safeRowIndex] ?? null;
  const parent =
    referenceRow?.parentElement ??
    (referenceSide === "previous" && anchorRow.closest("thead") ? ensureTableBody(doc, table) : anchorRow.parentElement) ??
    table.tBodies[0] ??
    table;
  const effectiveReferenceSide = referenceRow && referenceRow.parentElement !== anchorRow.parentElement ? "next" : referenceSide;
  const blockedColumns = new Set<number>();
  const expanded = new Set<HTMLTableCellElement>();
  for (let columnIndex = 0; columnIndex < grid.columnCount; columnIndex += 1) {
    const slot = findSlotCrossingRowBoundary(grid, safeRowIndex, columnIndex);
    if (!slot) continue;
    if (!expanded.has(slot.cell)) {
      setCellRowSpan(slot.cell, slot.rowSpan + 1);
      expanded.add(slot.cell);
    }
    for (let offset = 0; offset < slot.colSpan; offset += 1) blockedColumns.add(slot.columnIndex + offset);
  }

  const row = doc.createElement("tr");
  for (let columnIndex = 0; columnIndex < grid.columnCount; columnIndex += 1) {
    if (!blockedColumns.has(columnIndex)) {
      row.append(createTableCellLikeReference(doc, rowInsertionStyleReference(grid, safeRowIndex, columnIndex, parent, effectiveReferenceSide)));
    }
  }

  parent.insertBefore(row, referenceRow && referenceRow.parentElement === parent ? referenceRow : null);
  return row;
}

function findSlotCrossingRowBoundary(grid: ReturnType<typeof buildTableGrid>, rowIndex: number, columnIndex: number) {
  if (rowIndex <= 0) return null;
  const slot = grid.rows[rowIndex - 1]?.[columnIndex];
  if (!slot) return null;
  return slot.rowIndex < rowIndex && slot.rowIndex + slot.rowSpan > rowIndex ? slot : null;
}

function deleteTableRowAtVisualIndex(table: HTMLTableElement, rowIndex: number, row: HTMLTableRowElement) {
  const grid = buildTableGrid(table);
  const safeRowIndex = Math.max(0, Math.min(rowIndex, table.rows.length - 1));
  const rowSlots = grid.rows[safeRowIndex] ?? [];
  const movedCells = Array.from(uniqueSlots(rowSlots))
    .filter((slot) => slot.row === row && slot.rowSpan > 1)
    .sort((left, right) => left.columnIndex - right.columnIndex);
  const nextRow = table.rows[safeRowIndex + 1] ?? null;

  uniqueSlots(rowSlots).forEach((slot) => {
    if (slot.rowIndex < safeRowIndex && slot.rowIndex + slot.rowSpan > safeRowIndex) {
      setCellRowSpan(slot.cell, slot.rowSpan - 1);
    }
  });

  if (nextRow) {
    movedCells.forEach((slot) => {
      const reference = findCellReferenceAtVisualColumn(table, nextRow, slot.columnIndex);
      setCellRowSpan(slot.cell, slot.rowSpan - 1);
      nextRow.insertBefore(slot.cell, reference);
    });
  }

  const nextSelectionTarget = row.nextElementSibling ?? row.previousElementSibling ?? table;
  row.remove();
  return nextSelectionTarget;
}

function uniqueSlots(slots: TableGridSlot[]) {
  const seen = new Set<HTMLTableCellElement>();
  return slots.filter((slot) => {
    if (!slot || seen.has(slot.cell)) return false;
    seen.add(slot.cell);
    return true;
  });
}

function insertTableColumnAtVisualIndex(
  doc: Document,
  table: HTMLTableElement,
  columnIndex: number,
  referenceSide: "previous" | "next" = "next",
) {
  const grid = buildTableGrid(table);
  const expanded = new Set<HTMLTableCellElement>();
  Array.from(table.rows).forEach((row, rowIndex) => {
    const crossingSlot = findSlotCrossingColumnBoundary(grid.rows[rowIndex] ?? [], columnIndex);
    if (crossingSlot) {
      if (!expanded.has(crossingSlot.cell)) {
        setCellColSpan(crossingSlot.cell, crossingSlot.colSpan + 1);
        expanded.add(crossingSlot.cell);
      }
      return;
    }
    insertCellsAtVisualColumn(doc, table, row, columnIndex, 1, referenceSide);
  });
}

function deleteTableColumnAtVisualIndex(table: HTMLTableElement, columnIndex: number, preferredRowIndex = 0) {
  const grid = buildTableGrid(table);
  const touched = new Set<HTMLTableCellElement>();
  Array.from(table.rows).forEach((_, rowIndex) => {
    const slot = grid.rows[rowIndex]?.[columnIndex];
    if (!slot || touched.has(slot.cell)) return;
    touched.add(slot.cell);
    if (slot.colSpan > 1) {
      setCellColSpan(slot.cell, slot.colSpan - 1);
    } else {
      slot.cell.remove();
    }
  });
  const nextGrid = buildTableGrid(table);
  const safeColumnIndex = Math.max(0, Math.min(columnIndex, nextGrid.columnCount - 1));
  const safeRowIndex = Math.max(0, Math.min(preferredRowIndex, nextGrid.rows.length - 1));
  return (
    nextGrid.rows[safeRowIndex]?.[safeColumnIndex]?.cell ??
    nextGrid.rows[safeRowIndex]?.find((slot) => slot?.cell)?.cell ??
    nextGrid.rows.find((row) => row.find((slot) => slot?.cell))?.find((slot) => slot?.cell)?.cell ??
    null
  );
}

function copyTableRows(table: HTMLTableElement, rowIndexes: number[]) {
  const allRows = Array.from(table.rows);
  const indexes = sortedUniqueIndexes(rowIndexes, allRows.length);
  const rows = indexes.map((index) => allRows[index]).filter((row): row is HTMLTableRowElement => Boolean(row));
  if (rows.length === 0) return false;
  const anchor = allRows[indexes[indexes.length - 1]];
  if (!anchor) return false;
  const parent = anchor.parentNode;
  if (!parent) return false;
  const hasStructuredSections = tableHasStructuredSections(table, parent);
  const reference = anchor.nextSibling;
  rows.forEach((row) => {
    parent.insertBefore(row.cloneNode(true), reference);
  });
  if (hasStructuredSections) flattenTableRowsIntoBody(table);
  return true;
}

function copyTableColumns(table: HTMLTableElement, columnIndexes: number[]) {
  const grid = buildTableGrid(table);
  const indexes = sortedUniqueIndexes(columnIndexes, grid.columnCount);
  if (indexes.length === 0) return false;
  const anchorIndex = indexes[indexes.length - 1];
  let changed = false;
  Array.from(table.rows).forEach((row, rowIndex) => {
    const clones = indexes
      .map((columnIndex) => cloneCellAtVisualColumn(grid, rowIndex, columnIndex))
      .filter((cell): cell is Node => Boolean(cell));
    if (clones.length === 0) return;
    const reference = cellReferenceAfterVisualColumn(table, row, anchorIndex);
    clones.forEach((clone) => row.insertBefore(clone, reference));
    changed = true;
  });
  return changed;
}

function sortedUniqueIndexes(indexes: number[], upperBound: number) {
  return [...new Set(indexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < upperBound)
    .sort((left, right) => left - right);
}

function cloneCellAtVisualColumn(grid: ReturnType<typeof buildTableGrid>, rowIndex: number, columnIndex: number) {
  const slot = grid.rows[rowIndex]?.[columnIndex];
  if (!slot || slot.rowIndex !== rowIndex || slot.columnIndex !== columnIndex) return null;
  return slot.cell.cloneNode(true);
}

function cellReferenceAfterVisualColumn(table: HTMLTableElement, row: HTMLTableRowElement, columnIndex: number) {
  return findCellReferenceAtVisualColumn(table, row, columnIndex + 1);
}

function moveTableRows(table: HTMLTableElement, rowIndex: number, rowSpan: number, direction: -1 | 1) {
  if (direction < 0 && rowIndex <= 0) return false;
  if (direction > 0 && rowIndex + rowSpan >= table.rows.length) return false;
  const rows = Array.from(table.rows).slice(rowIndex, rowIndex + rowSpan);
  if (rows.length === 0) return false;
  const sourceParents = new Set(rows.map((row) => row.parentNode));

  if (direction < 0) {
    const previous = table.rows[rowIndex - 1];
    const parent = previous?.parentNode;
    if (!previous || !parent) return false;
    rows.forEach((row) => parent.insertBefore(row, previous));
    if (rowsCrossedTableSection(sourceParents, parent)) flattenTableRowsIntoBody(table);
    return true;
  }

  const next = table.rows[rowIndex + rowSpan];
  const parent = next?.parentNode;
  if (!next || !parent) return false;
  const reference = next.nextSibling;
  rows.forEach((row) => parent.insertBefore(row, reference));
  if (rowsCrossedTableSection(sourceParents, parent)) flattenTableRowsIntoBody(table);
  return true;
}

function tableHasStructuredSections(table: HTMLTableElement, rowParent?: ParentNode | null) {
  return Boolean(table.tHead || table.tFoot || table.tBodies.length > 1 || (rowParent && rowParent !== table.tBodies[0]));
}

function rowsCrossedTableSection(sourceParents: Set<ParentNode | null>, targetParent: ParentNode) {
  return sourceParents.size !== 1 || !sourceParents.has(targetParent);
}

function flattenTableRowsIntoBody(table: HTMLTableElement) {
  const doc = table.ownerDocument;
  const rows = Array.from(table.rows);
  table.tHead?.remove();
  table.tFoot?.remove();
  Array.from(table.tBodies).forEach((body) => body.remove());
  const body = doc.createElement("tbody");
  rows.forEach((row) => body.append(row));
  table.append(body);
}

function moveTableColumns(table: HTMLTableElement, columnIndex: number, colSpan: number, direction: -1 | 1) {
  const grid = buildTableGrid(table);
  const columnCount = grid.columnCount;
  if (direction < 0 && columnIndex <= 0) return false;
  if (direction > 0 && columnIndex + colSpan >= columnCount) return false;
  if (colSpan <= 0) return false;

  Array.from(table.rows).forEach((row, rowIndex) => {
    const moving = uniqueSlots((grid.rows[rowIndex] ?? []).slice(columnIndex, columnIndex + colSpan)).filter((slot) => slot.row === row).map((slot) => slot.cell);
    if (moving.length === 0) return;
    if (direction < 0) {
      const reference = findCellReferenceAtVisualColumn(table, row, columnIndex - 1);
      moving.forEach((cell) => row.insertBefore(cell, reference));
      return;
    }
    const reference = cellReferenceAfterVisualColumn(table, row, columnIndex + colSpan);
    moving.forEach((cell) => row.insertBefore(cell, reference));
  });
  return true;
}

function tableCellAtVisualPosition(table: HTMLTableElement, rowIndex: number, columnIndex: number) {
  const grid = buildTableGrid(table);
  if (grid.rows.length === 0 || grid.columnCount === 0) return null;
  const safeRowIndex = Math.max(0, Math.min(rowIndex, grid.rows.length - 1));
  const safeColumnIndex = Math.max(0, Math.min(columnIndex, grid.columnCount - 1));
  return (
    grid.rows[safeRowIndex]?.[safeColumnIndex]?.cell ??
    grid.rows[safeRowIndex]?.find((slot) => slot?.cell)?.cell ??
    grid.rows.find((row) => row.find((slot) => slot?.cell))?.find((slot) => slot?.cell)?.cell ??
    null
  );
}

function tableHasSpans(table: HTMLTableElement) {
  return Array.from(table.rows).some((row) => Array.from(row.cells).some((cell) => cell.rowSpan > 1 || cell.colSpan > 1));
}

function tableHasRowSpans(table: HTMLTableElement) {
  return Array.from(table.rows).some((row) => Array.from(row.cells).some((cell) => cell.rowSpan > 1));
}

function tableHasColSpans(table: HTMLTableElement) {
  return Array.from(table.rows).some((row) => Array.from(row.cells).some((cell) => cell.colSpan > 1));
}

function canCopyTableRows(table: HTMLTableElement, rowIndexes: number[]) {
  const selectedRows = new Set(sortedUniqueIndexes(rowIndexes, table.rows.length));
  if (selectedRows.size === 0) return false;
  const grid = buildTableGrid(table);
  return uniqueSlots(grid.rows.flat()).every((slot) => {
    let intersectsSelection = false;
    for (let offset = 0; offset < slot.rowSpan; offset += 1) {
      const rowIndex = slot.rowIndex + offset;
      if (selectedRows.has(rowIndex)) intersectsSelection = true;
    }
    if (!intersectsSelection) return true;
    for (let offset = 0; offset < slot.rowSpan; offset += 1) {
      if (!selectedRows.has(slot.rowIndex + offset)) return false;
    }
    return true;
  });
}

function toggleTableHeaderRows(doc: Document, table: HTMLTableElement, rowIndexes: number[], makeHeader: boolean) {
  const rows = sortedUniqueIndexes(rowIndexes, table.rows.length)
    .map((rowIndex) => table.rows[rowIndex])
    .filter((row): row is HTMLTableRowElement => Boolean(row && row.cells.length > 0));
  if (rows.length === 0) return [];

  if (!makeHeader) {
    const body = ensureTableBody(doc, table);
    const insertionPoint = body.rows[0] ?? null;
    const fragment = doc.createDocumentFragment();
    rows.forEach((row) => {
      replaceTableRowCellTags(doc, row, "td", (cell) => {
        cell.style.fontWeight = "normal";
      });
      fragment.append(row);
    });
    body.insertBefore(fragment, insertionPoint);
    cleanupEmptyTableSections(table);
    return rows;
  }

  const head = table.tHead ?? table.createTHead();
  rows.forEach((row) => {
    replaceTableRowCellTags(doc, row, "th", (cell) => {
      cell.style.fontWeight = "bold";
    });
    head.append(row);
  });
  cleanupEmptyTableSections(table);
  return rows;
}

function tableRowsAreHeader(table: HTMLTableElement, rowIndexes: number[]) {
  const rows = sortedUniqueIndexes(rowIndexes, table.rows.length)
    .map((rowIndex) => table.rows[rowIndex])
    .filter((row): row is HTMLTableRowElement => Boolean(row && row.cells.length > 0));
  return rows.length > 0 && rows.every((row) => Boolean(row.closest("thead")));
}

function toggleTableHeaderColumns(doc: Document, table: HTMLTableElement, columnIndexes: number[], makeHeader: boolean) {
  const grid = buildTableGrid(table);
  const touched = new Set<HTMLTableCellElement>();
  const cells: HTMLTableCellElement[] = [];
  sortedUniqueIndexes(columnIndexes, grid.columnCount).forEach((columnIndex) => {
    grid.rows.forEach((row) => {
      const slot = row[columnIndex];
      if (!slot || touched.has(slot.cell)) return;
      touched.add(slot.cell);
      cells.push(slot.cell);
    });
  });
  if (cells.length === 0) return false;
  let changed = false;
  cells.forEach((cell) => {
    if (makeHeader && cell.tagName === "TD") {
      const replacement = replaceTableCellTag(doc, cell, "th");
      replacement.style.fontWeight = "bold";
      changed = true;
      return;
    }
    if (!makeHeader && cell.tagName === "TH") {
      const replacement = replaceTableCellTag(doc, cell, "td");
      replacement.style.fontWeight = "normal";
      changed = true;
    }
  });
  return changed;
}

function tableColumnsAreHeader(table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>, columnIndexes: number[]) {
  const indexes = sortedUniqueIndexes(columnIndexes, grid.columnCount);
  if (indexes.length === 0) return false;
  const touched = new Set<HTMLTableCellElement>();
  let hasCells = false;
  for (const columnIndex of indexes) {
    for (const row of grid.rows) {
      const slot = row[columnIndex];
      if (!slot || touched.has(slot.cell) || slot.cell.closest("table") !== table) continue;
      touched.add(slot.cell);
      hasCells = true;
      if (slot.cell.tagName !== "TH") return false;
    }
  }
  return hasCells;
}

function replaceTableCellTag(doc: Document, cell: HTMLTableCellElement, tagName: "td" | "th") {
  if (cell.tagName.toLowerCase() === tagName) return cell;
  const replacement = doc.createElement(tagName);
  Array.from(cell.attributes).forEach((attribute) => replacement.setAttribute(attribute.name, attribute.value));
  while (cell.firstChild) replacement.append(cell.firstChild);
  cell.parentNode?.replaceChild(replacement, cell);
  return replacement;
}

function replaceTableRowCellTags(
  doc: Document,
  row: HTMLTableRowElement,
  tagName: "td" | "th",
  configure?: (cell: HTMLTableCellElement) => void,
) {
  Array.from(row.cells).forEach((cell) => {
    const replacement = replaceTableCellTag(doc, cell, tagName);
    configure?.(replacement);
  });
}

function ensureTableBody(doc: Document, table: HTMLTableElement) {
  const existing = table.tBodies[0];
  if (existing) return existing;
  const body = doc.createElement("tbody");
  table.append(body);
  return body;
}

function cleanupEmptyTableSections(table: HTMLTableElement) {
  Array.from(table.tHead?.rows ?? []).length === 0 && table.tHead?.remove();
  Array.from(table.tBodies).forEach((body) => {
    if (body.rows.length === 0) body.remove();
  });
}

function distributeTableColumns(table: HTMLTableElement) {
  const grid = buildTableGrid(table);
  if (grid.columnCount <= 1) return false;
  const touched = new Set<HTMLTableCellElement>();
  const unitWidth = 100 / grid.columnCount;
  uniqueSlots(grid.rows.flat()).forEach((slot) => {
    if (touched.has(slot.cell)) return;
    touched.add(slot.cell);
    slot.cell.style.width = `${roundCssNumber(unitWidth * slot.colSpan)}%`;
  });
  return touched.size > 0;
}

function distributeTableRows(table: HTMLTableElement) {
  const rows = Array.from(table.rows);
  if (rows.length <= 1) return false;
  const heights = rows.map((row) => row.getBoundingClientRect().height).filter((height) => Number.isFinite(height) && height > 0);
  const targetHeight = Math.max(32, ...heights);
  rows.forEach((row) => {
    row.style.height = `${roundCssNumber(targetHeight)}px`;
    Array.from(row.cells).forEach((cell) => {
      cell.style.height = `${roundCssNumber(targetHeight)}px`;
    });
  });
  return true;
}

function roundCssNumber(value: number) {
  return Number.parseFloat(value.toFixed(3));
}

function findSlotCrossingColumnBoundary(rowSlots: TableGridSlot[], columnIndex: number) {
  return rowSlots.find((slot) => slot.columnIndex < columnIndex && slot.columnIndex + slot.colSpan > columnIndex);
}

function insertCellsAtVisualColumn(
  doc: Document,
  table: HTMLTableElement,
  row: HTMLTableRowElement,
  columnIndex: number,
  count: number,
  referenceSide: "previous" | "next" = "next",
  referenceOverride?: HTMLTableCellElement | null,
) {
  const grid = buildTableGrid(table);
  const rowIndex = Array.from(table.rows).indexOf(row);
  const referenceCell = referenceOverride ?? tableCellStyleReference(grid, rowIndex, columnIndex, "column", referenceSide);
  const reference = findCellReferenceAtVisualColumn(table, row, columnIndex);
  for (let index = 0; index < count; index += 1) {
    row.insertBefore(createTableCellForRow(doc, row, referenceCell), reference);
  }
}

function findCellReferenceAtVisualColumn(table: HTMLTableElement, row: HTMLTableRowElement, columnIndex: number) {
  const grid = buildTableGrid(table);
  const rowIndex = Array.from(table.rows).indexOf(row);
  const rowSlots = grid.rows[rowIndex] ?? [];
  const referenced = new Set<HTMLTableCellElement>();

  for (const slot of rowSlots) {
    if (!slot || slot.row !== row || referenced.has(slot.cell)) continue;
    referenced.add(slot.cell);
    if (slot.columnIndex >= columnIndex) return slot.cell;
  }

  return null;
}

function createEditableTable(doc: Document, rows: number, columns: number) {
  const table = doc.createElement("table");
  table.setAttribute("data-ai-document-table", "true");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.margin = "12px 0";
  const tbody = doc.createElement("tbody");
  const safeRows = Math.max(1, Math.min(12, Math.round(rows)));
  const safeColumns = Math.max(1, Math.min(12, Math.round(columns)));
  for (let rowIndex = 0; rowIndex < safeRows; rowIndex += 1) {
    tbody.append(createTableRow(doc, safeColumns));
  }
  table.append(tbody);
  return table;
}

function createTableRow(doc: Document, columns: number) {
  const row = doc.createElement("tr");
  for (let index = 0; index < Math.max(1, columns); index += 1) {
    row.append(createTableCell(doc));
  }
  return row;
}

function createTableCell(doc: Document, tagName: "td" | "th" = "td") {
  const cell = doc.createElement(tagName);
  cell.style.border = "1px solid #d0d5dd";
  cell.style.padding = "8px";
  cell.style.minWidth = "72px";
  cell.append(doc.createElement("br"));
  return cell;
}

function createTableCellLike(doc: Document, reference: HTMLTableCellElement) {
  return createTableCellLikeReference(doc, reference);
}

function createTableCellForRow(doc: Document, row: HTMLTableRowElement, reference?: HTMLTableCellElement | null) {
  return createTableCellLikeReference(doc, reference ?? row.cells[0] ?? null);
}

function createTableCellLikeReference(doc: Document, reference?: HTMLTableCellElement | null) {
  const cell = createTableCell(doc, reference?.tagName === "TH" ? "th" : "td");
  if (reference) copyTableCellPresentation(reference, cell);
  return cell;
}

function rowInsertionStyleReference(
  grid: ReturnType<typeof buildTableGrid>,
  rowIndex: number,
  columnIndex: number,
  parent: ParentNode,
  referenceSide: "previous" | "next",
) {
  const reference = tableCellStyleReference(grid, rowIndex, columnIndex, "row", referenceSide);
  if (!reference) return null;
  const parentSection = parent instanceof Element ? parent.tagName : "";
  const referenceSection = reference.parentElement?.parentElement?.tagName ?? "";
  if ((parentSection === "THEAD") !== (referenceSection === "THEAD")) return null;
  return reference;
}

function tableCellStyleReference(
  grid: ReturnType<typeof buildTableGrid>,
  rowIndex: number,
  columnIndex: number,
  direction: "row" | "column",
  referenceSide: "previous" | "next" = "next",
) {
  if (direction === "row") {
    const previousCell = grid.rows[rowIndex - 1]?.[columnIndex]?.cell ?? null;
    const nextCell = grid.rows[Math.min(rowIndex, grid.rows.length - 1)]?.[columnIndex]?.cell ?? null;
    return referenceSide === "previous" ? previousCell ?? nextCell : nextCell ?? previousCell;
  }
  const previousCell = grid.rows[rowIndex]?.[columnIndex - 1]?.cell ?? null;
  const nextCell = grid.rows[rowIndex]?.[columnIndex]?.cell ?? null;
  return referenceSide === "previous" ? previousCell ?? nextCell : nextCell ?? previousCell;
}

function copyTableCellPresentation(source: HTMLTableCellElement, target: HTMLTableCellElement) {
  const computed = source.ownerDocument.defaultView?.getComputedStyle(source);
  const properties = [
    "backgroundColor",
    "border",
    "borderColor",
    "borderStyle",
    "borderWidth",
    "color",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "minWidth",
    "padding",
    "textAlign",
    "textDecoration",
    "verticalAlign",
  ] as const;
  properties.forEach((property) => {
    const value = source.style[property] || computed?.[property];
    if (!value || isSkippablePresentationValue(value)) return;
    target.style[property] = value;
  });
}

function mergeTableCellContent(doc: Document, target: HTMLTableCellElement, source: HTMLTableCellElement) {
  const hasTargetContent = Boolean(target.textContent?.trim() || target.querySelector("img, table, hr"));
  const hasSourceContent = Boolean(source.textContent?.trim() || source.querySelector("img, table, hr"));
  if (hasTargetContent && hasSourceContent) target.append(doc.createElement("br"));
  Array.from(source.childNodes).forEach((node) => target.append(node));
  if (!target.childNodes.length) target.append(doc.createElement("br"));
}

function setCellRowSpan(cell: HTMLTableCellElement, value: number) {
  const span = Math.max(1, Math.round(value));
  cell.rowSpan = span;
  if (span === 1) cell.removeAttribute("rowspan");
}

function setCellColSpan(cell: HTMLTableCellElement, value: number) {
  const span = Math.max(1, Math.round(value));
  cell.colSpan = span;
  if (span === 1) cell.removeAttribute("colspan");
}

function findTargetImage(doc: Document, targetElement?: Element | null) {
  const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc);
  if (!target) return null;
  if (target.tagName === "IMG") return target as HTMLImageElement;
  const selected = selectedElement(doc);
  return selected?.tagName === "IMG" ? (selected as HTMLImageElement) : null;
}

function applyImageAttributes(image: HTMLImageElement, attributes: ImageAttributes) {
  image.setAttribute("src", attributes.src);
  image.setAttribute("alt", attributes.alt?.trim() ?? "");
  const width = normalizeCssSize(attributes.width ?? "");
  const height = normalizeCssSize(attributes.height ?? "");
  image.removeAttribute("width");
  image.removeAttribute("height");
  if (width) image.style.width = width;
  else image.style.removeProperty("width");
  if (height) image.style.height = height;
  else image.style.removeProperty("height");
}

function normalizeCssSize(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return /^(auto|[\d.]+(px|%|rem|em|vw|vh))$/i.test(trimmed) ? trimmed : "";
}

function normalizeCssSizeOrNormal(value: string) {
  const trimmed = value.trim();
  return trimmed.toLowerCase() === "normal" ? "normal" : normalizeCssSize(trimmed);
}

function normalizeLineHeight(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase() === "normal") return "normal";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  return normalizeCssSize(trimmed);
}

function normalizeBoxSize(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return "";
  const normalized = parts.map((part) => normalizeCssSize(part));
  return normalized.every(Boolean) ? normalized.join(" ") : "";
}

function normalizeBorderStyle(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["none", "solid", "dashed", "dotted", "double"].includes(normalized) ? normalized : "";
}

function normalizeVerticalAlign(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["baseline", "top", "middle", "bottom"].includes(normalized) ? normalized : "";
}

function normalizeColor(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed) || /^rgba?\([\d\s.,%]+\)$/i.test(trimmed) ? trimmed : "";
}

function kebabCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function sanitizeHtml(doc: Document, html: string) {
  const template = doc.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script").forEach((script) => script.remove());
  template.content.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (isUnsafeHtmlAttribute(attribute.name)) {
        element.removeAttribute(attribute.name);
        return;
      }
      const safeValue = sanitizeAttributeValue(attribute.name, attribute.value);
      if (safeValue === null) element.removeAttribute(attribute.name);
      else if (safeValue !== attribute.value) element.setAttribute(attribute.name, safeValue);
    });
  });
  return template.innerHTML;
}

function sanitizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
  return "";
}

export function normalizeLinkUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
  if (!/^[a-z][a-z\d+.-]*:/i.test(trimmed) && /^[^\s@]+\.[^\s]+$/.test(trimmed)) return `https://${trimmed}`;
  return "";
}

function applyLinkAttributes(link: HTMLAnchorElement, href: string) {
  link.setAttribute("href", href);
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
}

function normalizeWrapperTag(tagName: string): keyof HTMLElementTagNameMap | null {
  const normalized = tagName.trim().toLowerCase();
  const allowed = new Set([
    "a",
    "abbr",
    "article",
    "aside",
    "b",
    "blockquote",
    "cite",
    "code",
    "div",
    "em",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "li",
    "main",
    "mark",
    "ol",
    "p",
    "pre",
    "section",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "u",
    "ul",
  ]);
  return allowed.has(normalized) ? (normalized as keyof HTMLElementTagNameMap) : null;
}

function isSafeAttributeName(name: string) {
  const normalized = name.trim().toLowerCase();
  return /^[a-z_:][a-z0-9_:.-]*$/i.test(normalized) && !isUnsafeHtmlAttribute(normalized);
}

function isUnsafeHtmlAttribute(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized.startsWith("on") || normalized === "srcdoc";
}

function sanitizeAttributeValue(name: string, value: string) {
  const normalized = name.trim().toLowerCase();
  if (normalized === "style") return sanitizeStyleValue(value);
  if (!isUrlAttribute(normalized)) return value;
  if (normalized === "src") return sanitizeUrl(value) || null;
  return normalizeLinkUrl(value) || null;
}

function sanitizeStyleValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/expression\s*\(/i.test(trimmed) || /javascript\s*:/i.test(trimmed)) return null;
  return trimmed;
}

function isUrlAttribute(name: string) {
  return ["href", "xlink:href", "src", "poster", "cite", "action", "formaction"].includes(name);
}

function normalizeEditableDocument(doc: Document) {
  doc.body.normalize();
}

function execNativeCommand(doc: Document, command: string, value?: string) {
  doc.defaultView?.focus();
  return doc.execCommand(command, false, value);
}

function ensureSelectionOnTarget(doc: Document, targetElement?: Element | null) {
  if (!targetElement || targetElement === doc.body) return;
  const selection = doc.getSelection();
  if (!selection) return;
  if (selection.rangeCount > 0 && selection.toString().trim()) return;
  const range = doc.createRange();
  range.selectNodeContents(targetElement);
  selection.removeAllRanges();
  selection.addRange(range);
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function replaceLinkWithTextAndSelect(doc: Document, link: HTMLAnchorElement) {
  const parent = link.parentNode;
  if (!parent) return;
  const textNode = replaceElementWithText(link);
  const selection = doc.getSelection();
  if (selection && textNode.isConnected) selectNodeRange(doc, selection, textNode, textNode);
}

function replaceElementWithText(element: Element) {
  const textNode = element.ownerDocument.createTextNode(element.textContent ?? "");
  element.parentNode?.replaceChild(textNode, element);
  return textNode;
}

function copyPresentation(source: HTMLElement, target: HTMLElement) {
  const style = readPresentationStyle(source);
  if (style) applyPresentationStyleToElement(target, style);
}

function isElementNode(node: unknown): node is Element {
  return Boolean(node && typeof node === "object" && (node as Node).nodeType === 1 && "tagName" in node);
}

function isHtmlElement(node: unknown): node is HTMLElement {
  return Boolean(isElementNode(node) && "style" in node);
}
