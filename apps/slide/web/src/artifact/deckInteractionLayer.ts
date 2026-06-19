export type DeckObjectElement = HTMLElement | SVGElement;

export type DeckInteractionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DeckObjectGeometry = DeckInteractionRect & {
  rotation: number;
};

export type DeckObjectGeometryPatch = Partial<DeckObjectGeometry>;

export type DeckObjectAlignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

export type DeckResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export type DeckSnapGuide = {
  orientation: "horizontal" | "vertical";
  position: number;
  start: number;
  end: number;
};

type SnapMatch = {
  delta: number;
  distance: number;
  position: number;
};

export function readDeckObjectRect(object: DeckObjectElement): DeckInteractionRect {
  const rect = object.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function readDeckObjectLocalRect(object: DeckObjectElement): DeckInteractionRect {
  if (isHtmlDeckElement(object)) return readHtmlDeckObjectLocalRect(object);
  if (isSvgDeckElement(object)) return readSvgDeckObjectLocalRect(object);
  return readDeckObjectRect(object);
}

export function readDeckObjectGeometry(object: DeckObjectElement): DeckObjectGeometry {
  return {
    ...readDeckObjectLocalRect(object),
    rotation: readDeckObjectRotation(object),
  };
}

export function isMovableDeckObject(object: DeckObjectElement) {
  if (object.getAttribute("data-object") !== "true") return false;
  const rect = readDeckObjectRect(object);
  return rect.width > 0 && rect.height > 0;
}

export function collectDeckSnapTargets(activeObject: DeckObjectElement, canvasWidth: number, canvasHeight: number) {
  const objects = Array.from(activeObject.ownerDocument.querySelectorAll<DeckObjectElement>('[data-object="true"]'))
    .filter((object) => object !== activeObject)
    .map(readDeckObjectRect)
    .filter((rect) => rect.width > 0 && rect.height > 0);
  return {
    x: [0, canvasWidth / 2, canvasWidth, ...objects.flatMap((rect) => [rect.left, rect.left + rect.width / 2, rect.left + rect.width])],
    y: [0, canvasHeight / 2, canvasHeight, ...objects.flatMap((rect) => [rect.top, rect.top + rect.height / 2, rect.top + rect.height])],
  };
}

export function movedDeckRectForDelta(
  rect: DeckInteractionRect,
  deltaX: number,
  deltaY: number,
  canvasWidth: number,
  canvasHeight: number,
): DeckInteractionRect {
  return {
    ...rect,
    left: clamp(rect.left + deltaX, 0, Math.max(0, canvasWidth - rect.width)),
    top: clamp(rect.top + deltaY, 0, Math.max(0, canvasHeight - rect.height)),
  };
}

export function snappedDeckDragRect(
  rect: DeckInteractionRect,
  targets: { x: number[]; y: number[] },
  threshold: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const xSnap = closestSnapDelta([rect.left, rect.left + rect.width / 2, rect.left + rect.width], targets.x, threshold);
  const ySnap = closestSnapDelta([rect.top, rect.top + rect.height / 2, rect.top + rect.height], targets.y, threshold);
  const nextRect = {
    ...rect,
    left: clamp(rect.left + (xSnap?.delta ?? 0), 0, Math.max(0, canvasWidth - rect.width)),
    top: clamp(rect.top + (ySnap?.delta ?? 0), 0, Math.max(0, canvasHeight - rect.height)),
  };
  const guides: DeckSnapGuide[] = [];
  if (xSnap) guides.push({ orientation: "vertical", position: xSnap.position, start: 0, end: canvasHeight });
  if (ySnap) guides.push({ orientation: "horizontal", position: ySnap.position, start: 0, end: canvasWidth });
  return { rect: nextRect, guides };
}

export function alignedDeckObjectRect(
  rect: DeckInteractionRect,
  alignment: DeckObjectAlignment,
  canvasWidth: number,
  canvasHeight: number,
): DeckInteractionRect {
  if (alignment === "left") return { ...rect, left: 0 };
  if (alignment === "center") return { ...rect, left: (canvasWidth - rect.width) / 2 };
  if (alignment === "right") return { ...rect, left: canvasWidth - rect.width };
  if (alignment === "top") return { ...rect, top: 0 };
  if (alignment === "middle") return { ...rect, top: (canvasHeight - rect.height) / 2 };
  return { ...rect, top: canvasHeight - rect.height };
}

export function resizedDeckRectForHandle(
  handle: DeckResizeHandle,
  initial: DeckInteractionRect,
  deltaX: number,
  deltaY: number,
  canvasWidth: number,
  canvasHeight: number,
): DeckInteractionRect {
  const minWidth = 24;
  const minHeight = 24;
  let left = initial.left;
  let top = initial.top;
  let right = initial.left + initial.width;
  let bottom = initial.top + initial.height;

  if (handle.includes("left")) {
    left = clamp(initial.left + deltaX, 0, right - minWidth);
  }
  if (handle.includes("right")) {
    right = clamp(initial.left + initial.width + deltaX, left + minWidth, canvasWidth);
  }
  if (handle.includes("top")) {
    top = clamp(initial.top + deltaY, 0, bottom - minHeight);
  }
  if (handle.includes("bottom")) {
    bottom = clamp(initial.top + initial.height + deltaY, top + minHeight, canvasHeight);
  }

  return {
    left,
    top,
    width: Math.max(minWidth, right - left),
    height: Math.max(minHeight, bottom - top),
  };
}

export function applyDeckObjectRect(
  object: DeckObjectElement,
  rect: DeckInteractionRect,
  options: { onTextboxResize?: (object: DeckObjectElement) => void; preserveSize?: boolean } = {},
) {
  if (isPositionedDeckObject(object)) {
    object.style.left = px(rect.left);
    object.style.top = px(rect.top);
    object.style.right = "auto";
    object.style.bottom = "auto";
  } else {
    translateDeckObjectToRect(object, rect);
  }
  if (!options.preserveSize) {
    object.style.width = px(rect.width);
    object.style.height = px(rect.height);
    if (object.getAttribute("data-object-type") === "textbox") options.onTextboxResize?.(object);
  }
  if (isSvgDeckElement(object)) {
    if (!options.preserveSize) {
      object.setAttribute("width", px(rect.width));
      object.setAttribute("height", px(rect.height));
    }
  }
}

export function applyDeckObjectRotation(object: DeckObjectElement, rotation: number) {
  const view = object.ownerDocument.defaultView;
  if (!view?.DOMMatrix) {
    object.style.transform = `${object.style.transform || ""} rotate(${round(rotation)}deg)`.trim();
    return;
  }
  const computed = view.getComputedStyle(object);
  const matrix = new view.DOMMatrix(computed.transform === "none" ? undefined : computed.transform);
  const scaleX = Math.hypot(matrix.a, matrix.b) || 1;
  const scaleY = Math.hypot(matrix.c, matrix.d) || 1;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  matrix.a = cos * scaleX;
  matrix.b = sin * scaleX;
  matrix.c = -sin * scaleY;
  matrix.d = cos * scaleY;
  object.style.transform = matrixToCss(matrix);
}

function readDeckObjectRotation(object: DeckObjectElement) {
  const view = object.ownerDocument.defaultView;
  if (!view?.DOMMatrix) return 0;
  const computed = view.getComputedStyle(object);
  if (!computed.transform || computed.transform === "none") return 0;
  const matrix = new view.DOMMatrix(computed.transform);
  return round((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI);
}

function readHtmlDeckObjectLocalRect(object: HTMLElement): DeckInteractionRect {
  const computed = object.ownerDocument.defaultView?.getComputedStyle(object);
  const bounding = readDeckObjectRect(object);
  const width = finiteNumber(Number.parseFloat(computed?.width ?? "")) ?? (object.offsetWidth || bounding.width);
  const height = finiteNumber(Number.parseFloat(computed?.height ?? "")) ?? (object.offsetHeight || bounding.height);
  const translation = readDeckObjectTranslation(object);
  if (computed?.position === "absolute" || computed?.position === "fixed") {
    return {
      left: object.offsetLeft + translation.x,
      top: object.offsetTop + translation.y,
      width,
      height,
    };
  }
  return {
    left: bounding.left,
    top: bounding.top,
    width,
    height,
  };
}

function readSvgDeckObjectLocalRect(object: SVGElement): DeckInteractionRect {
  const bounding = readDeckObjectRect(object);
  const left = finiteNumber(Number.parseFloat(object.getAttribute("x") ?? "")) ?? bounding.left;
  const top = finiteNumber(Number.parseFloat(object.getAttribute("y") ?? "")) ?? bounding.top;
  const width = finiteNumber(Number.parseFloat(object.getAttribute("width") ?? "")) ?? bounding.width;
  const height = finiteNumber(Number.parseFloat(object.getAttribute("height") ?? "")) ?? bounding.height;
  return { left, top, width, height };
}

function readDeckObjectTranslation(object: DeckObjectElement) {
  const view = object.ownerDocument.defaultView;
  if (!view?.DOMMatrix) return { x: 0, y: 0 };
  const computed = view.getComputedStyle(object);
  if (!computed.transform || computed.transform === "none") return { x: 0, y: 0 };
  const matrix = new view.DOMMatrix(computed.transform);
  return { x: matrix.e, y: matrix.f };
}

function isPositionedDeckObject(object: DeckObjectElement) {
  const computed = object.ownerDocument.defaultView?.getComputedStyle(object);
  return computed?.position === "absolute" || computed?.position === "fixed";
}

function isHtmlDeckElement(value: DeckObjectElement): value is HTMLElement {
  return value.ownerDocument.defaultView ? value instanceof value.ownerDocument.defaultView.HTMLElement : false;
}

function translateDeckObjectToRect(object: DeckObjectElement, rect: DeckInteractionRect) {
  const current = readDeckObjectRect(object);
  const deltaX = rect.left - current.left;
  const deltaY = rect.top - current.top;
  if (!deltaX && !deltaY) return;
  const view = object.ownerDocument.defaultView;
  if (!view?.DOMMatrix) {
    object.style.transform = `${object.style.transform || ""} translate(${px(deltaX)}, ${px(deltaY)})`.trim();
    return;
  }
  const computed = view.getComputedStyle(object);
  const matrix = new view.DOMMatrix(computed.transform === "none" ? undefined : computed.transform);
  matrix.e += deltaX;
  matrix.f += deltaY;
  object.style.transform = matrixToCss(matrix);
}

function closestSnapDelta(values: number[], targets: number[], threshold: number): SnapMatch | null {
  let match: SnapMatch | null = null;
  values.forEach((value) => {
    targets.forEach((target) => {
      const delta = target - value;
      const distance = Math.abs(delta);
      if (distance > threshold) return;
      if (!match || distance < match.distance) match = { delta, distance, position: target };
    });
  });
  return match;
}

function isSvgDeckElement(value: DeckObjectElement): value is SVGElement {
  return value.ownerDocument.defaultView ? value instanceof value.ownerDocument.defaultView.SVGElement : false;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : null;
}

function px(value: number) {
  return `${Math.round(value * 100) / 100}px`;
}

function matrixToCss(matrix: DOMMatrix) {
  if (matrix.is2D) {
    return `matrix(${round(matrix.a)}, ${round(matrix.b)}, ${round(matrix.c)}, ${round(matrix.d)}, ${round(matrix.e)}, ${round(matrix.f)})`;
  }
  return `matrix3d(${[
    matrix.m11,
    matrix.m12,
    matrix.m13,
    matrix.m14,
    matrix.m21,
    matrix.m22,
    matrix.m23,
    matrix.m24,
    matrix.m31,
    matrix.m32,
    matrix.m33,
    matrix.m34,
    matrix.m41,
    matrix.m42,
    matrix.m43,
    matrix.m44,
  ]
    .map(round)
    .join(", ")})`;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
