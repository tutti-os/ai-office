import { writeProjectExport } from "../api/projects";
import { printHtmlToPdfWithTutti, type TuttiPdfPageSize, type TuttiPdfPrintMargins } from "./tuttiPdfBridge";

const htmlMimeType = "text/html";
const pdfMimeType = "application/pdf";

export async function saveHtmlArtifactExport(input: {
  projectId: string;
  title: string;
  html: string;
  targetDirectory?: string | null;
}) {
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "doc")}.html`,
    mimeType: htmlMimeType,
    content: input.html,
    targetDirectory: input.targetDirectory,
  });
}

export async function saveHtmlArtifactPdfExport(input: {
  html: string;
  projectId: string;
  title: string;
  targetDirectory?: string | null;
}) {
  const prepared = await prepareHtmlForPdfExport(input.html, input.title || "Untitled Doc");
  const bytes = await printHtmlToPdfWithTutti({
    baseUrl: `${window.location.origin}/`,
    html: prepared.html,
    margin: prepared.margin,
    pageSize: prepared.pageSize,
    preferCSSPageSize: prepared.preferCSSPageSize,
    printBackground: true,
    title: input.title || "Untitled Doc",
  });
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "doc")}.pdf`,
    mimeType: pdfMimeType,
    content: bytes,
    targetDirectory: input.targetDirectory,
  });
}

const pdfPreparationTimeoutMs = 15_000;
const pdfPreparationViewport = {
  height: 1448,
  width: 1024,
} as const;
const maxVisualPdfPageHeightPx = 2400;
const minVisualPdfPageHeightPx = 480;
const maxVisualPdfPageRatio = 2.4;
const minVisualPdfPageRatio = 0.45;
const visualPdfPageHeightSlackPx = 8;

type HtmlPdfPreparation = {
  html: string;
  margin: TuttiPdfPrintMargins;
  pageSize: TuttiPdfPageSize;
  preferCSSPageSize?: boolean;
};

type VisualPdfLayout = {
  heightPx: number;
  widthPx: number;
};

async function prepareHtmlForPdfExport(html: string, title: string): Promise<HtmlPdfPreparation> {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = `${pdfPreparationViewport.width}px`;
  frame.style.height = `${pdfPreparationViewport.height}px`;
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.tabIndex = -1;
  frame.title = `${title} PDF export`;

  const loaded = waitForFrameLoad(frame);
  frame.srcdoc = html;
  document.body.append(frame);

  try {
    await loaded;
    await waitForFrameStable(frame);
    const doc = frame.contentDocument;
    if (!doc?.documentElement) return withPdfPrintGuards(html);
    cleanupPdfDocument(doc, title);
    inlineTransparentTextFallbacks(doc);
    disableBlockingRemoteFontStyles(doc);
    scopeResponsiveMediaQueriesToScreen(doc);
    const visualLayout = detectVisualPdfLayout(doc);
    if (visualLayout) {
      markPdfRasterLayer(doc);
    }
    appendPdfPrintGuards(doc, visualLayout);
    return {
      html: `${detectDoctype(html)}\n${doc.documentElement.outerHTML}`,
      margin: visualLayout ? zeroPdfMargin : defaultPdfMargin,
      pageSize: visualLayout ? visualPdfPageSize(visualLayout) : "A4",
      preferCSSPageSize: Boolean(visualLayout),
    };
  } catch {
    return withPdfPrintGuards(html);
  } finally {
    frame.remove();
  }
}

function waitForFrameLoad(frame: HTMLIFrameElement) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out preparing HTML for PDF export"));
    }, pdfPreparationTimeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      frame.removeEventListener("load", handleLoad);
      frame.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Unable to prepare HTML for PDF export"));
    };
    frame.addEventListener("load", handleLoad);
    frame.addEventListener("error", handleError);
  });
}

async function waitForFrameStable(frame: HTMLIFrameElement) {
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) return;
  await Promise.race([
    (async () => {
      await doc.fonts?.ready.catch(() => undefined);
      await Promise.all(Array.from(doc.images).map((image) => waitForImageReady(image)));
      await new Promise<void>((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
    })(),
    new Promise<void>((resolve) => window.setTimeout(resolve, pdfPreparationTimeoutMs)),
  ]);
}

function waitForImageReady(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      image.removeEventListener("load", handleDone);
      image.removeEventListener("error", handleDone);
    };
    const handleDone = () => {
      cleanup();
      resolve();
    };
    image.addEventListener("load", handleDone, { once: true });
    image.addEventListener("error", handleDone, { once: true });
  });
}

