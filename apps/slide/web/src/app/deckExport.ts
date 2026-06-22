import { exportPptxFromIframes } from "@tutti-os/office-export";
import { deckSlideDisplayName, pptxMimeType, type DeckManifest, type DeckManifestSlide, type SlideArtifact } from "@ai-slide/shared";
import { writeProjectExport } from "../api/projects";
import { projectAssetUrl } from "./deckEditorDom";
import { printHtmlToPdfWithTutti } from "./tuttiPdfBridge";

const hiddenFrameTimeoutMs = 15_000;
const pdfMimeType = "application/pdf";
const slidePdfPageSize = {
  width: 13.333333,
  height: 7.5,
} as const;
const cssPixelsPerInch = 96;

export async function saveDeckPptxExport(input: {
  artifact: SlideArtifact;
  manifest: DeckManifest;
  projectId: string;
  title: string;
}) {
  const frames = await createExportFrames({
    artifact: input.artifact,
    manifest: input.manifest,
    projectId: input.projectId,
  });
  try {
    const result = await exportPptxFromIframes(frames, {
      assetBaseUrl: import.meta.env.DEV ? "/office-export-dev/ooxml-export/" : "/office-export/ooxml-export/",
      height: input.manifest.canvas.height,
      title: input.title || "Untitled Presentation",
      width: input.manifest.canvas.width,
    });
    return writeProjectExport(input.projectId, {
      fileName: `${safeExportFileName(input.title || "slides")}.pptx`,
      mimeType: pptxMimeType,
      content: result.bytes,
    });
  } finally {
    for (const frame of frames) frame.remove();
  }
}

export async function saveDeckPdfExport(input: {
  artifact: SlideArtifact;
  manifest: DeckManifest;
  projectId: string;
  title: string;
}) {
  const bytes = await printHtmlToPdfWithTutti({
    baseUrl: `${window.location.origin}/`,
    html: deckPdfPrintHtml(input),
    margin: {
      top: "0px",
      right: "0px",
      bottom: "0px",
      left: "0px",
    },
    pageSize: slidePdfPageSize,
    preferCSSPageSize: true,
    printBackground: true,
    title: input.title || "Untitled Presentation",
  });
  return writeProjectExport(input.projectId, {
    fileName: `${safeExportFileName(input.title || "slides")}.pdf`,
    mimeType: pdfMimeType,
    content: bytes,
  });
}

async function createExportFrames(input: { artifact: SlideArtifact; manifest: DeckManifest; projectId: string }) {
  const frames: HTMLIFrameElement[] = [];
  try {
    for (const slide of input.manifest.slides) {
      frames.push(await createExportFrame({
        artifact: input.artifact,
        canvas: input.manifest.canvas,
        projectId: input.projectId,
        slide,
      }));
    }
    return frames;
  } catch (error) {
    for (const frame of frames) frame.remove();
    throw error;
  }
}

async function createExportFrame(input: {
  artifact: SlideArtifact;
  canvas: DeckManifest["canvas"];
  projectId: string;
  slide: DeckManifestSlide;
}) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = `${input.canvas.width}px`;
  frame.style.height = `${input.canvas.height}px`;
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.tabIndex = -1;
  frame.title = `${deckSlideDisplayName(input.slide)} export`;
  const loaded = waitForFrameLoad(frame);
  frame.src = projectAssetUrl(input.projectId, input.artifact.fileRef, input.slide.file, input.artifact.revision);
  document.body.append(frame);
  await loaded;
  return frame;
}

function waitForFrameLoad(frame: HTMLIFrameElement) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out loading slide export frame"));
    }, hiddenFrameTimeoutMs);
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
      reject(new Error("Unable to load slide export frame"));
    };
    frame.addEventListener("load", handleLoad);
    frame.addEventListener("error", handleError);
  });
}

function deckPdfPrintHtml(input: {
  artifact: SlideArtifact;
  manifest: DeckManifest;
  projectId: string;
  title: string;
}) {
  const pageWidthPx = slidePdfPageSize.width * cssPixelsPerInch;
  const pageHeightPx = slidePdfPageSize.height * cssPixelsPerInch;
  const slideScale = Math.min(pageWidthPx / input.manifest.canvas.width, pageHeightPx / input.manifest.canvas.height);
  const pages = input.manifest.slides
    .map((slide, index) => {
      const src = projectAssetUrl(input.projectId, input.artifact.fileRef, slide.file, input.artifact.revision);
      return `<section class="ai-slide-pdf-page" aria-label="${escapeHtml(deckSlideDisplayName(slide, index))}"><iframe src="${escapeHtml(src)}"></iframe></section>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.title || "Untitled Presentation")}</title>
  <style>
    @page {
      size: ${slidePdfPageSize.width}in ${slidePdfPageSize.height}in;
      margin: 0;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #fff;
    }

    .ai-slide-pdf-page {
      width: ${slidePdfPageSize.width}in;
      height: ${slidePdfPageSize.height}in;
      margin: 0;
      padding: 0;
      break-after: page;
      page-break-after: always;
      overflow: hidden;
      background: #fff;
    }

    .ai-slide-pdf-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    .ai-slide-pdf-page iframe {
      display: block;
      width: ${input.manifest.canvas.width}px;
      height: ${input.manifest.canvas.height}px;
      border: 0;
      margin: 0;
      padding: 0;
      background: #fff;
      transform: scale(${slideScale});
      transform-origin: 0 0;
    }
  </style>
</head>
<body>
${pages}
</body>
</html>`;
}

function safeExportFileName(value: string) {
  return value.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "slides";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
