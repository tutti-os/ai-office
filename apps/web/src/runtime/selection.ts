import type { SelectionState } from "./types";

export function captureSelectionState(doc: Document, fallbackNode?: Node | null): SelectionState | null {
  const selection = doc.getSelection();
  const fallbackPath = fallbackNode ? buildNodePath(fallbackNode, doc) : "";
  if (!selection || selection.rangeCount === 0) {
    const fallbackDomPath = fallbackNode ? buildDomNodePath(fallbackNode, doc) : "";
    const fallbackOffset = fallbackNode ? nodeOffsetLength(fallbackNode) : 0;
    return {
      selectedText: "",
      selectedHtml: "",
      selectionType: "write",
      anchorPath: "",
      focusPath: "",
      commonAncestorPath: fallbackPath,
      startPath: fallbackDomPath,
      startOffset: fallbackOffset,
      endPath: fallbackDomPath,
      endOffset: fallbackOffset,
    };
  }

  const range = selection.getRangeAt(0);
  const holder = doc.createElement("div");
  holder.append(range.cloneContents());
  const commonAncestor = nearestElement(range.commonAncestorContainer);
  const commonAncestorPath = commonAncestor ? buildElementPath(commonAncestor, doc) : fallbackPath;

  return {
    selectedText: selection.toString(),
    selectedHtml: holder.innerHTML,
    selectionType: selection.isCollapsed ? "write" : inferSelectionType(range, holder, selection.toString()),
    anchorPath: selection.anchorNode ? buildNodePath(selection.anchorNode, doc) : "",
    focusPath: selection.focusNode ? buildNodePath(selection.focusNode, doc) : "",
    commonAncestorPath,
    startPath: buildDomNodePath(range.startContainer, doc),
    startOffset: range.startOffset,
    endPath: buildDomNodePath(range.endContainer, doc),
    endOffset: range.endOffset,
  };
}

export function restoreSelectionState(doc: Document, selectionState: SelectionState | null) {
  const selection = doc.getSelection();
  if (!selection) return;
  const range = doc.createRange();

  if (selectionState?.startPath && selectionState.endPath) {
    const startNode = resolveDomNodePath(selectionState.startPath, doc);
    const endNode = resolveDomNodePath(selectionState.endPath, doc);
    if (startNode && endNode) {
      try {
        range.setStart(startNode, clampOffset(startNode, selectionState.startOffset ?? 0));
        range.setEnd(endNode, clampOffset(endNode, selectionState.endOffset ?? 0));
        if (selectionState.selectionType === "write") range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      } catch {
        range.detach?.();
      }
    }
  }

  if (!selectionState?.commonAncestorPath) return;
  const target = doc.querySelector(selectionState.commonAncestorPath);
  if (!target) return;
  range.selectNodeContents(target);
  if (selectionState.selectionType === "write") range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function inferSelectionType(range: Range, holder: HTMLElement, selectedText: string): SelectionState["selectionType"] {
  if (selectedElementFromRange(range)) return "element";
  return holder.children.length === 1 && holder.textContent?.trim() === selectedText.trim() ? "element" : "text";
}

function selectedElementFromRange(range: Range) {
  if (range.collapsed || range.startContainer !== range.endContainer || range.endOffset !== range.startOffset + 1) return null;
  const selected = range.startContainer.childNodes[range.startOffset];
  return selected?.nodeType === Node.ELEMENT_NODE ? (selected as Element) : null;
}

function nearestElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function buildNodePath(node: Node, doc: Document) {
  const element = nearestElement(node);
  return element ? buildElementPath(element, doc) : "";
}

function buildElementPath(element: Element, doc: Document) {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== doc.documentElement) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const currentTag = current.tagName;
    const siblings: Element[] = Array.from(parent.children).filter((child): child is Element => child.tagName === currentTag);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${Math.max(1, index)})`);
    current = parent;
  }
  return parts.join(" > ");
}

function buildDomNodePath(node: Node, doc: Document) {
  if (node === doc.body) return "body";
  const parts: number[] = [];
  let current: Node | null = node;
  while (current && current !== doc.body) {
    const parent: Node | null = current.parentNode;
    if (!parent) break;
    parts.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === doc.body ? `body/${parts.join("/")}` : "";
}

function resolveDomNodePath(path: string, doc: Document) {
  if (!path || !path.startsWith("body")) return null;
  let current: Node | null = doc.body;
  const parts = path.split("/").slice(1);
  for (const part of parts) {
    const index = Number.parseInt(part, 10);
    if (!current || !Number.isFinite(index) || index < 0 || index >= current.childNodes.length) return null;
    current = current.childNodes[index] ?? null;
  }
  return current;
}

function clampOffset(node: Node, offset: number) {
  return Math.max(0, Math.min(nodeOffsetLength(node), offset));
}

function nodeOffsetLength(node: Node) {
  return node.nodeType === Node.TEXT_NODE ? node.textContent?.length ?? 0 : node.childNodes.length;
}