function cleanupPdfDocument(doc: Document, title: string) {
  doc.title = title;
  doc.querySelectorAll("[contenteditable], [spellcheck], [tabindex]").forEach((element) => {
    element.removeAttribute("contenteditable");
    element.removeAttribute("spellcheck");
    element.removeAttribute("tabindex");
  });
}

function markPdfRasterLayer(doc: Document) {
  // Marking <body> itself (instead of wrapping its children in a new div) forces the same
  // compositing-layer promotion without disturbing the document's own top-level layout, which
  // matters because AI Doc bodies are arbitrary AI-generated HTML and commonly use
  // display:flex/grid directly on <body> with multiple meaningful top-level children.
  doc.body.classList.add("ai-doc-pdf-raster-layer");
}

function detectVisualPdfLayout(doc: Document): VisualPdfLayout | null {
  const win = doc.defaultView;
  const body = doc.body;
  if (!win || !body) return null;
  const bounds = contentBounds(doc);
  if (!bounds) return null;

  const heightPx = Math.ceil(Math.max(bounds.bottom, boundedBodyHeight(body))) + visualPdfPageHeightSlackPx;
  const widthPx = Math.ceil(Math.max(pdfPreparationViewport.width, bounds.right));
  if (!isVisualPdfLayoutCandidate(doc, bounds, { heightPx, widthPx })) return null;
  return { heightPx, widthPx };
}

function contentBounds(doc: Document) {
  const win = doc.defaultView;
  if (!win || !doc.body) return null;
  const rects = Array.from(doc.body.querySelectorAll<HTMLElement>("body *"))
    .filter((element) => {
      if (element.closest("[data-ai-doc-pdf-export]")) return false;
      const style = win.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity || "1") === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    })
    .map((element) => element.getBoundingClientRect());
  if (!rects.length) return null;
  return rects.reduce(
    (bounds, rect) => ({
      bottom: Math.max(bounds.bottom, rect.bottom),
      left: Math.min(bounds.left, rect.left),
      right: Math.max(bounds.right, rect.right),
      top: Math.min(bounds.top, rect.top),
    }),
    {
      bottom: Number.NEGATIVE_INFINITY,
      left: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
    },
  );
}

function boundedBodyHeight(body: HTMLElement) {
  const rect = body.getBoundingClientRect();
  if (!Number.isFinite(rect.height) || rect.height <= 0) return 0;
  return rect.height <= pdfPreparationViewport.height ? rect.bottom : rect.height;
}

function isVisualPdfLayoutCandidate(
  doc: Document,
  bounds: { bottom: number; left: number; right: number; top: number },
  layout: VisualPdfLayout,
) {
  const body = doc.body;
  const win = doc.defaultView;
  if (!body || !win) return false;
  const ratio = layout.heightPx / layout.widthPx;
  if (layout.heightPx < minVisualPdfPageHeightPx || layout.heightPx > maxVisualPdfPageHeightPx) return false;
  if (ratio < minVisualPdfPageRatio || ratio > maxVisualPdfPageRatio) return false;

  const bodyStyle = win.getComputedStyle(body);
  const majorBlocks = Array.from(body.children).filter((child): child is HTMLElement => {
    if (!(child instanceof HTMLElement)) return false;
    const rect = child.getBoundingClientRect();
    return rect.width >= layout.widthPx * 0.45 && rect.height >= layout.heightPx * 0.2;
  });
  const largestMajorBlock = majorBlocks
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0];

  const hasCanvasBody =
    ["flex", "grid"].includes(bodyStyle.display) ||
    hasVisualBackground(bodyStyle) ||
    /hidden|clip/i.test(bodyStyle.overflow + bodyStyle.overflowX + bodyStyle.overflowY);
  const hasCanvasChild = largestMajorBlock
    ? hasVisualBackground(win.getComputedStyle(largestMajorBlock.element)) || hasRoundedOrFramedBlock(win.getComputedStyle(largestMajorBlock.element))
    : false;
  const hasExplicitPageSizing = hasExplicitPageSizingSignal(doc);

  return hasCanvasBody || hasCanvasChild || (hasExplicitPageSizing && bounds.bottom <= maxVisualPdfPageHeightPx);
}

