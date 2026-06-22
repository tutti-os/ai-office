import { exportDocxFromIframe } from "@tutti-os/office-export";
import { writeProjectExport } from "../api/projects";
import { printHtmlToPdfWithTutti } from "./tuttiPdfBridge";

const htmlMimeType = "text/html";
const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdfMimeType = "application/pdf";

export async function saveHtmlArtifactExport(input: { projectId: string; title: string; html: string }) {
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "doc")}.html`,
    mimeType: htmlMimeType,
    content: input.html,
  });
}

export async function saveHtmlArtifactDocxExport(input: { iframe: HTMLIFrameElement; projectId: string; title: string }) {
  const result = await exportDocxFromIframe(input.iframe, {
    assetBaseUrl: import.meta.env.DEV ? "/office-export-dev/ooxml-export/" : "/office-export/ooxml-export/",
    title: input.title || "Untitled Doc",
  });
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "doc")}.docx`,
    mimeType: docxMimeType,
    content: result.bytes,
  });
}

export async function saveHtmlArtifactPdfExport(input: { html: string; projectId: string; title: string }) {
  const bytes = await printHtmlToPdfWithTutti({
    baseUrl: `${window.location.origin}/`,
    html: input.html,
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

export function safeExportFileName(value: string) {
  return value.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "doc";
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
