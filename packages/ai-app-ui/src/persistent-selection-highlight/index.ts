type CssHighlightRegistry = {
  delete: (name: string) => void;
  set: (name: string, highlight: unknown) => void;
};

type CssHighlightConstructor = new (...ranges: Range[]) => unknown;

export type PersistentSelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function setPersistentSelectionHighlight(name: string, range: Range, color = "rgba(148, 163, 184, 0.36)") {
  const registry = highlightRegistry();
  const HighlightConstructor = highlightConstructor();
  if (!registry || !HighlightConstructor) return false;
  ensurePersistentSelectionHighlightStyle(name, color);
  registry.set(name, new HighlightConstructor(range));
  return true;
}

export function clearPersistentSelectionHighlight(name: string) {
  highlightRegistry()?.delete(name);
}

export function persistentSelectionRectsForRange(root: HTMLElement, range: Range): PersistentSelectionRect[] {
  const rootRect = root.getBoundingClientRect();
  return Array.from(range.getClientRects())
    .map((rect) => ({
      left: rect.left - rootRect.left,
      top: rect.top - rootRect.top,
      width: rect.width,
      height: rect.height,
    }))
    .filter((rect) => rect.width > 1 && rect.height > 1);
}

function highlightRegistry() {
  return (CSS as typeof CSS & { highlights?: CssHighlightRegistry }).highlights ?? null;
}

function highlightConstructor() {
  return (globalThis as typeof globalThis & { Highlight?: CssHighlightConstructor }).Highlight ?? null;
}

function ensurePersistentSelectionHighlightStyle(name: string, color: string) {
  const styleId = `ai-persistent-selection-highlight-${name}`;
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    ::highlight(${name}) {
      background-color: ${color};
      color: inherit;
    }
  `;
  document.head.append(style);
}
