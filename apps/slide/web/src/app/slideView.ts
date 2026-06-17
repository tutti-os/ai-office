import { useEffect, useRef, useState } from "react";

export type SlideDirection = -1 | 1;
export type SlideNavigationKeyMode = "vertical" | "all";

export function useElementSize<TElement extends HTMLElement>() {
  const ref = useRef<TElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const updateSize = () => {
      setSize({
        width: Math.max(0, element.clientWidth),
        height: Math.max(0, element.clientHeight),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}

export function fitScale(input: { availableHeight: number; availableWidth: number; height: number; maxScale?: number; minScale?: number; width: number }) {
  if (input.availableWidth <= 0 || input.availableHeight <= 0 || input.width <= 0 || input.height <= 0) {
    return input.minScale ?? 0;
  }
  return Math.min(input.maxScale ?? 1, input.availableWidth / input.width, input.availableHeight / input.height);
}

export function scaledHeight(input: { height: number; scale: number }) {
  return Math.round(input.height * input.scale);
}

export function scaledWidth(input: { scale: number; width: number }) {
  return Math.round(input.width * input.scale);
}

export function thumbnailMetrics(input: { height: number; thumbnailWidth?: number; width: number }) {
  const width = input.thumbnailWidth ?? 128;
  const scale = width / input.width;
  return {
    height: scaledHeight({ height: input.height, scale }),
    scale,
    width,
  };
}

export function nextSlideIndex(input: { count: number; currentIndex: number; direction: SlideDirection; wrap?: boolean }) {
  if (input.count <= 0) return -1;
  const currentIndex = input.currentIndex >= 0 ? input.currentIndex : 0;
  const nextIndex = currentIndex + input.direction;
  if (input.wrap) return (nextIndex + input.count) % input.count;
  return Math.min(Math.max(nextIndex, 0), input.count - 1);
}

export function slideDirectionFromKey(key: string, mode: SlideNavigationKeyMode): SlideDirection | null {
  if (key === "ArrowUp") return -1;
  if (key === "ArrowDown") return 1;
  if (mode === "all" && key === "ArrowLeft") return -1;
  if (mode === "all" && key === "ArrowRight") return 1;
  return null;
}

export function shouldIgnoreSlideNavigationEvent(event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}) {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isInsideEditable(event.target);
}

export function isInsideEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
