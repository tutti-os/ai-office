import {
  removeImage,
  upsertImage,
  type ImageAttributes,
} from "../artifact/runtime/operations";
import type { ImageObjectElement, ResizeHandle } from "./runtimeWorkbenchTypes";

export function imageFromNode(node: Node | null, doc: Document): ImageObjectElement | null {
  const element = isElementNode(node) ? node : node?.parentElement ?? null;
  const image = element?.closest("img") ?? null;
  if (image && doc.body.contains(image)) return image as HTMLImageElement;

  let current: Element | null = element;
  while (current && current !== doc.body && current !== doc.documentElement) {
    if (isHTMLElementInDocument(current, doc) && isBackgroundImageObject(current, doc)) return current;
    current = current.parentElement;
  }
  return null;
}

function isHTMLElementInDocument(element: Element, doc: Document): element is HTMLElement {
  const ctor = doc.defaultView?.HTMLElement;
  return Boolean(ctor && element instanceof ctor);
}

function isBackgroundImageObject(element: HTMLElement, doc: Document) {
  if (!doc.body.contains(element)) return false;
  if (!backgroundImageUrl(doc.defaultView?.getComputedStyle(element).backgroundImage || "")) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 16 || rect.height < 16) return false;
  const hasImageSemantics = element.getAttribute("role") === "img" || Boolean(element.getAttribute("aria-label") || element.getAttribute("title"));
  const hasText = Boolean(element.textContent?.trim());
  return hasImageSemantics || !hasText;
}

export function selectElementInDocument(doc: Document, element: Element) {
  const selection = doc.getSelection();
  if (!selection || !doc.body.contains(element)) return;
  const range = doc.createRange();
  range.selectNode(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function removeImageSelectionOverlay(doc: Document) {
  doc.querySelectorAll("[data-runtime-editor-overlay='image-selection']").forEach((node) => node.remove());
}

export function positionImageSelectionOverlay(image: ImageObjectElement, overlay: HTMLElement) {
  const doc = image.ownerDocument;
  const win = doc.defaultView;
  if (!win || !doc.body.contains(image)) return;
  const rect = image.getBoundingClientRect();
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${Math.max(0, rect.width)}px`;
  overlay.style.height = `${Math.max(0, rect.height)}px`;
}

export function imageResizeHandleStyle(handle: ResizeHandle): Partial<CSSStyleDeclaration> {
  const style: Partial<CSSStyleDeclaration> = {
    position: "absolute",
    width: "10px",
    height: "10px",
    border: "1px solid #2684ff",
    background: "#fff",
    borderRadius: "2px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
    padding: "0",
    pointerEvents: "auto",
  };
  if (handle.includes("top")) style.top = "-6px";
  if (handle.includes("bottom")) style.bottom = "-6px";
  if (handle.includes("left")) style.left = "-6px";
  if (handle.includes("right")) style.right = "-6px";
  if (handle === "top" || handle === "bottom") {
    style.left = "50%";
    style.transform = "translateX(-50%)";
    style.cursor = "ns-resize";
  } else if (handle === "left" || handle === "right") {
    style.top = "50%";
    style.transform = "translateY(-50%)";
    style.cursor = "ew-resize";
  } else if (handle === "top-left" || handle === "bottom-right") {
    style.cursor = "nwse-resize";
  } else {
    style.cursor = "nesw-resize";
  }
  return style;
}

export function resizedImageSizeForHandle(handle: ResizeHandle, width: number, height: number, deltaX: number, deltaY: number) {
  const minSize = 24;
  let nextWidth = width;
  let nextHeight: number | null = null;
  if (handle.includes("right")) nextWidth = width + deltaX;
  if (handle.includes("left")) nextWidth = width - deltaX;
  if (handle.includes("bottom")) nextHeight = height + deltaY;
  if (handle.includes("top")) nextHeight = height - deltaY;
  return {
    width: Math.max(minSize, nextWidth),
    height: nextHeight === null ? null : Math.max(minSize, nextHeight),
  };
}

export function upsertSelectedImageObject(doc: Document, attributes: ImageAttributes, target: Element | null, activeImage: ImageObjectElement | null) {
  const image = activeImage && activeImage.ownerDocument === doc && doc.body.contains(activeImage) ? activeImage : imageFromNode(target, doc);
  if (image && image.tagName !== "IMG") return updateBackgroundImageObject(doc, image, attributes);
  return upsertImage(doc, attributes, target);
}

export function removeSelectedImageObject(doc: Document, target: Element | null, activeImage: ImageObjectElement | null) {
  const image = activeImage && activeImage.ownerDocument === doc && doc.body.contains(activeImage) ? activeImage : imageFromNode(target, doc);
  if (!image) return false;
  if (image.tagName === "IMG") return removeImage(doc, image);
  image.style.removeProperty("background-image");
  removeImageSelectionOverlay(doc);
  selectElementInDocument(doc, image);
  return image;
}

function updateBackgroundImageObject(doc: Document, image: ImageObjectElement, attributes: ImageAttributes) {
  const src = sanitizeImageSource(attributes.src);
  if (!src || !doc.body.contains(image)) return false;
  image.style.backgroundImage = cssUrlValue(src);
  if (!image.style.backgroundSize) image.style.backgroundSize = "cover";
  if (!image.style.backgroundPosition) image.style.backgroundPosition = "center";
  const width = normalizeImageCssSize(attributes.width ?? "");
  const height = normalizeImageCssSize(attributes.height ?? "");
  if (width) image.style.width = width;
  else image.style.removeProperty("width");
  if (height) image.style.height = height;
  else image.style.removeProperty("height");
  const alt = attributes.alt?.trim() ?? "";
  if (alt) {
    image.setAttribute("role", "img");
    image.setAttribute("aria-label", alt);
  } else if (image.getAttribute("role") === "img") {
    image.removeAttribute("role");
    image.removeAttribute("aria-label");
  }
  selectElementInDocument(doc, image);
  return image;
}

export function sanitizeImageSource(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^(https?:|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(trimmed) ? trimmed : "";
}

function normalizeImageCssSize(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return /^(auto|[\d.]+(px|%|rem|em|vw|vh))$/i.test(trimmed) ? trimmed : "";
}

function cssUrlValue(url: string) {
  return `url("${url.replace(/["\\\n\r\f]/g, (match) => `\\${match}`)}")`;
}

export function backgroundImageUrl(value: string) {
  const match = value.match(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/i);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Unable to read image file."));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read image file.")));
    reader.readAsDataURL(file);
  });
}

export function imageAltFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function isElementNode(node: unknown): node is Element {
  return Boolean(node && typeof node === "object" && (node as Node).nodeType === 1 && "tagName" in node);
}
