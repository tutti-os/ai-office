import { exportPptxFromIframes } from "@tutti-os/office-export";
import { deckSlideDisplayName, pptxMimeType, type DeckManifest, type DeckManifestSlide, type SlideArtifact } from "@ai-slide/shared";
import { writeProjectExport } from "../api/projects";
import { projectAssetUrl } from "./deckEditorDom";

const hiddenFrameTimeoutMs = 15_000;

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

function safeExportFileName(value: string) {
  return value.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "slides";
}
