import { serializeRuntimeDocument } from "./document";
import type { RuntimeState } from "./types";

export function runtimeStateToSrcDoc(state: RuntimeState) {
  return serializeRuntimeDocument(state.document);
}

export function enableEditableFrame(doc: Document) {
  doc.body.contentEditable = "true";
  doc.body.spellcheck = true;
  markTableCellsEditable(doc);
  enableTableCellCaretPlacement(doc);
  ensureRuntimeEditingStyles(doc);
}

function markTableCellsEditable(doc: Document) {
  doc.querySelectorAll<HTMLElement>("td, th").forEach((cell) => {
    cell.contentEditable = "true";
    cell.spellcheck = true;
    cell.tabIndex = -1;
    cell.setAttribute("data-runtime-editable-cell", "true");
    if (!cell.textContent?.trim() && cell.childElementCount === 0) {
      const placeholder = doc.createElement("br");
      placeholder.setAttribute("data-runtime-empty-cell", "true");
      cell.append(placeholder);
    }
  });
}

function enableTableCellCaretPlacement(doc: Document) {
  let activeCell: HTMLElement | null = null;
  const rememberCell = (event: Event) => {
    const cell = cellFromEvent(doc, event);
    if (cell && doc.body.contains(cell)) activeCell = cell;
    else if (!(event instanceof MouseEvent) || !isPointInsideTableCell(doc, event.clientX, event.clientY)) activeCell = null;
    return activeCell;
  };

  doc.addEventListener(
    "mousedown",
    (event) => {
      if (event.button !== 0) return;
      const cell = rememberCell(event);
      if (!cell) return;
      const target = event.target;
      if (target !== cell && cell.textContent?.trim()) return;
      const selection = doc.getSelection();
      if (!selection) return;
      const range = doc.createRange();
      range.selectNodeContents(cell);
      range.collapse(false);
      cell.focus();
      selection.removeAllRanges();
      selection.addRange(range);
    },
    true,
  );
  doc.addEventListener("pointerdown", rememberCell, true);
  doc.addEventListener("pointerup", rememberCell, true);
  doc.addEventListener("click", rememberCell, true);
  doc.addEventListener(
    "focusin",
    (event) => {
      rememberCell(event);
    },
    true,
  );
  doc.addEventListener(
    "keydown",
    (event) => {
      const cell = activeCell?.isConnected ? activeCell : currentTableCell(doc);
      if (!cell || !isTableCellInputRedirectTarget(doc, event.target) || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
      event.preventDefault();
      activeCell = cell;
      insertTextIntoCell(doc, cell, event.key);
    },
    true,
  );
  doc.addEventListener(
    "beforeinput",
    (event) => {
      const cell = activeCell?.isConnected ? activeCell : currentTableCell(doc);
      if (!(event instanceof InputEvent) || event.inputType !== "insertText" || !event.data || !cell) return;
      if (!isTableCellInputRedirectTarget(doc, event.target)) return;
      event.preventDefault();
      activeCell = cell;
      insertTextIntoCell(doc, cell, event.data);
    },
    true,
  );
  doc.addEventListener(
    "paste",
    (event) => {
      const cell = activeCell?.isConnected ? activeCell : currentTableCell(doc);
      if (!cell || !isTableCellInputRedirectTarget(doc, event.target)) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      event.preventDefault();
      activeCell = cell;
      insertTextIntoCell(doc, cell, text);
    },
    true,
  );
}

function cellFromEvent(doc: Document, event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  const directCell = target?.closest<HTMLElement>("td, th");
  if (directCell) return directCell;
  if (!(event instanceof MouseEvent)) return null;
  const pointedCell = doc.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("td, th");
  if (pointedCell) return pointedCell;
  return cellAtPoint(doc, event.clientX, event.clientY);
}

function cellAtPoint(doc: Document, clientX: number, clientY: number) {
  for (const cell of Array.from(doc.querySelectorAll<HTMLElement>("td, th"))) {
    const rect = cell.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return cell;
  }
  return null;
}

function isPointInsideTableCell(doc: Document, clientX: number, clientY: number) {
  return Boolean(cellAtPoint(doc, clientX, clientY));
}

function currentTableCell(doc: Document) {
  const active = doc.activeElement?.closest<HTMLElement>("td, th");
  if (active) return active;
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const anchor =
    selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement ?? null;
  return anchor?.closest<HTMLElement>("td, th") ?? null;
}

function isTableCellInputRedirectTarget(doc: Document, target: EventTarget | null) {
  if (target === doc.body || target === doc.documentElement) return true;
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return false;
  return Boolean(target.closest("td, th"));
}

function insertTextIntoCell(doc: Document, cell: HTMLElement, text: string) {
  cell.querySelectorAll("br[data-runtime-empty-cell]").forEach((node) => node.remove());
  insertTextIntoElement(doc, cell, text);
}

function insertTextIntoElement(doc: Document, element: HTMLElement, text: string) {
  if (!element.textContent?.trim()) element.querySelectorAll("br").forEach((node) => node.remove());
  const selection = doc.getSelection();
  const range = doc.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const textNode = doc.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

function ensureRuntimeEditingStyles(doc: Document) {
  const styleId = "ai-doc-runtime-editing-styles";
  if (doc.getElementById(styleId)) return;
  const style = doc.createElement("style");
  style.id = styleId;
  style.setAttribute("data-editor-runtime", "true");
  style.textContent = `
    td[data-ai-table-cell-selected],
    th[data-ai-table-cell-selected] {
      outline: 2px solid #3b82f6 !important;
      outline-offset: -2px !important;
      background-image: linear-gradient(rgba(59, 130, 246, 0.14), rgba(59, 130, 246, 0.14)) !important;
    }
  `;
  doc.head.append(style);
}