function hasExplicitPageSizingSignal(doc: Document) {
  const bodyClass = doc.body?.className || "";
  const bodyStyle = doc.body?.getAttribute("style") ?? "";
  const cssText = Array.from(doc.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
  return (
    /(?:^|\s)(?:page|sheet|poster|flyer|canvas|resume|certificate)(?:\s|$)/i.test(bodyClass) ||
    /\baspect-ratio\s*:/i.test(bodyStyle + "\n" + cssText) ||
    /@page\b/i.test(cssText)
  );
}

function hasVisualBackground(style: CSSStyleDeclaration) {
  return style.backgroundImage !== "none" || !isWhiteOrTransparentColor(style.backgroundColor);
}

function hasRoundedOrFramedBlock(style: CSSStyleDeclaration) {
  return (
    Number.parseFloat(style.borderTopLeftRadius || "0") > 0 ||
    Number.parseFloat(style.borderTopRightRadius || "0") > 0 ||
    Number.parseFloat(style.borderBottomLeftRadius || "0") > 0 ||
    Number.parseFloat(style.borderBottomRightRadius || "0") > 0 ||
    style.boxShadow !== "none" ||
    style.borderTopStyle !== "none" ||
    style.borderRightStyle !== "none" ||
    style.borderBottomStyle !== "none" ||
    style.borderLeftStyle !== "none"
  );
}

function isWhiteOrTransparentColor(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "transparent") return true;
  const rgba = normalized.match(/^rgba?\(([^)]+)\)$/);
  if (!rgba) return false;
  const parts = rgba[1].split(",").map((part) => part.trim());
  if (parts.length >= 4 && Number.parseFloat(parts[3]) === 0) return true;
  return parts.slice(0, 3).every((part) => Number.parseFloat(part) >= 250);
}

function visualPdfPageSize(layout: VisualPdfLayout) {
  return {
    height: pxToInches(layout.heightPx),
    width: pxToInches(layout.widthPx),
  };
}

function inlineTransparentTextFallbacks(doc: Document) {
  const win = doc.defaultView;
  if (!win) return;
  doc.querySelectorAll<HTMLElement>("body *").forEach((element) => {
    if (!element.textContent?.trim()) return;
    const style = win.getComputedStyle(element);
    const textFill = style.getPropertyValue("-webkit-text-fill-color");
    if (!isTransparentColor(style.color) && !isTransparentColor(textFill)) return;
    const fallback = nearestVisibleTextColor(element, win) ?? "#111827";
    element.style.setProperty("color", fallback, "important");
    element.style.setProperty("-webkit-text-fill-color", fallback, "important");
    element.style.setProperty("-webkit-background-clip", "border-box", "important");
    element.style.setProperty("background-clip", "border-box", "important");
  });
}

function nearestVisibleTextColor(element: HTMLElement, win: Window) {
  let current = element.parentElement;
  while (current) {
    const style = win.getComputedStyle(current);
    const textFill = style.getPropertyValue("-webkit-text-fill-color");
    if (!isTransparentColor(style.color) && !isTransparentColor(textFill)) return textFill || style.color;
    current = current.parentElement;
  }
  return null;
}

function isTransparentColor(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "transparent") return true;
  const rgba = normalized.match(/^rgba?\(([^)]+)\)$/);
  if (!rgba) return false;
  const parts = rgba[1].split(",").map((part) => part.trim());
  return parts.length >= 4 && Number.parseFloat(parts[3]) === 0;
}

function disableBlockingRemoteFontStyles(doc: Document) {
  doc.querySelectorAll<HTMLLinkElement>("link[href]").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    if (!/fonts\.(googleapis|gstatic)\.com/i.test(href)) return;
    link.remove();
  });
  doc.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
    const css = style.textContent ?? "";
    const nextCss = css.replace(/@import\s+url\((["']?)https?:\/\/fonts\.googleapis\.com\/[^)]*\1\)\s*;?/gi, "");
    if (nextCss !== css) style.textContent = nextCss;
  });
}

function scopeResponsiveMediaQueriesToScreen(doc: Document) {
  const win = doc.defaultView;
  if (!win) return;
  doc.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
    const sheet = style.sheet;
    if (!sheet) return;
    try {
      const nextCss = Array.from(sheet.cssRules).map((rule) => serializePdfCssRule(rule)).join("\n");
      if (nextCss.trim()) style.textContent = nextCss;
    } catch {
      // Keep the original CSS if the browser refuses to expose one stylesheet.
    }
  });
}

