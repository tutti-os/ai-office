import { writeProjectExport } from "../api/projects";
import { printHtmlToPdfWithTutti } from "./tuttiPdfBridge";

const htmlMimeType = "text/html";
const pdfMimeType = "application/pdf";

export async function saveHtmlArtifactExport(input: { projectId: string; title: string; html: string }) {
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "doc")}.html`,
    mimeType: htmlMimeType,
    content: input.html,
  });
}

export async function saveHtmlArtifactPdfExport(input: { html: string; projectId: string; title: string }) {
  const html = await prepareHtmlForPdfExport(input.html, input.title || "Untitled Doc");
  const bytes = await printHtmlToPdfWithTutti({
    baseUrl: `${window.location.origin}/`,
    html,
    margin: defaultPdfMargin,
    pageSize: "A4",
    printBackground: true,
    title: input.title || "Untitled Doc",
  });
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "doc")}.pdf`,
    mimeType: pdfMimeType,
    content: bytes,
  });
}

const pdfPreparationTimeoutMs = 15_000;

async function prepareHtmlForPdfExport(html: string, title: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "1024px";
  frame.style.height = "1448px";
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
    appendPdfPrintGuards(doc);
    return `${detectDoctype(html)}\n${doc.documentElement.outerHTML}`;
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

function appendPdfPrintGuards(doc: Document) {
  doc.querySelector("style[data-ai-doc-pdf-export]")?.remove();
  const style = doc.createElement("style");
  style.setAttribute("data-ai-doc-pdf-export", "");
  style.textContent = pdfPrintGuardCss;
  doc.head.append(style);
}

function withPdfPrintGuards(html: string) {
  const parsed = new DOMParser().parseFromString(html || "<!DOCTYPE html><html><head></head><body></body></html>", "text/html");
  appendPdfPrintGuards(parsed);
  return `${detectDoctype(html)}\n${parsed.documentElement.outerHTML}`;
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
}
`;

export function safeExportFileName(value: string) {
  return value
    .trim()
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

function printToPdfMarginInches(millimeters: number) {
  // Tutti's current PDF bridge accepts CSS-like units but forwards the parsed
  // number to Electron printToPDF, whose margin values are inches.
  return `${(millimeters / 25.4).toFixed(4)}px`;
}
