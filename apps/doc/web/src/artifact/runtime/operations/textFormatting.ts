import { Alignment, ElementStyleAttributes, HeadingTag, InlineFormatTag, ListKind, PresentationStyle, inlineCommandByTag, tableCellSelectionAttribute, tableCellSelections, zeroWidthSpace } from './types';
import { clearFormatInElement, clearFormatInRange, clearResidualInlineFormattingInSelection, clearSelectedTextFormatting, selectClearedFormatResult } from './clearFormatHelpers';
import { applyInlineFormatToElements, convertBlockElement, createLinksInTableCells, createTextLink, currentBlockFromSelection, elementHasFormatting, getFormattingContext, getSelectedBlockElements, hasCollapsedTypingSelection, insertTypingStyleMarker, markerTextWithoutPlaceholders, normalizeStyleAttributes, rangeFragmentHasMostlyFormatting, rangeHasMostlyFormatting, removeInlineFormatFromElements, removeInlineFormatInRange, removeLinksInElements, removeLinksInSelectedRange, styleTargetElement, styleTextSelection, toggleFormattingOnElement, wrapRangeAsLink, wrapSelectionOrBlockWithStyle, wrapTextSelection } from './inlineHelpers';
import { adjustBlockIndent, adjustSelectedListItems, adjustTableCellIndent, checklistBlocksForOperation, convertBlockToChecklist, convertListElementToChecklist, hasListIndentContext, isChecklistItem, mergeAdjacentLists, toggleChecklistInTableCells, toggleListInTableCells, toggleListWithBlockElements, uniqueListParents, unwrapChecklistItems } from './listHelpers';
import { selectElement, selectTableEditingTarget } from './mediaElements';
import { applyPresentationStyleToElement, convertTableCellContentBlock, findLinkInSelection, findNearestBlock, linkForCurrentLinkEdit, nearestElement, normalizePresentationStyle, omitPresentationStyle, presentationApplicationElement, presentationSourceElement, readPresentationStyle, restoreBlockSelection, selectedElement, selectedNodeElement } from './presentationHelpers';
import { applyLinkAttributes, ensureSelectionOnTarget, execNativeCommand, isHtmlElement, kebabCase, normalizeColor, normalizeCssSize, normalizeEditableDocument, normalizeLinkText, normalizeLinkUrl, replaceLinkWithTextAndSelect } from './sanitizeHelpers';
import { activeTableCellSelection, findTableCellFromElement, findTableCellFromNode, selectedTableStyleTargets, tableCellsForSelection } from './tableSelection';
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

  if (context.hasTextSelection) {
    const selectedBlocks = getSelectedBlockElements(doc, context.selection);
    if (selectedBlocks.length > 0 && selectedBlocks.every((block) => elementHasFormatting(block, tagName))) {
      removeInlineFormatFromElements(doc, selectedBlocks, tagName);
      return true;
    }
  }

  const explicitlySelectedElement = selectedNodeElement(doc);
  if (explicitlySelectedElement && explicitlySelectedElement !== doc.body) {
    toggleFormattingOnElement(doc, explicitlySelectedElement, tagName);
    return true;
  }

  if (context.hasTextSelection) {
    const range = context.selection.getRangeAt(0);
    if (rangeHasMostlyFormatting(doc, range, tagName) || rangeFragmentHasMostlyFormatting(range, tagName)) {
      return removeInlineFormatInRange(doc, range, context.selection, tagName);
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

  const context = getFormattingContext(doc);
  if (context.selection && context.range && !context.range.collapsed) {
    const inlineAttributes = inlineStyleAttributesForTextSelection(normalized);
    if (Object.keys(inlineAttributes).length > 0) return styleTextSelection(doc, context.range, context.selection, inlineAttributes);
  }

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

export function clearTableCellSelectionVisuals(doc: Document) {
  doc.querySelectorAll(`[${tableCellSelectionAttribute}]`).forEach((cell) => {
    cell.removeAttribute(tableCellSelectionAttribute);
  });
}

export function paintTableCellSelection(doc: Document) {
  clearTableCellSelectionVisuals(doc);
  const selection = activeTableCellSelection(doc);
  if (!selection || selection.anchor === selection.focus) return;
  tableCellsForSelection(selection).forEach((cell) => {
    cell.setAttribute(tableCellSelectionAttribute, "true");
  });
}

export function applyElementStyles(targets: HTMLElement[], attributes: ElementStyleAttributes) {
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

function inlineStyleAttributesForTextSelection(attributes: ElementStyleAttributes): Partial<CSSStyleDeclaration> {
  const inlineAttributes: Partial<CSSStyleDeclaration> = {};
  if ("lineHeight" in attributes && attributes.lineHeight) inlineAttributes.lineHeight = attributes.lineHeight;
  if ("letterSpacing" in attributes && attributes.letterSpacing) inlineAttributes.letterSpacing = attributes.letterSpacing;
  if ("verticalAlign" in attributes && attributes.verticalAlign) inlineAttributes.verticalAlign = attributes.verticalAlign;
  return inlineAttributes;
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

export function createLink(doc: Document, url: string, targetElement?: Element | null, text?: string) {
  const href = normalizeLinkUrl(url);
  if (!href) return false;
  const linkText = normalizeLinkText(text, href);
  const selectedCells = selectedTableStyleTargets(doc);
  if (selectedCells.length > 0) return createLinksInTableCells(doc, selectedCells, href, text === undefined ? undefined : linkText);

  const selection = doc.getSelection();
  const existingLink = linkForCurrentLinkEdit(doc, targetElement);
  if (existingLink) {
    applyLinkAttributes(existingLink, href);
    if (text !== undefined) existingLink.textContent = linkText;
    selectElement(doc, existingLink);
    return existingLink;
  }

  if (!selection || selection.rangeCount === 0) {
    const target = targetElement && doc.body.contains(targetElement) ? targetElement : null;
    if (!isHtmlElement(target) || target === doc.body) return false;
    const link = createTextLink(doc, href, linkText);
    target.append(link);
    selectElement(doc, link);
    normalizeEditableDocument(doc);
    return link;
  }

  if (selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const link = createTextLink(doc, href, linkText);
    range.insertNode(link);
    selectElement(doc, link);
    normalizeEditableDocument(doc);
    return link;
  }

  const range = selection.getRangeAt(0);
  const link = wrapRangeAsLink(doc, range);
  applyLinkAttributes(link, href);
  if (text !== undefined) link.textContent = linkText;
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

export function getCurrentLinkText(doc: Document, targetElement?: Element | null) {
  const link = targetElement?.closest("a") ?? findLinkInSelection(doc);
  return link?.textContent ?? "";
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
  if (adjustBlockIndent(doc, 1, targetElement)) return true;
  if (hasListIndentContext(doc, targetElement)) return false;
  return execNativeCommand(doc, "indent");
}

export function outdentBlock(doc: Document, targetElement?: Element | null) {
  if (adjustTableCellIndent(doc, -1)) return true;
  ensureSelectionOnTarget(doc, targetElement);
  if (adjustSelectedListItems(doc, -1, targetElement)) return true;
  if (adjustBlockIndent(doc, -1, targetElement)) return true;
  if (hasListIndentContext(doc, targetElement)) return false;
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