function serializePdfCssRule(rule: CSSRule): string {
  if (isCssMediaRule(rule) && shouldScopeMediaQueryToScreen(rule.media.mediaText)) {
    const body = Array.from(rule.cssRules).map((childRule) => serializePdfCssRule(childRule)).join("\n");
    return `@media ${screenOnlyMediaText(rule.media.mediaText)} {\n${body}\n}`;
  }
  return rule.cssText;
}

function isCssMediaRule(rule: CSSRule): rule is CSSMediaRule {
  return "media" in rule && "cssRules" in rule && typeof (rule as CSSMediaRule).media.mediaText === "string";
}

function shouldScopeMediaQueryToScreen(mediaText: string) {
  const normalized = mediaText.toLowerCase();
  if (/\b(print|screen)\b/.test(normalized)) return false;
  return /\b(min|max)-(width|height)\b|\borientation\b|\b(hover|pointer)\s*:/.test(normalized);
}

function screenOnlyMediaText(mediaText: string) {
  return mediaText
    .split(",")
    .map((query) => {
      const trimmed = query.trim();
      if (!trimmed) return trimmed;
      return trimmed.replace(/^all\s+and\s+/i, "screen and ").replace(/^all$/i, "screen").replace(/^(?!screen\b)/i, "screen and ");
    })
    .filter(Boolean)
    .join(", ");
}

function appendPdfPrintGuards(doc: Document, visualLayout?: VisualPdfLayout | null) {
  doc.querySelector("style[data-ai-doc-pdf-export]")?.remove();
  const style = doc.createElement("style");
  style.setAttribute("data-ai-doc-pdf-export", "");
  style.textContent = `${visualLayout ? visualPdfPageCss(visualLayout) : ""}${pdfPrintGuardCss}`;
  doc.head.append(style);
}

function withPdfPrintGuards(html: string): HtmlPdfPreparation {
  const parsed = new DOMParser().parseFromString(html || "<!DOCTYPE html><html><head></head><body></body></html>", "text/html");
  scopeResponsiveMediaQueriesToScreen(parsed);
  appendPdfPrintGuards(parsed);
  return {
    html: `${detectDoctype(html)}\n${parsed.documentElement.outerHTML}`,
    margin: defaultPdfMargin,
    pageSize: "A4",
  };
}

function detectDoctype(html: string) {
  return html.match(/<!doctype\s+html[^>]*>/i)?.[0] ?? "<!DOCTYPE html>";
}

const pdfPrintGuardCss = `
@media print {
  html,
  body,
  *,
  *::before,
  *::after {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  [contenteditable="true"] {
    caret-color: transparent !important;
  }

  body.ai-doc-pdf-raster-layer {
    filter: opacity(0.999999) !important;
    transform: translateZ(0) !important;
    transform-origin: 0 0 !important;
  }
}
`;

function visualPdfPageCss(layout: VisualPdfLayout) {
  return `
@page {
  size: ${pxToInches(layout.widthPx)}in ${pxToInches(layout.heightPx)}in;
  margin: 0;
}

@media print {
  html {
    height: auto !important;
    width: ${layout.widthPx}px !important;
    min-width: ${layout.widthPx}px !important;
    min-height: 0 !important;
  }

  body {
    height: auto !important;
    min-width: ${layout.widthPx}px !important;
    min-height: 0 !important;
  }
}
`;
}

export function safeExportFileName(value: string) {
  // Drop source/export suffixes so titles like `note.html` export as `note.pdf`.
  const withoutDocSuffix = value
    .trim()
    .replace(/(?:\.(?:html?|md|markdown|docx|pdf))+$/i, "");
  return withoutDocSuffix
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80) || "doc";
}

export const defaultPdfMargin = {
  top: printToPdfMarginInches(12),
  right: printToPdfMarginInches(12),
  bottom: printToPdfMarginInches(14),
  left: printToPdfMarginInches(12),
} as const;

const zeroPdfMargin = {
  top: "0px",
  right: "0px",
  bottom: "0px",
  left: "0px",
} as const;

function printToPdfMarginInches(millimeters: number) {
  // Tutti's current PDF bridge accepts CSS-like units but forwards the parsed
  // number to Electron printToPDF, whose margin values are inches.
  return `${(millimeters / 25.4).toFixed(4)}px`;
}

function pxToInches(px: number) {
  return Number((px / 96).toFixed(4));
}
