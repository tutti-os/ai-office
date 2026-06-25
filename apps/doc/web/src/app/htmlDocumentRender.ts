import { renderHtmlProjectFragmentAssetReferences } from "../artifact/runtime/projectAssets";
import type { RuntimeDocument } from "../artifact/runtime/types";

export const htmlDocumentBodyClassName = "ai-html-document-body";
const htmlDocumentBodySelector = `.ai-html-tiptap-editor .${htmlDocumentBodyClassName}`;

export function scopedHtmlDocumentStyles(document: RuntimeDocument, projectId: string | null) {
  const headHTML = renderHtmlProjectFragmentAssetReferences(document.headHTML, projectId, "head");
  const parsed = new DOMParser().parseFromString(`<head>${headHTML}</head>`, "text/html");
  const bodyStyle = document.bodyAttributes.style?.trim();
  const bodyRule = bodyStyle ? `${htmlDocumentBodySelector} { ${bodyStyle} }` : "";
  const styleRules = Array.from(parsed.querySelectorAll("style"))
    .map((styleElement) => scopeCssText(styleElement.textContent ?? ""))
    .filter(Boolean);
  return [bodyRule, ...styleRules].filter(Boolean).join("\n\n");
}

export function iframeHtmlDocumentShell(document: RuntimeDocument, projectId: string | null) {
  const headHTML = renderHtmlProjectFragmentAssetReferences(document.headHTML, projectId, "head");
  return `${document.doctype || "<!DOCTYPE html>"}
<html${serializeAttributes(document.htmlAttributes)}>
<head>
${headHTML}
<style data-ai-html-editor-shell>
html, body { margin: 0; min-height: 100%; }
#ai-html-tiptap-root { position: relative; }
.ai-html-tiptap-editor { min-height: 860px; outline: none; }
.ai-html-tiptap-editor .ProseMirror { outline: none; }
	.ai-html-tiptap-editor .ProseMirror-selectednode { outline: 2px solid #2563eb; }
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-node-view {
	  line-height: 0;
	  max-width: 100%;
	  position: relative;
	  vertical-align: top;
	}
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-node-view > img {
	  display: block;
	  height: auto;
	  max-width: 100%;
	}
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-node-view.ProseMirror-selectednode {
	  outline: none;
	}
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-node-view.is-selected {
	  outline: none;
	}
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-node-view.is-selected > img {
	  outline: 2px solid #2563eb;
	  outline-offset: 2px;
	}
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-replace-button {
	  appearance: none;
	  background: #ffffff;
	  border: 1px solid rgba(42, 38, 32, 0.16);
	  border-radius: 10px;
	  box-shadow: 0 6px 18px rgba(42, 38, 32, 0.14);
	  color: #2a2620;
	  cursor: pointer;
	  display: grid;
	  height: 36px;
	  padding: 0;
	  place-items: center;
	  position: absolute;
	  right: 8px;
	  top: 8px;
	  width: 36px;
	  z-index: 4;
	}
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-replace-button:hover {
	  background: #f6f8fa;
	}
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-resize-handle {
	  appearance: none;
	  background: #ffffff;
	  border: 2px solid #2563eb;
	  border-radius: 999px;
	  bottom: -7px;
	  box-shadow: 0 1px 4px rgba(42, 38, 32, 0.16);
	  cursor: nwse-resize;
	  height: 12px;
	  padding: 0;
	  position: absolute;
	  right: -7px;
	  width: 12px;
	  z-index: 5;
	}
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-node-view:not(.is-selected) .ai-html-image-replace-button,
	.ai-html-tiptap-editor .ProseMirror .ai-html-image-node-view:not(.is-selected) .ai-html-image-resize-handle {
	  display: none;
	}
	.ai-html-tiptap-editor .ProseMirror .tableWrapper {
	  margin: 0.75em 0;
	  max-width: 100%;
	  overflow-x: auto;
	}
	.ai-html-tiptap-editor .ProseMirror table {
	  background: #fff;
	  border-collapse: collapse;
	  border-spacing: 0;
	  margin: 0.75em 0;
	  max-width: 100%;
	  table-layout: auto;
	  width: auto;
	}
	.ai-html-tiptap-editor .ProseMirror th,
	.ai-html-tiptap-editor .ProseMirror td {
	  border: 1px solid #d6d9de;
	  box-sizing: border-box;
	  min-width: 56px;
	  padding: 0.34em 0.55em;
	  position: relative;
	  vertical-align: top;
	}
	.ai-html-tiptap-editor .ProseMirror th {
	  background: #f6f8fa;
	  color: inherit;
	  font-weight: 700;
	}
	.ai-html-tiptap-editor .ProseMirror th > *,
	.ai-html-tiptap-editor .ProseMirror td > * {
	  margin-bottom: 0;
	}
	.ai-html-tiptap-editor .ProseMirror .selectedCell::after {
	  background: rgba(37, 99, 235, 0.12);
	  content: "";
	  inset: 0;
	  pointer-events: none;
	  position: absolute;
	  z-index: 2;
	}
	.ai-html-tiptap-editor .ProseMirror .column-resize-handle {
	  background-color: #4f7cff;
	  bottom: -2px;
	  pointer-events: none;
	  position: absolute;
	  right: -2px;
	  top: 0;
	  width: 3px;
	}
	.ai-html-tiptap-editor .ProseMirror.resize-cursor {
	  cursor: col-resize;
	}
	.ai-html-table-handle-layer {
	  inset: 0;
	  pointer-events: none;
	  position: fixed;
	  z-index: 30;
	}
	.ai-html-table-hover-outline {
	  border: 2px solid rgba(37, 99, 235, 0.62);
	  border-radius: 4px;
	  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.72);
	  box-sizing: border-box;
	  pointer-events: none;
	  position: absolute;
	}
	.ai-html-table-handle {
	  align-items: center;
	  background: #ffffff;
	  border: 1px solid rgba(42, 38, 32, 0.16);
	  border-radius: 10px;
	  box-shadow: 0 10px 24px rgba(42, 38, 32, 0.18);
	  display: inline-flex;
	  gap: 2px;
	  overflow: hidden;
	  pointer-events: auto;
	  position: absolute;
	}
	.ai-html-table-handle button {
	  align-items: center;
	  appearance: none;
	  background: transparent;
	  border: 0;
	  color: #2a2620;
	  cursor: pointer;
	  display: inline-grid;
	  height: 30px;
	  justify-content: center;
	  padding: 0;
	  place-items: center;
	  width: 30px;
	}
	.ai-html-table-handle button:hover {
	  background: #f6f8fa;
	}
	.ai-html-table-grip-button {
	  cursor: grab;
	  color: rgba(42, 38, 32, 0.62);
	}
	.ai-html-table-delete-button {
	  color: #b42318;
	}
	.ai-html-table-delete-button:hover {
	  background: #fff1f0 !important;
	  color: #912018;
	}
	.ai-html-tiptap-editor .ProseMirror ul[data-type="taskList"],
.ai-html-tiptap-editor .ProseMirror ul:has(> li[data-checked]) {
  list-style: none !important;
  padding-left: 0;
}
.ai-html-tiptap-editor .ProseMirror li[data-type="taskItem"],
.ai-html-tiptap-editor .ProseMirror li[data-checked] {
  align-items: flex-start;
  display: flex !important;
  gap: 0.65em;
  list-style: none !important;
}
.ai-html-tiptap-editor .ProseMirror li[data-type="taskItem"]::marker,
.ai-html-tiptap-editor .ProseMirror li[data-checked]::marker {
  content: "" !important;
}
.ai-html-tiptap-editor .ProseMirror li[data-type="taskItem"] > label,
.ai-html-tiptap-editor .ProseMirror li[data-checked] > label {
  display: inline-flex;
  flex: 0 0 auto;
  line-height: inherit;
  margin: 0;
  padding-top: 0.2em;
}
.ai-html-tiptap-editor .ProseMirror li[data-type="taskItem"] > label input[type="checkbox"],
.ai-html-tiptap-editor .ProseMirror li[data-checked] > label input[type="checkbox"] {
  margin: 0;
}
.ai-html-tiptap-editor .ProseMirror li[data-type="taskItem"] > div,
.ai-html-tiptap-editor .ProseMirror li[data-checked] > div {
  flex: 1 1 auto;
  min-width: 0;
}
.ai-html-tiptap-editor .ProseMirror li[data-type="taskItem"] > div > p:first-child,
.ai-html-tiptap-editor .ProseMirror li[data-checked] > div > p:first-child {
  margin-top: 0;
}
</style>
<style data-ai-html-document-styles>
${scopedHtmlDocumentStyles(document, projectId)}
</style>
</head>
<body>
<div id="ai-html-tiptap-root"></div>
<script data-ai-html-table-handle>
(() => {
  const root = document.getElementById("ai-html-tiptap-root");
  if (!root) return;
  let activeTable = null;
  let layer = null;
  let outline = null;
  let handle = null;

  const gripIcon = '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
  const trashIcon = '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';

  function ensureLayer() {
    if (layer && document.body.contains(layer)) return;
    if (layer) {
      document.body.append(layer);
      return;
    }
    layer = document.createElement("div");
    layer.className = "ai-html-table-handle-layer";
    outline = document.createElement("div");
    outline.className = "ai-html-table-hover-outline";
    handle = document.createElement("div");
    handle.className = "ai-html-table-handle";

    const gripButton = document.createElement("button");
    gripButton.type = "button";
    gripButton.className = "ai-html-table-grip-button";
    gripButton.title = "Table";
    gripButton.setAttribute("aria-label", "Table");
    gripButton.innerHTML = gripIcon;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ai-html-table-delete-button";
    deleteButton.title = "Delete table";
    deleteButton.setAttribute("aria-label", "Delete table");
    deleteButton.innerHTML = trashIcon;
    deleteButton.addEventListener("mousedown", blockChromeEvent);
    deleteButton.addEventListener("click", (event) => {
      blockChromeEvent(event);
      if (!activeTable) return;
      const tableIndex = Array.from(document.querySelectorAll(".ai-html-tiptap-editor .ProseMirror table")).indexOf(activeTable);
      window.parent.postMessage({ source: "ai-doc-html-editor", type: "delete-table", tableIndex }, "*");
      hide();
    });

    handle.append(gripButton, deleteButton);
    layer.append(outline, handle);
    document.body.append(layer);
  }

  function blockChromeEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function tableFromTarget(target) {
    if (!(target instanceof Element)) return null;
    if (target.closest(".ai-html-table-handle-layer")) return activeTable;
    return target.closest(".ai-html-tiptap-editor .ProseMirror table");
  }

  function tableFromSelection() {
    const selection = document.getSelection();
    const node = selection && selection.anchorNode;
    const element = node instanceof Element ? node : node && node.parentElement;
    return element ? element.closest(".ai-html-tiptap-editor .ProseMirror table") : null;
  }

  function tableFromHoverOrSelection() {
    return document.querySelector(".ai-html-tiptap-editor .ProseMirror table:hover") ||
      tableFromSelection() ||
      document.querySelector(".ai-html-tiptap-editor .ProseMirror table");
  }

  function update(table) {
    if (!table || table.tagName !== "TABLE" || !root.contains(table)) {
      hide();
      return;
    }
    ensureLayer();
    activeTable = table;
    const tableRect = table.getBoundingClientRect();
    const left = tableRect.left;
    const top = tableRect.top;
    layer.style.display = "block";
    outline.style.left = left + "px";
    outline.style.top = top + "px";
    outline.style.width = tableRect.width + "px";
    outline.style.height = tableRect.height + "px";
    handle.style.left = Math.max(6, left + 6) + "px";
    handle.style.top = Math.max(6, top + Math.max(6, tableRect.height - 36)) + "px";
  }

  function hide() {
    activeTable = null;
    if (layer) layer.style.display = "none";
  }

  document.addEventListener("pointermove", (event) => update(tableFromTarget(event.target)));
  document.addEventListener("pointerdown", (event) => update(tableFromTarget(event.target)));
  document.addEventListener("mousemove", (event) => update(tableFromTarget(event.target)));
  document.addEventListener("mousedown", (event) => update(tableFromTarget(event.target)));
  document.addEventListener("selectionchange", () => update(tableFromSelection()));
  document.addEventListener("scroll", () => activeTable ? update(activeTable) : hide(), true);
  window.addEventListener("resize", () => activeTable ? update(activeTable) : hide());
  function updateFromAmbientTable() {
    try {
      const table = tableFromHoverOrSelection();
      update(table);
    } catch {
      hide();
    }
  }
  window.setInterval(updateFromAmbientTable, 180);
  window.requestAnimationFrame(updateFromAmbientTable);
})();
</script>
</body>
</html>`;
}

