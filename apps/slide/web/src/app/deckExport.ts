import { assetPathFromRelativeUrl, rewriteAssetReferencesInElement } from "@ai-app/shared/artifact-assets";
import { deckSlideDisplayName, type DeckManifest, type DeckManifestSlide, type SlideArtifact } from "@ai-slide/shared";
import { writeProjectExport } from "../api/projects";
import { projectAssetUrl } from "./deckAssetUrls";
import { printHtmlToPdfWithTutti } from "./tuttiPdfBridge";

const hiddenFrameTimeoutMs = 15_000;
const pdfMimeType = "application/pdf";
const slidePdfPageSize = {
  width: 13.333333,
  height: 7.5,
} as const;
const cssPixelsPerInch = 96;

export async function saveDeckPdfExport(input: {
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
    const bytes = await printHtmlToPdfWithTutti({
      baseUrl: `${window.location.origin}/`,
      html: deckPdfPrintHtml({ ...input, frames }),
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
  } finally {
    for (const frame of frames) frame.remove();
  }
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
  await waitForFrameStable(frame);
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
    new Promise<void>((resolve) => window.setTimeout(resolve, hiddenFrameTimeoutMs)),
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

function deckPdfPrintHtml(input: {
  artifact: SlideArtifact;
  frames: HTMLIFrameElement[];
  manifest: DeckManifest;
  projectId: string;
  title: string;
}) {
  const pageWidthPx = slidePdfPageSize.width * cssPixelsPerInch;
  const pageHeightPx = slidePdfPageSize.height * cssPixelsPerInch;
  const slideScale = Math.min(pageWidthPx / input.manifest.canvas.width, pageHeightPx / input.manifest.canvas.height);
  const pages = input.manifest.slides
    .map((slide, index) => {
      const frame = input.frames[index];
      if (!frame?.contentDocument) throw new Error(`Unable to read slide ${index + 1} for PDF export`);
      return deckPdfPageHtml({
        artifact: input.artifact,
        frame,
        index,
        projectId: input.projectId,
        slide,
      });
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

    html,
    body,
    *,
    *::before,
    *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
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

    .ai-slide-pdf-raster-layer {
      display: block;
      filter: opacity(0.999999);
      transform: translateZ(0);
      transform-origin: 0 0;
    }

    .ai-slide-pdf-canvas {
      display: block;
      width: ${input.manifest.canvas.width}px;
      height: ${input.manifest.canvas.height}px;
      margin: 0;
      padding: 0;
      background: #fff;
      overflow: hidden;
      position: relative;
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

function deckPdfPageHtml(input: {
  artifact: SlideArtifact;
  frame: HTMLIFrameElement;
  index: number;
  projectId: string;
  slide: DeckManifestSlide;
}) {
  const sourceDocument = input.frame.contentDocument;
  if (!sourceDocument) throw new Error(`Unable to read ${deckSlideDisplayName(input.slide, input.index)} for PDF export`);
  const html = sourceDocument.documentElement.cloneNode(true) as HTMLElement;
  absolutizeDeckSlideAssetReferences(html, input);
  const head = html.querySelector("head");
  const body = html.querySelector("body");
  const headAssets = Array.from(head?.querySelectorAll("style, link[rel='stylesheet'], link[rel~='stylesheet']") ?? [])
    .map((element) => element.outerHTML)
    .join("\n");
  const bodyClass = body?.getAttribute("class") ?? "";
  const canvasStyle = [body?.getAttribute("style") ?? "", pdfCanvasInheritedStyle(sourceDocument)].filter(Boolean).join("; ");
  return `<section class="ai-slide-pdf-page" aria-label="${escapeHtml(deckSlideDisplayName(input.slide, input.index))}">
  <div class="ai-slide-pdf-raster-layer">
    <div class="ai-slide-pdf-canvas ${escapeHtml(bodyClass)}" style="${escapeHtml(canvasStyle)}">
${headAssets}
${body?.innerHTML ?? ""}
    </div>
  </div>
</section>`;
}

function pdfCanvasInheritedStyle(sourceDocument: Document) {
  const win = sourceDocument.defaultView;
  if (!win || !sourceDocument.body) return "";
  const bodyStyle = win.getComputedStyle(sourceDocument.body);
  const htmlStyle = sourceDocument.documentElement ? win.getComputedStyle(sourceDocument.documentElement) : null;
  const backgroundSource = bodyStyle.backgroundImage !== "none" || bodyStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
    ? bodyStyle
    : htmlStyle;
  return [
    cssDeclaration("background-color", backgroundSource?.backgroundColor),
    cssDeclaration("background-image", backgroundSource?.backgroundImage, "none"),
    cssDeclaration("background-position", backgroundSource?.backgroundPosition),
    cssDeclaration("background-size", backgroundSource?.backgroundSize),
    cssDeclaration("background-repeat", backgroundSource?.backgroundRepeat),
    cssDeclaration("color", bodyStyle.color),
    cssDeclaration("font-family", bodyStyle.fontFamily),
  ].filter(Boolean).join("; ");
}

function cssDeclaration(property: string, value: string | undefined, emptyValue = "") {
  return value && value !== emptyValue ? `${property}: ${value}` : "";
}

function absolutizeDeckSlideAssetReferences(
  root: ParentNode,
  input: {
    artifact: SlideArtifact;
    projectId: string;
  },
) {
  rewriteAssetReferencesInElement(root, (url) => {
    if (url.startsWith("/local-assets/")) return new URL(url, window.location.origin).href;
    const assetPath = assetPathFromRelativeUrl(url, ["../assets/", "./assets/", "assets/"]);
    if (!assetPath) return null;
    return new URL(
      projectAssetUrl(input.projectId, input.artifact.fileRef, `assets/${assetPath}`, input.artifact.revision),
      window.location.origin,
    ).href;
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
