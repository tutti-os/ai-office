import type { KeyboardEvent, MouseEvent } from "react";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import type { MarkdownSelection } from "../artifact/markdownArtifactAdapter";

const markdownPersistentSelectionHighlightName = "ai-agent-markdown-selection";
const markdownPersistentSelectionHighlightStyleId = "ai-doc-markdown-persistent-selection-highlight";

type CssHighlightRegistry = {
  delete: (name: string) => void;
  set: (name: string, highlight: unknown) => void;
};

type CssHighlightConstructor = new (...ranges: Range[]) => unknown;

export function blockMarkdownReadOnlyMutation(event: { preventDefault: () => void; stopPropagation: () => void }, readOnly: boolean) {
  if (!readOnly) return;
  event.preventDefault();
  event.stopPropagation();
}

export function blockMarkdownReadOnlyTableChromeEvent(event: { target: EventTarget | null; preventDefault: () => void; stopPropagation: () => void }, readOnly: boolean) {
  if (!readOnly || !isMarkdownTableChromeTarget(event.target)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function preventMarkdownLinkNavigation(event: MouseEvent<HTMLDivElement>) {
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest("a[href]");
  if (!link?.closest(".markdown-preview")) return;
  event.preventDefault();
}

function isMarkdownTableChromeTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('[data-tool-cell="true"], [class*="toolCell"], [class*="tableToolsColumn"], button[class*="tableRowEditorTrigger"], button[class*="tableColumnEditorTrigger"]'));
}

export function isMarkdownEditingKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.key.length === 1) return true;
  return event.key === "Backspace" || event.key === "Delete" || event.key === "Enter" || event.key === "Tab";
}

export function markdownHistoryShortcutOffset(event: KeyboardEvent<HTMLDivElement>): -1 | 1 | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "y") return 1;
  if (key === "z") return event.shiftKey ? 1 : -1;
  return null;
}

export function isMarkdownComposingKeyEvent(event: KeyboardEvent<HTMLDivElement>) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

export function markdownSelectionRangeFromDocument() {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  if (!ancestor?.closest(".markdown-preview")) return null;
  return range.cloneRange();
}

export function isMarkdownEditorFocusInside() {
  const activeElement = document.activeElement;
  return Boolean(activeElement instanceof Element && activeElement.closest(".ai-markdown-editor-page"));
}

export function isMarkdownNestedTextInput(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select"));
}

export function setMarkdownPersistentSelectionHighlight(range: Range) {
  const registry = markdownHighlightRegistry();
  const HighlightConstructor = markdownHighlightConstructor();
  if (!registry || !HighlightConstructor) return;
  ensureMarkdownPersistentSelectionHighlightStyle();
  registry.set(markdownPersistentSelectionHighlightName, new HighlightConstructor(range));
}

export function clearMarkdownPersistentSelectionHighlight() {
  markdownHighlightRegistry()?.delete(markdownPersistentSelectionHighlightName);
}

function markdownHighlightRegistry() {
  return (CSS as typeof CSS & { highlights?: CssHighlightRegistry }).highlights ?? null;
}

function markdownHighlightConstructor() {
  return (globalThis as typeof globalThis & { Highlight?: CssHighlightConstructor }).Highlight ?? null;
}

function ensureMarkdownPersistentSelectionHighlightStyle() {
  if (document.getElementById(markdownPersistentSelectionHighlightStyleId)) return;
  const style = document.createElement("style");
  style.id = markdownPersistentSelectionHighlightStyleId;
  style.textContent = `
    ::highlight(${markdownPersistentSelectionHighlightName}) {
      background-color: rgba(148, 163, 184, 0.36);
      color: inherit;
    }
  `;
  document.head.append(style);
}

export function focusMarkdownTableCellEditor(event: MouseEvent<HTMLDivElement>) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest("button")) return;
  const cell = target.closest("td:not([data-tool-cell]), th:not([data-tool-cell])");
  const nestedEditor = cell?.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]');
  nestedEditor?.focus();
}

export function selectionFromEditor(editor: MDXEditorMethods | null, markdown: string, fallback: MarkdownSelection | null = null): MarkdownSelection {
  const selectedTextFromDocument = markdownSelectedTextFromDocument();
  if (selectedTextFromDocument) return selectionFromSelectedText(markdown, selectedTextFromDocument);
  const selectedText = editor?.getSelectionMarkdown() || "";
  if (selectedText) return selectionFromSelectedText(markdown, selectedText);
  if (fallback) return clampMarkdownSelection(markdown, fallback);
  return {
    start: markdown.length,
    end: markdown.length,
    selectedText: "",
  };
}

function selectionFromSelectedText(markdown: string, selectedText: string): MarkdownSelection {
  if (!selectedText) return selectionFromOffsets(markdown, markdown.length, markdown.length);
  const start = markdown.indexOf(selectedText);
  const safeStart = start >= 0 ? start : 0;
  return {
    start: safeStart,
    end: safeStart + selectedText.length,
    selectedText,
  };
}

function clampMarkdownSelection(markdown: string, selection: MarkdownSelection) {
  return selectionFromOffsets(markdown, selection.start, selection.end);
}

function markdownSelectedTextFromDocument() {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return "";
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  if (!ancestor?.closest(".markdown-preview")) return "";
  return selection.toString();
}

export function selectionFromOffsets(markdown: string, start: number, end: number): MarkdownSelection {
  const safeStart = clampNumber(start, 0, markdown.length);
  const safeEnd = clampNumber(end, safeStart, markdown.length);
  return {
    start: safeStart,
    end: safeEnd,
    selectedText: markdown.slice(safeStart, safeEnd),
  };
}

export function applyMarkdownLineIndent(markdown: string, selection: MarkdownSelection, outdent: boolean) {
  const lines = markdown.split("\n");
  const targetIndex = markdownLineIndexForSelection(markdown, lines, selection);
  if (targetIndex < 0) return markdown;
  const line = lines[targetIndex] ?? "";
  if (!line.trim()) return markdown;
  if (outdent) {
    lines[targetIndex] = line.replace(/^ {1,2}/, "");
  } else {
    lines[targetIndex] = `  ${line}`;
  }
  return lines.join("\n");
}

function markdownLineIndexForSelection(markdown: string, lines: string[], selection: MarkdownSelection) {
  if (selection.selectedText) {
    const offset = Math.max(0, markdown.indexOf(selection.selectedText));
    if (offset >= 0) return lineIndexAtOffset(markdown, offset);
  }
  if (selection.start >= 0 && selection.start < markdown.length) return lineIndexAtOffset(markdown, selection.start);
  const firstContentLine = lines.findIndex((line) => line.trim());
  return firstContentLine >= 0 ? firstContentLine : 0;
}

function lineIndexAtOffset(markdown: string, offset: number) {
  return markdown.slice(0, offset).split("\n").length - 1;
}

export function normalizeMarkdownEditorOutput(markdown: string) {
  return markdown
    .replace(/(^|\n)\\(#{1,6}\s+)/g, "$1$2")
    .replace(/^(\s*)([-*+]|\d+\.)\s+(.+?)(?:&#x9;|\t)$/gm, "$1  $2 $3");
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
