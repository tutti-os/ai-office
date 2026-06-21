import { writeProjectExport } from "../api/projects";
import { defaultPdfMargin, safeExportFileName } from "./htmlExport";
import { printHtmlToPdfWithTutti } from "./tuttiPdfBridge";

const pdfMimeType = "application/pdf";

export async function saveDocxArtifactPdfExport(input: { previewElement: HTMLElement; projectId: string; title: string }) {
  const html = docxPreviewPrintHtml({
    bodyHtml: input.previewElement.innerHTML,
    styles: collectDocumentStyles(input.previewElement.ownerDocument),
    title: input.title || "Untitled Word Doc",
  });
  const bytes = await printHtmlToPdfWithTutti({
    baseUrl: `${window.location.origin}/`,
    html,
    margin: defaultPdfMargin,
    pageSize: "A4",
    printBackground: true,
    title: input.title || "Untitled Word Doc",
  });
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "doc")}.pdf`,
    mimeType: pdfMimeType,
    content: bytes,
  });
}

function docxPreviewPrintHtml(input: { bodyHtml: string; styles: string; title: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.title)}</title>
  ${input.styles}
  <style>
    body { margin: 0; background: #fff; }
    .ai-docx-print-root { background: #fff; color: #202124; }
  </style>
</head>
<body>
  <main class="ai-docx-preview ai-docx-print-root">${input.bodyHtml}</main>
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

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
