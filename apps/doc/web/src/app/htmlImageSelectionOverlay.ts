import { imageResizeHandleStyle, positionImageSelectionOverlay, removeImageSelectionOverlay } from "./htmlRuntimeDom";
import type { ImageObjectElement, ResizeHandle } from "./runtimeWorkbenchTypes";

const imageResizeHandles: ResizeHandle[] = ["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"];
const lucideReplaceIconNode = [
  ["path", { d: "M14 4a1 1 0 0 1 1-1" }],
  ["path", { d: "M15 10a1 1 0 0 1-1-1" }],
  ["path", { d: "M21 4a1 1 0 0 0-1-1" }],
  ["path", { d: "M21 9a1 1 0 0 1-1 1" }],
  ["path", { d: "m3 7 3 3 3-3" }],
  ["path", { d: "M6 10V5a2 2 0 0 1 2-2h2" }],
  ["rect", { x: "3", y: "14", width: "7", height: "7", rx: "1" }],
] as const;

export function renderImageSelectionOverlay(input: {
  doc: Document;
  image: ImageObjectElement;
  onReplace: (image: ImageObjectElement) => void;
  onResizeStart: (handle: ResizeHandle, image: ImageObjectElement, overlay: HTMLElement, event: globalThis.PointerEvent) => void;
}) {
  removeImageSelectionOverlay(input.doc);
  if (!input.doc.body.contains(input.image)) return;

  const overlay = input.doc.createElement("div");
  overlay.setAttribute("data-runtime-editor-overlay", "image-selection");
  overlay.contentEditable = "false";
  Object.assign(overlay.style, {
    position: "fixed",
    zIndex: "2147483647",
    pointerEvents: "none",
    border: "2px solid #5C6B50",
    boxSizing: "border-box",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.95)",
  } satisfies Partial<CSSStyleDeclaration>);

  overlay.append(createReplaceButton(input.doc, input.image, input.onReplace));
  for (const handle of imageResizeHandles) {
    const button = input.doc.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Resize ${handle}`);
    button.setAttribute("data-handle", handle);
    Object.assign(button.style, imageResizeHandleStyle(handle));
    button.addEventListener("pointerdown", (event) => input.onResizeStart(handle, input.image, overlay, event));
    overlay.append(button);
  }

  input.doc.body.append(overlay);
  positionImageSelectionOverlay(input.image, overlay);
  input.image.addEventListener("load", () => positionImageSelectionOverlay(input.image, overlay), { once: true });
}

function createReplaceButton(doc: Document, image: ImageObjectElement, onReplace: (image: ImageObjectElement) => void) {
  const menu = doc.createElement("div");
  Object.assign(menu.style, {
    position: "absolute",
    left: "50%",
    top: "-8px",
    transform: "translate(-50%, -100%)",
    display: "grid",
    width: "32px",
    height: "32px",
    boxSizing: "border-box",
    placeItems: "center",
    alignItems: "center",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: "8px",
    background: "#fff",
    padding: "0",
    boxShadow: "0 6px 18px rgba(0,0,0,0.14)",
    pointerEvents: "auto",
  } satisfies Partial<CSSStyleDeclaration>);

  const replaceButton = doc.createElement("button");
  replaceButton.type = "button";
  replaceButton.title = "Replace image";
  replaceButton.setAttribute("aria-label", "Replace image");
  Object.assign(replaceButton.style, {
    appearance: "none",
    width: "28px",
    minWidth: "28px",
    height: "28px",
    minHeight: "28px",
    boxSizing: "border-box",
    border: "0",
    borderRadius: "8px",
    background: "transparent",
    padding: "0",
    margin: "0",
    color: "rgba(0,0,0,0.62)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    lineHeight: "1",
  } satisfies Partial<CSSStyleDeclaration>);

  replaceButton.append(createReplaceIcon(doc));
  replaceButton.addEventListener("mouseenter", () => {
    replaceButton.style.background = "rgba(0,0,0,0.06)";
    replaceButton.style.color = "#111";
  });
  replaceButton.addEventListener("mouseleave", () => {
    replaceButton.style.background = "transparent";
    replaceButton.style.color = "rgba(0,0,0,0.62)";
  });
  replaceButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  replaceButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onReplace(image);
  });
  menu.append(replaceButton);
  return menu;
}

function createReplaceIcon(doc: Document) {
  const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("width", "16");
  icon.setAttribute("height", "16");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  Object.assign(icon.style, {
    display: "block",
    width: "16px",
    height: "16px",
    flex: "0 0 auto",
  } satisfies Partial<CSSStyleDeclaration>);

  lucideReplaceIconNode.forEach(([tagName, attributes]) => {
    const node = doc.createElementNS("http://www.w3.org/2000/svg", tagName);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    icon.append(node);
  });
  return icon;
}
