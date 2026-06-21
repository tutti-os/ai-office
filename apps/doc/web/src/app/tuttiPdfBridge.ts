export type TuttiPdfPrintHtmlInput = {
  baseUrl?: string;
  html: string;
  margin?: {
    bottom?: string;
    left?: string;
    right?: string;
    top?: string;
  };
  pageSize?: "A4" | "Letter";
  printBackground?: boolean;
  title?: string;
};

type TuttiPdfPrintHtmlResult = {
  bytes: Uint8Array | ArrayBuffer | number[];
};

type TuttiExternalPdfBridge = {
  pdf?: {
    printHtmlToPdf?: (input: TuttiPdfPrintHtmlInput) => Promise<TuttiPdfPrintHtmlResult>;
  };
};

declare global {
  interface Window {
    tuttiExternal?: TuttiExternalPdfBridge;
  }
}

export function isTuttiPdfExportAvailable() {
  return typeof window !== "undefined" && typeof window.tuttiExternal?.pdf?.printHtmlToPdf === "function";
}

export async function printHtmlToPdfWithTutti(input: TuttiPdfPrintHtmlInput) {
  const printHtmlToPdf = window.tuttiExternal?.pdf?.printHtmlToPdf;
  if (typeof printHtmlToPdf !== "function") {
    throw new Error("PDF export is available in Tutti desktop.");
  }
  const result = await printHtmlToPdf(input);
  return normalizePdfBytes(result.bytes);
}

function normalizePdfBytes(bytes: Uint8Array | ArrayBuffer | number[]) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (Array.isArray(bytes)) return new Uint8Array(bytes);
  throw new Error("PDF export returned invalid bytes.");
}
