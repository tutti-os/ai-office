import { TableGridSlot, TableMergeRegion } from './types';
import { selectTableEditingTarget } from './mediaElements';
import { normalizeEditableDocument } from './sanitizeHelpers';
import { createTableCellForRow, createTableCellLikeReference, mergeTableCellContent, rowInsertionStyleReference, setCellColSpan, setCellRowSpan, tableCellStyleReference } from './tableCreation';
import { buildTableGrid } from './tableSelection';
import { clearTableCellSelection } from './textFormatting';
export function mergeTableRegion(doc: Document, region: TableMergeRegion) {
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

export function insertTableRowAtVisualIndex(
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

export function findSlotCrossingRowBoundary(grid: ReturnType<typeof buildTableGrid>, rowIndex: number, columnIndex: number) {
  if (rowIndex <= 0) return null;
  const slot = grid.rows[rowIndex - 1]?.[columnIndex];
  if (!slot) return null;
  return slot.rowIndex < rowIndex && slot.rowIndex + slot.rowSpan > rowIndex ? slot : null;
}

export function deleteTableRowAtVisualIndex(table: HTMLTableElement, rowIndex: number, row: HTMLTableRowElement) {
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

export function uniqueSlots(slots: TableGridSlot[]) {
  const seen = new Set<HTMLTableCellElement>();
  return slots.filter((slot) => {
    if (!slot || seen.has(slot.cell)) return false;
    seen.add(slot.cell);
    return true;
  });
}

export function insertTableColumnAtVisualIndex(
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

export function deleteTableColumnAtVisualIndex(table: HTMLTableElement, columnIndex: number, preferredRowIndex = 0) {
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

export function copyTableRows(table: HTMLTableElement, rowIndexes: number[]) {
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

export function copyTableColumns(table: HTMLTableElement, columnIndexes: number[]) {
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

export function sortedUniqueIndexes(indexes: number[], upperBound: number) {
  return [...new Set(indexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < upperBound)
    .sort((left, right) => left - right);
}

export function cloneCellAtVisualColumn(grid: ReturnType<typeof buildTableGrid>, rowIndex: number, columnIndex: number) {
  const slot = grid.rows[rowIndex]?.[columnIndex];
  if (!slot || slot.rowIndex !== rowIndex || slot.columnIndex !== columnIndex) return null;
  return slot.cell.cloneNode(true);
}

export function cellReferenceAfterVisualColumn(table: HTMLTableElement, row: HTMLTableRowElement, columnIndex: number) {
  return findCellReferenceAtVisualColumn(table, row, columnIndex + 1);
}

export function moveTableRows(table: HTMLTableElement, rowIndex: number, rowSpan: number, direction: -1 | 1) {
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

export function tableHasStructuredSections(table: HTMLTableElement, rowParent?: ParentNode | null) {
  return Boolean(table.tHead || table.tFoot || table.tBodies.length > 1 || (rowParent && rowParent !== table.tBodies[0]));
}

export function rowsCrossedTableSection(sourceParents: Set<ParentNode | null>, targetParent: ParentNode) {
  return sourceParents.size !== 1 || !sourceParents.has(targetParent);
}

export function flattenTableRowsIntoBody(table: HTMLTableElement) {
  const doc = table.ownerDocument;
  const rows = Array.from(table.rows);
  table.tHead?.remove();
  table.tFoot?.remove();
  Array.from(table.tBodies).forEach((body) => body.remove());
  const body = doc.createElement("tbody");
  rows.forEach((row) => body.append(row));
  table.append(body);
}

export function moveTableColumns(table: HTMLTableElement, columnIndex: number, colSpan: number, direction: -1 | 1) {
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

export function tableCellAtVisualPosition(table: HTMLTableElement, rowIndex: number, columnIndex: number) {
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

export function tableHasSpans(table: HTMLTableElement) {
  return Array.from(table.rows).some((row) => Array.from(row.cells).some((cell) => cell.rowSpan > 1 || cell.colSpan > 1));
}

export function tableHasRowSpans(table: HTMLTableElement) {
  return Array.from(table.rows).some((row) => Array.from(row.cells).some((cell) => cell.rowSpan > 1));
}

export function tableHasColSpans(table: HTMLTableElement) {
  return Array.from(table.rows).some((row) => Array.from(row.cells).some((cell) => cell.colSpan > 1));
}

export function canCopyTableRows(table: HTMLTableElement, rowIndexes: number[]) {
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

export function toggleTableHeaderRows(doc: Document, table: HTMLTableElement, rowIndexes: number[], makeHeader: boolean) {
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

export function tableRowsAreHeader(table: HTMLTableElement, rowIndexes: number[]) {
  const rows = sortedUniqueIndexes(rowIndexes, table.rows.length)
    .map((rowIndex) => table.rows[rowIndex])
    .filter((row): row is HTMLTableRowElement => Boolean(row && row.cells.length > 0));
  return rows.length > 0 && rows.every((row) => Boolean(row.closest("thead")));
}

export function toggleTableHeaderColumns(doc: Document, table: HTMLTableElement, columnIndexes: number[], makeHeader: boolean) {
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

export function tableColumnsAreHeader(table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>, columnIndexes: number[]) {
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

export function replaceTableCellTag(doc: Document, cell: HTMLTableCellElement, tagName: "td" | "th") {
  if (cell.tagName.toLowerCase() === tagName) return cell;
  const replacement = doc.createElement(tagName);
  Array.from(cell.attributes).forEach((attribute) => replacement.setAttribute(attribute.name, attribute.value));
  while (cell.firstChild) replacement.append(cell.firstChild);
  cell.parentNode?.replaceChild(replacement, cell);
  return replacement;
}

export function replaceTableRowCellTags(
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

export function ensureTableBody(doc: Document, table: HTMLTableElement) {
  const existing = table.tBodies[0];
  if (existing) return existing;
  const body = doc.createElement("tbody");
  table.append(body);
  return body;
}

export function cleanupEmptyTableSections(table: HTMLTableElement) {
  Array.from(table.tHead?.rows ?? []).length === 0 && table.tHead?.remove();
  Array.from(table.tBodies).forEach((body) => {
    if (body.rows.length === 0) body.remove();
  });
}

export function distributeTableColumns(table: HTMLTableElement) {
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

export function distributeTableRows(table: HTMLTableElement) {
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

export function roundCssNumber(value: number) {
  return Number.parseFloat(value.toFixed(3));
}

export function findSlotCrossingColumnBoundary(rowSlots: TableGridSlot[], columnIndex: number) {
  return rowSlots.find((slot) => slot.columnIndex < columnIndex && slot.columnIndex + slot.colSpan > columnIndex);
}

export function insertCellsAtVisualColumn(
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

export function findCellReferenceAtVisualColumn(table: HTMLTableElement, row: HTMLTableRowElement, columnIndex: number) {
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
