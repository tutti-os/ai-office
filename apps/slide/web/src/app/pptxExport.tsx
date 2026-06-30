import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { PptxRenderer, type PptxRenderPresentation } from "@tutti-os/office-preview/pptx";
import { writeProjectExport } from "../api/projects";
import { printHtmlToPdfWithTutti } from "./tuttiPdfBridge";

const pdfMimeType = "application/pdf";
const cssPixelsPerInch = 96;

export async function savePptxPdfExport(input: {
  presentation: PptxRenderPresentation;
  projectId: string;
  title: string;
}) {
  const renderRoot = document.createElement("div");
  const reactRoot = createRoot(renderRoot);
  renderRoot.className = "ai-pptx-export-render-root";
  renderRoot.style.position = "fixed";
  renderRoot.style.left = "-10000px";
  renderRoot.style.top = "0";
  renderRoot.style.width = `${input.presentation.slideWidthPx}px`;
  renderRoot.style.opacity = "0";
  renderRoot.style.pointerEvents = "none";
  document.body.append(renderRoot);
  try {
    flushSync(() => {
      reactRoot.render(<PptxRenderer presentation={input.presentation} />);
    });
    await waitForRenderStable(renderRoot);
    const bytes = await printHtmlToPdfWithTutti({
      baseUrl: `${window.location.origin}/`,
      html: pptxPdfPrintHtml({
        bodyHtml: renderRoot.innerHTML,
        presentation: input.presentation,
        styles: collectDocumentStyles(document),
        title: input.title || input.presentation.title || "Untitled Presentation",
      }),
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
      pageSize: {
        width: input.presentation.slideWidthPx / cssPixelsPerInch,
        height: input.presentation.slideHeightPx / cssPixelsPerInch,
      },
      preferCSSPageSize: true,
      printBackground: true,
      title: input.title || input.presentation.title || "Untitled Presentation",
    });
    return writeProjectExport(input.projectId, {
      fileName: `${safeExportFileName(input.title || input.presentation.title || "slides")}.pdf`,
      mimeType: pdfMimeType,
      content: bytes,
    });
  } finally {
    reactRoot.unmount();
    renderRoot.remove();
  }
}

function pptxPdfPrintHtml(input: {
  bodyHtml: string;
  presentation: PptxRenderPresentation;
  styles: string;
  title: string;
}) {
  const pageWidthIn = input.presentation.slideWidthPx / cssPixelsPerInch;
  const pageHeightIn = input.presentation.slideHeightPx / cssPixelsPerInch;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.title)}</title>
  ${input.styles}
  <style>
    @page {
      size: ${pageWidthIn}in ${pageHeightIn}in;
      margin: 0;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #fff;
    }

    html,
    body,
    *,
    *::before,
    *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .ai-pptx-pdf-raster-layer {
      display: block;
      filter: opacity(0.999999);
      transform: translateZ(0);
      transform-origin: 0 0;
    }

    .ai-pptx-print-root,
    .ai-pptx-print-root .tsh-pptx-document {
      display: block;
      margin: 0;
      padding: 0;
      background: #fff;
    }

    .ai-pptx-print-root .tsh-pptx-slide {
      width: ${input.presentation.slideWidthPx}px;
      height: ${input.presentation.slideHeightPx}px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #fff;
      break-after: page;
      page-break-after: always;
      border: 0;
    }

    .ai-pptx-print-root .tsh-pptx-slide:last-child {
      break-after: auto;
      page-break-after: auto;
    }
  </style>
</head>
<body>
  <main class="ai-pptx-print-root ai-pptx-pdf-raster-layer">${input.bodyHtml}</main>
</body>
</html>`;
}

function collectDocumentStyles(doc: Document) {
  const styleSheetCss = Array.from(doc.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n");
  if (styleSheetCss.trim()) return `<style>${styleSheetCss.replace(/<\/style/gi, "<\\/style")}</style>`;
  return Array.from(doc.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel="stylesheet"]'))
    .map((node) => {
      if (node.tagName === "STYLE") return `<style>${node.textContent?.replace(/<\/style/gi, "<\\/style") ?? ""}</style>`;
      const href = (node as HTMLLinkElement).href;
      return href ? `<link rel="stylesheet" href="${escapeHtml(href)}">` : "";
    })
    .join("\n");
}

async function waitForRenderStable(root: HTMLElement) {
  await Promise.race([
    (async () => {
      await document.fonts?.ready.catch(() => undefined);
      await Promise.all(Array.from(root.querySelectorAll("img")).map((image) => waitForImageReady(image)));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    })(),
    new Promise<void>((resolve) => window.setTimeout(resolve, 15_000)),
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

function safeExportFileName(value: string) {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80) || "slides";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