export function htmlDocumentFrameWidthPx(document: RuntimeDocument) {
  const bodyStyleWidth = frameWidthFromStyleDeclaration(document.bodyAttributes.style || "");
  if (bodyStyleWidth) return bodyStyleWidth;
  const parsed = new DOMParser().parseFromString(`<head>${document.headHTML}</head>`, "text/html");
  let width: number | null = null;
  Array.from(parsed.querySelectorAll("style")).forEach((styleElement) => {
    widthFromCssText(styleElement.textContent || "", (nextWidth) => {
      width = nextWidth;
    });
  });
  return width;
}

function scopeCssText(cssText: string) {
  const trimmed = cssText.trim();
  if (!trimmed) return "";
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(trimmed);
    return Array.from(sheet.cssRules).map(scopeCssRule).filter(Boolean).join("\n");
  } catch {
    return scopeCssTextFallback(trimmed);
  }
}

function widthFromCssText(cssText: string, onWidth: (width: number) => void) {
  const trimmed = cssText.trim();
  if (!trimmed) return;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(trimmed);
    Array.from(sheet.cssRules).forEach((rule) => collectBodyWidth(rule, onWidth));
  } catch {
    const bodyRulePattern = /(?:^|})\s*(body|html\s+body|html\s*>\s*body)\s*\{([^}]*)\}/gi;
    let match: RegExpExecArray | null;
    while ((match = bodyRulePattern.exec(trimmed))) {
      const width = frameWidthFromStyleDeclaration(match[2] || "");
      if (width) onWidth(width);
    }
  }
}

