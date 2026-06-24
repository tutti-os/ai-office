import { TableActionAvailability, TableBorderAction, TableEditAction, TableHeaderState, tableEditActions } from './types';
import { ensureInsertionSelection, moveSelectionNearNode } from './clearFormatHelpers';
import { selectTableEditingTarget } from './mediaElements';
import { findNearestBlock } from './presentationHelpers';
import { normalizeBorderStyle, normalizeColor, normalizeCssSize, normalizeEditableDocument } from './sanitizeHelpers';
import { createEditableTable, createTableCellLike, mergeTableCellContent, setCellColSpan, setCellRowSpan } from './tableCreation';
import { canCopyTableRows, cleanupEmptyTableSections, copyTableColumns, copyTableRows, deleteTableColumnAtVisualIndex, deleteTableRowAtVisualIndex, distributeTableColumns, distributeTableRows, flattenTableRowsIntoBody, insertCellsAtVisualColumn, insertTableColumnAtVisualIndex, insertTableRowAtVisualIndex, mergeTableRegion, moveTableColumns, moveTableRows, tableCellAtVisualPosition, tableColumnsAreHeader, tableHasColSpans, tableHasRowSpans, tableHasSpans, tableHasStructuredSections, tableRowsAreHeader, toggleTableHeaderColumns, toggleTableHeaderRows } from './tableMutation';
import { applyTableColumnWidth, applyTableRowHeight, buildTableGrid, canMergeCellsHorizontally, canMergeCellsVertically, findTableCellSlot, getTableContext, selectedTableMergeRegion, singleSlotRegion, tableActionColumnIndexes, tableActionRowIndexes, tableBorderRegion, tableBorderSidesForSlot } from './tableSelection';
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

export function createTableActionAvailability(available: boolean): TableActionAvailability {
  return tableEditActions.reduce((actions, action) => {
    actions[action] = available;
    return actions;
  }, {} as TableActionAvailability);
}
