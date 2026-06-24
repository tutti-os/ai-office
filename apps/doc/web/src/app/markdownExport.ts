import { writeProjectExport } from "../api/projects";
import { renderHtmlProjectAssetReferences } from "../artifact/runtime/projectAssets";
import { renderMarkdownPreview } from "../artifact/markdownPreview";
import { defaultPdfMargin, safeExportFileName } from "./htmlExport";
import { printHtmlToPdfWithTutti } from "./tuttiPdfBridge";

const markdownMimeType = "text/markdown";
const pdfMimeType = "application/pdf";

export async function saveMarkdownArtifactExport(input: { projectId: string; title: string; markdown: string }) {
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "doc")}.md`,
    mimeType: markdownMimeType,
    content: input.markdown,
  });
}

export async function saveMarkdownArtifactPdfExport(input: { projectId: string; title: string; markdown: string }) {
  const html = renderHtmlProjectAssetReferences(markdownPrintHtml(input), input.projectId);
  const bytes = await printHtmlToPdfWithTutti({
    baseUrl: `${window.location.origin}/`,
    html,
    margin: defaultPdfMargin,
    pageSize: "A4",
    printBackground: true,
    title: input.title || "Untitled Markdown",
  });
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "doc")}.pdf`,
    mimeType: pdfMimeType,
    content: bytes,
  });
}

function markdownPrintHtml(input: { title: string; markdown: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.title || "Untitled Markdown")}</title>
  <style>
    :root { color: #1f2933; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: 32px; background: #fff; font-size: 14px; line-height: 1.62; }
    main { max-width: 760px; margin: 0 auto; }
    h1, h2, h3, h4, h5, h6 { color: #111827; line-height: 1.22; margin: 1.35em 0 0.55em; }
    h1 { font-size: 30px; }
    h2 { font-size: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25em; }
    h3 { font-size: 19px; }
    p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
    blockquote { border-left: 4px solid #cbd5e1; color: #475569; padding-left: 14px; }
    code { background: #f3f4f6; border-radius: 4px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.92em; padding: 0.12em 0.28em; }
    pre { background: #111827; border-radius: 8px; color: #f9fafb; overflow-wrap: anywhere; padding: 14px; white-space: pre-wrap; }
    pre code { background: transparent; color: inherit; padding: 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 7px 9px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; font-weight: 700; }
    img { height: auto; max-width: 100%; }
  </style>
</head>
<body>
  <main>${renderMarkdownPreview(input.markdown)}</main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