function collectBodyWidth(rule: CSSRule, onWidth: (width: number) => void) {
  if (rule instanceof CSSStyleRule) {
    const hasBodySelector = splitSelectorList(rule.selectorText).some((selector) => /^(body|html\s+body|html\s*>\s*body)$/i.test(selector.trim()));
    if (!hasBodySelector) return;
    const width = widthFromCssValue(rule.style.getPropertyValue("width")) ?? widthFromCssValue(rule.style.getPropertyValue("max-width"));
    if (width) onWidth(width);
    return;
  }
  if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
    Array.from(rule.cssRules).forEach((nestedRule) => collectBodyWidth(nestedRule, onWidth));
  }
}

function frameWidthFromStyleDeclaration(styleText: string) {
  const parsed = new DOMParser().parseFromString(`<div style="${escapeAttribute(styleText)}"></div>`, "text/html");
  if (!(parsed.body.firstElementChild instanceof HTMLElement)) return null;
  return widthFromCssValue(parsed.body.firstElementChild.style.getPropertyValue("width")) ?? widthFromCssValue(parsed.body.firstElementChild.style.getPropertyValue("max-width"));
}

function widthFromCssValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "auto" || normalized.endsWith("%") || normalized.startsWith("calc(")) return null;
  const match = normalized.match(/^(-?\d*\.?\d+)(px|in|cm|mm|pt|pc)?$/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1] || "");
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2] || "px";
  const pxByUnit: Record<string, number> = {
    px: 1,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    pt: 96 / 72,
    pc: 16,
  };
  return Math.ceil(amount * pxByUnit[unit]);
}

