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
  top: "12mm",
  right: "12mm",
  bottom: "14mm",
  left: "12mm",
} as const;
