import { ListKind } from './types';
import { canConvertBlockElement, getSelectedBlockElements } from './inlineHelpers';
import { selectTableEditingTarget } from './mediaElements';
import { findNearestBlock, isBlockElement, nearestElement, restoreBlockSelection } from './presentationHelpers';
import { copyPresentation, isHtmlElement, kebabCase, normalizeEditableDocument } from './sanitizeHelpers';
import { isTableCellElement, selectedTableStyleTargets } from './tableSelection';
export function toggleListWithBlockElements(doc: Document, kind: ListKind) {
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

export function isListConvertibleBlock(block: HTMLElement) {
  return block.tagName === "LI" || isTableCellElement(block) || canConvertBlockElement(block);
}

export function checklistBlocksForOperation(doc: Document, selection: Selection | null, targetElement?: Element | null) {
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

export function listTagName(kind: ListKind) {
  return kind === "ordered" ? "ol" : "ul";
}

export function listKindFromElement(list: Element): ListKind | null {
  if (isChecklistList(list)) return null;
  if (list.tagName === "OL") return "ordered";
  if (list.tagName === "UL") return "unordered";
  return null;
}

export function uniqueListParents(items: HTMLElement[]) {
  const lists = new Set<HTMLElement>();
  items.forEach((item) => {
    const list = item.closest("ol, ul");
    if (isHtmlElement(list)) lists.add(list);
  });
  return Array.from(lists);
}

export function areAllListItemsSelected(list: HTMLElement, selectedItems: HTMLElement[]) {
  const selected = new Set(selectedItems);
  return Array.from(list.children).filter((child) => child.tagName === "LI").every((item) => selected.has(item as HTMLElement));
}

export function unwrapListItems(doc: Document, items: HTMLElement[]) {
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

export function convertListElementKind(doc: Document, list: HTMLElement, kind: ListKind) {
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

export function convertBlockToList(doc: Document, block: HTMLElement, kind: ListKind): HTMLElement | null {
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

export function convertTableCellContentToList(doc: Document, cell: HTMLTableCellElement, kind: ListKind) {
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

export function toggleListInTableCells(doc: Document, cells: HTMLTableCellElement[], kind: ListKind) {
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

export function directListElementInCell(cell: HTMLTableCellElement) {
  return Array.from(cell.children).find((child) => child.tagName === "OL" || child.tagName === "UL");
}

export function mergeAdjacentLists(lists: HTMLElement[]) {
  lists.forEach((list) => {
    mergeWithPreviousList(list);
    mergeWithNextList(list);
  });
}

export function mergeWithPreviousList(list: HTMLElement) {
  const previous = list.previousElementSibling;
  if (!previous || !isMergeableList(previous, list)) return;
  while (list.firstChild) previous.append(list.firstChild);
  list.remove();
}

export function mergeWithNextList(list: HTMLElement) {
  if (!list.parentNode) return;
  const next = list.nextElementSibling;
  if (!next || !isMergeableList(next, list)) return;
  while (next.firstChild) list.append(next.firstChild);
  next.remove();
}

export function isMergeableList(candidate: Element | null, list: HTMLElement) {
  return Boolean(candidate && candidate.tagName === list.tagName && isChecklistList(candidate) === isChecklistList(list));
}

export function isChecklistList(element: Element | null | undefined) {
  return element?.tagName === "UL" && element.getAttribute("data-ai-checklist") === "true";
}

export function isChecklistItem(item: HTMLElement) {
  return Boolean(item.closest('ul[data-ai-checklist="true"]'));
}

export function convertBlockToChecklist(doc: Document, block: HTMLElement): HTMLElement | null {
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

export function convertTableCellContentToChecklist(doc: Document, cell: HTMLTableCellElement) {
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

export function toggleChecklistInTableCells(doc: Document, cells: HTMLTableCellElement[]) {
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

export function convertListElementToChecklist(doc: Document, list: HTMLElement) {
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

export function createChecklist(doc: Document) {
  const list = doc.createElement("ul");
  configureChecklistList(list);
  return list;
}

export function configureChecklistList(list: HTMLElement) {
  list.setAttribute("data-ai-checklist", "true");
  list.style.listStyleType = "none";
  list.style.paddingLeft = "0";
}

export function createChecklistItem(doc: Document) {
  const item = doc.createElement("li");
  ensureChecklistItem(doc, item);
  return item;
}

export function ensureChecklistItem(doc: Document, item: HTMLElement) {
  if (item.querySelector(':scope > label > input[type="checkbox"]')) return item;
  moveNodesIntoChecklistItem(doc, item, Array.from(item.childNodes));
  return item;
}

export function moveNodesIntoChecklistItem(doc: Document, item: HTMLElement, nodes: Node[]) {
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

export function unwrapChecklistItems(doc: Document, items: HTMLElement[]) {
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

export function unwrapChecklistItemContent(doc: Document, item: HTMLElement) {
  const fragment = doc.createDocumentFragment();
  moveChecklistItemContent(doc, item, fragment);
  item.replaceChildren(fragment);
}

export function moveChecklistItemContent(doc: Document, item: HTMLElement, target: Node) {
  const content = item.querySelector(":scope > label > span");
  if (content) {
    while (content.firstChild) target.appendChild(content.firstChild);
  } else {
    Array.from(item.childNodes).forEach((node) => {
      if (isChecklistCheckboxNode(node)) return;
      target.appendChild(node);
    });
  }
  if (!target.textContent?.trim() && !Array.from(target.childNodes).some((node) => node.nodeType === Node.ELEMENT_NODE)) {
    target.appendChild(doc.createElement("br"));
  }
}

export function isChecklistCheckboxNode(node: Node) {
  return isHtmlElement(node) && node.tagName === "INPUT" && (node as HTMLInputElement).type === "checkbox";
}

export function adjustTableCellIndent(doc: Document, direction: 1 | -1) {
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

export function adjustBlockIndent(doc: Document, direction: 1 | -1, targetElement?: Element | null) {
  const selection = doc.getSelection();
  const selectedBlocks = selection && selection.rangeCount > 0 ? getSelectedBlockElements(doc, selection) : [];
  const fallbackBlock =
    targetElement && doc.body.contains(targetElement)
      ? isBlockElement(targetElement)
        ? targetElement
        : findNearestBlock(targetElement, doc)
      : null;
  const blocks = sortElementsByDocumentOrder(uniqueElements([
    ...selectedBlocks,
    ...(isHtmlElement(fallbackBlock) ? [fallbackBlock] : []),
  ])).filter((block) => canAdjustBlockIndent(block));
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
  if (changed && selection) restoreBlockSelection(doc, selection, blocks);
  return changed;
}

export function adjustSelectedListItems(doc: Document, direction: 1 | -1, targetElement?: Element | null) {
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

export function hasListIndentContext(doc: Document, targetElement?: Element | null) {
  if (targetElement && doc.body.contains(targetElement) && targetElement.closest("li, ol, ul")) return true;
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return Boolean(nearestElement(range.commonAncestorContainer)?.closest("li, ol, ul"));
}

export function uniqueElements<T extends Element>(elements: T[]) {
  return Array.from(new Set(elements));
}

export function sortElementsByDocumentOrder<T extends Element>(elements: T[]) {
  return [...elements].sort((left, right) => {
    if (left === right) return 0;
    return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  });
}

export function indentListItems(doc: Document, items: HTMLElement[]) {
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

export function outdentListItems(items: HTMLElement[]) {
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

export function findOrCreateNestedList(doc: Document, item: HTMLElement, tagName: "ol" | "ul") {
  const existing = Array.from(item.children).find((child) => child.tagName.toLowerCase() === tagName);
  if (isHtmlElement(existing)) return existing;
  const list = doc.createElement(tagName);
  item.append(list);
  return list;
}

export function groupListItemsByParentList(items: HTMLElement[]) {
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

export function canAdjustBlockIndent(block: HTMLElement) {
  if (block.tagName === "LI" || block.tagName === "OL" || block.tagName === "UL") return false;
  return isTableCellElement(block) || canConvertBlockElement(block);
}

export function currentIndentPixels(element: HTMLElement, property: "marginLeft" | "paddingLeft") {
  const inline = element.style[property];
  const computed = element.ownerDocument.defaultView?.getComputedStyle(element)[property] ?? "";
  return cssPixels(inline || computed);
}

export function cssPixels(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "auto") return 0;
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? Math.max(0, Number.parseFloat(match[1])) : 0;
}
