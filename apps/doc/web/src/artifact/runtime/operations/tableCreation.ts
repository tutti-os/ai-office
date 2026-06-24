import { isSkippablePresentationValue } from './presentationHelpers';
import { buildTableGrid } from './tableSelection';
export function createEditableTable(doc: Document, rows: number, columns: number) {
  const table = doc.createElement("table");
  table.setAttribute("data-ai-doc-table", "true");
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

export function createTableRow(doc: Document, columns: number) {
  const row = doc.createElement("tr");
  for (let index = 0; index < Math.max(1, columns); index += 1) {
    row.append(createTableCell(doc));
  }
  return row;
}

export function createTableCell(doc: Document, tagName: "td" | "th" = "td") {
  const cell = doc.createElement(tagName);
  cell.style.border = "1px solid #d0d5dd";
  cell.style.padding = "8px";
  cell.style.minWidth = "72px";
  cell.append(doc.createElement("br"));
  return cell;
}

export function createTableCellLike(doc: Document, reference: HTMLTableCellElement) {
  return createTableCellLikeReference(doc, reference);
}

export function createTableCellForRow(doc: Document, row: HTMLTableRowElement, reference?: HTMLTableCellElement | null) {
  return createTableCellLikeReference(doc, reference ?? row.cells[0] ?? null);
}

export function createTableCellLikeReference(doc: Document, reference?: HTMLTableCellElement | null) {
  const cell = createTableCell(doc, reference?.tagName === "TH" ? "th" : "td");
  if (reference) copyTableCellPresentation(reference, cell);
  return cell;
}

export function rowInsertionStyleReference(
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

export function tableCellStyleReference(
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

export function copyTableCellPresentation(source: HTMLTableCellElement, target: HTMLTableCellElement) {
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

export function mergeTableCellContent(doc: Document, target: HTMLTableCellElement, source: HTMLTableCellElement) {
  const hasTargetContent = Boolean(target.textContent?.trim() || target.querySelector("img, table, hr"));
  const hasSourceContent = Boolean(source.textContent?.trim() || source.querySelector("img, table, hr"));
  if (hasTargetContent && hasSourceContent) target.append(doc.createElement("br"));
  Array.from(source.childNodes).forEach((node) => target.append(node));
  if (!target.childNodes.length) target.append(doc.createElement("br"));
}

export function setCellRowSpan(cell: HTMLTableCellElement, value: number) {
  const span = Math.max(1, Math.round(value));
  cell.rowSpan = span;
  if (span === 1) cell.removeAttribute("rowspan");
}

export function setCellColSpan(cell: HTMLTableCellElement, value: number) {
  const span = Math.max(1, Math.round(value));
  cell.colSpan = span;
  if (span === 1) cell.removeAttribute("colspan");
}
