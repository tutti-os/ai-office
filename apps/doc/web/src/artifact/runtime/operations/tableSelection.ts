import { TableBorderAction, TableCellSelection, TableGridSlot, TableMergeRegion, tableCellSelections } from './types';
import { nearestElement, rangeIntersectsNode, selectedElement } from './presentationHelpers';
import { normalizeEditableDocument } from './sanitizeHelpers';
import { roundCssNumber, uniqueSlots } from './tableMutation';
export function getTableContext(doc: Document, targetElement?: Element | null) {
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

export function findTableCellFromElement(element?: Element | null) {
  const cell = element?.closest("td, th") ?? null;
  return isTableCellElement(cell) ? cell : null;
}

export function findTableCellFromNode(node?: Node | null) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement ?? null;
  return findTableCellFromElement(element);
}

export function activeTableCellSelection(doc: Document) {
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

export function findTableCellInSelection(doc: Document) {
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

export function isTableCellElement(element: Element | null | undefined): element is HTMLTableCellElement {
  return Boolean(element && (element instanceof HTMLTableCellElement || element.tagName === "TD" || element.tagName === "TH"));
}

export function buildTableGrid(table: HTMLTableElement) {
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

export function findTableCellSlot(grid: ReturnType<typeof buildTableGrid>, cell: HTMLTableCellElement) {
  for (const row of grid.rows) {
    for (const slot of row) {
      if (slot?.cell === cell) return slot;
    }
  }
  return null;
}

export function canMergeCellsHorizontally(current?: TableGridSlot | null, next?: TableGridSlot) {
  return Boolean(
    current &&
      next &&
      current.cell !== next.cell &&
      current.rowIndex === next.rowIndex &&
      current.columnIndex + current.colSpan === next.columnIndex &&
      current.rowSpan === next.rowSpan,
  );
}

export function canMergeCellsVertically(current?: TableGridSlot | null, next?: TableGridSlot) {
  return Boolean(
    current &&
      next &&
      current.cell !== next.cell &&
      current.columnIndex === next.columnIndex &&
      current.rowIndex + current.rowSpan === next.rowIndex &&
      current.colSpan === next.colSpan,
  );
}

export function selectedTableMergeRegion(doc: Document, table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>): TableMergeRegion | null {
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

export function tableSlotsIntersectingRange(table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>, range: Range) {
  return uniqueSlots(grid.rows.flat()).filter((slot) => slot.cell.closest("table") === table && rangeIntersectsNode(range, slot.cell));
}

export function tableActionSlots(doc: Document, table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>) {
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

export function tableActionRowIndexes(
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

export function tableActionColumnIndexes(
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

export function tableSlotColumnIndexes(slot: TableGridSlot, columnCount: number) {
  return Array.from({ length: Math.max(1, slot.colSpan) }, (_, offset) => slot.columnIndex + offset).filter(
    (index) => index >= 0 && index < columnCount,
  );
}

export function selectedTableCellRegion(doc: Document, table: HTMLTableElement, grid: ReturnType<typeof buildTableGrid>) {
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

export function tableCellsForSelection(selection: TableCellSelection) {
  const grid = buildTableGrid(selection.table);
  const region = selectedTableCellRegion(selection.table.ownerDocument, selection.table, grid);
  if (region) return region.slots.map((slot) => slot.cell);
  return [selection.anchor];
}

export function tableRegionFromBounds(
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

export function selectedTableStyleTargets(doc: Document) {
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

export function tableBorderRegion(doc: Document, targetElement?: Element | null): TableMergeRegion | null {
  const context = getTableContext(doc, targetElement);
  if (!context) return null;
  const grid = buildTableGrid(context.table);
  const selectedRegion = selectedTableMergeRegion(doc, context.table, grid);
  if (selectedRegion) return selectedRegion;
  const slot = findTableCellSlot(grid, context.cell);
  return slot ? singleSlotRegion(slot) : null;
}

export function singleSlotRegion(slot: TableGridSlot): TableMergeRegion {
  return {
    slots: [slot],
    rowIndex: slot.rowIndex,
    columnIndex: slot.columnIndex,
    rowSpan: slot.rowSpan,
    colSpan: slot.colSpan,
  };
}

export function tableBorderSidesForSlot(action: TableBorderAction, slot: TableGridSlot, region: TableMergeRegion) {
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

export function applyTableColumnWidth(doc: Document, targetElement: Element | null | undefined, width: string) {
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

export function applyTableRowHeight(doc: Document, targetElement: Element | null | undefined, height: string) {
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

export function cssSizeForSpan(value: string, span: number) {
  if (!value || span <= 1) return value;
  const match = value.match(/^([\d.]+)(px|%|rem|em|vw|vh)$/i);
  if (!match) return value;
  return `${roundCssNumber(Number.parseFloat(match[1]) * span)}${match[2]}`;
}