function scopeCssRule(rule: CSSRule): string {
  if (rule instanceof CSSStyleRule) {
    const selectorText = scopeSelectorList(rule.selectorText);
    return selectorText ? `${selectorText} { ${rule.style.cssText} }` : "";
  }
  if (rule instanceof CSSMediaRule) return scopeGroupingRule(rule, "media", rule.conditionText);
  if (rule instanceof CSSSupportsRule) return scopeGroupingRule(rule, "supports", rule.conditionText);
  return rule.cssText;
}

function scopeGroupingRule(rule: CSSGroupingRule, name: string, conditionText: string) {
  const scopedRules = Array.from(rule.cssRules).map(scopeCssRule).filter(Boolean).join("\n");
  return scopedRules ? `@${name} ${conditionText} {\n${scopedRules}\n}` : "";
}

function scopeSelectorList(selectorText: string) {
  return splitSelectorList(selectorText).map(scopeSelector).filter(Boolean).join(", ");
}

function scopeSelector(selector: string) {
  const trimmed = selector.trim();
  if (!trimmed || trimmed.includes(htmlDocumentBodySelector)) return trimmed;
  const bodyMatch = trimmed.match(/^(?:html\s+body|html\s*>\s*body|body|html|:root)\b/i);
  if (!bodyMatch) return `${htmlDocumentBodySelector} ${trimmed}`;
  const rest = trimmed.slice(bodyMatch[0].length).trimStart();
  return rest ? `${htmlDocumentBodySelector}${rest.startsWith(">") || rest.startsWith("+") || rest.startsWith("~") ? ` ${rest}` : rest}` : htmlDocumentBodySelector;
}

function splitSelectorList(selectorText: string) {
  const selectors: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < selectorText.length; index += 1) {
    const char = selectorText[index];
    if (quote) {
      if (char === quote && selectorText[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[") depth += 1;
    else if ((char === ")" || char === "]") && depth > 0) depth -= 1;
    else if (char === "," && depth === 0) {
      selectors.push(selectorText.slice(start, index));
      start = index + 1;
    }
  }
  selectors.push(selectorText.slice(start));
  return selectors;
}

function scopeCssTextFallback(cssText: string) {
  return cssText.replace(/(^|})\s*([^@{}][^{}]*)\s*\{/g, (match, prefix: string, selectorText: string) => {
    const selector = scopeSelectorList(selectorText);
    return selector ? `${prefix}\n${selector} {` : match;
  });
}

function serializeAttributes(attributes: Record<string, string>) {
  const serialized = Object.entries(attributes)
    .map(([name, value]) => (value === "" ? name : `${name}="${escapeAttribute(value)}"`))
    .join(" ");
  return serialized ? ` ${serialized}` : "";
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}
