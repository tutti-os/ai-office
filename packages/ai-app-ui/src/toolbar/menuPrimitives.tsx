import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";

export const toolbarIconButton =
  "inline-grid size-7 shrink-0 place-items-center rounded-[10px] border-0 bg-transparent text-[#2A2620]/72 outline-none transition hover:not-disabled:bg-[#E6DDCD]/70 hover:not-disabled:text-[#5C6B50] disabled:cursor-default disabled:text-[#8B8275] disabled:opacity-45 [&_svg]:size-[18px]";
export const toolbarTooltip =
  "relative before:pointer-events-none before:absolute before:left-1/2 before:top-full before:z-50 before:mt-2 before:-translate-x-1/2 before:whitespace-nowrap before:rounded-[10px] before:bg-[#2A2620] before:px-2 before:py-1 before:text-[10px] before:font-bold before:leading-none before:text-[#F4EFE6] before:opacity-0 before:shadow-[0_10px_24px_rgba(0,0,0,0.18)] before:transition-opacity before:duration-150 before:content-[attr(data-tip)] after:pointer-events-none after:absolute after:left-1/2 after:top-full after:z-50 after:mt-0.5 after:-translate-x-1/2 after:border-x-[5px] after:border-b-[5px] after:border-x-transparent after:border-b-[#2A2620] after:opacity-0 after:transition-opacity after:duration-150 hover:before:opacity-100 hover:after:opacity-100 focus-visible:before:opacity-100 focus-visible:after:opacity-100";
const toolbarFloatingMenu =
  "fixed z-50 max-h-80 w-56 overflow-y-auto rounded-[16px] border border-[#B8A07C]/55 bg-[#F4EFE6] py-1.5 text-[#2A2620] shadow-[0_18px_42px_rgba(0,0,0,0.16)]";
export const toolbarFloatingMenuButton =
  "flex h-7 w-full items-center justify-between border-0 bg-transparent px-2.5 text-left text-[10px] font-semibold text-inherit hover:not-disabled:bg-[#E6DDCD]/55 disabled:text-[#8B8275]/50";
export type ToolbarFloatingMenuPosition = {
  left: number;
  top: number;
  width?: number;
  maxHeight?: number;
};

type FloatingMenuAlign = "start" | "center" | "end";

const floatingMenuViewportMargin = 12;
const floatingMenuAnchorGap = 8;
const floatingMenuDefaultWidth = 224;
const floatingMenuDefaultMaxHeight = 320;
const floatingMenuMinimumMaxHeight = 96;

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function toolbarTip(title: string) {
  const normalized = title.trim().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    "Layout": "Layout",
    "More": "More",
    "Paragraph spacing": "Paragraph",
    "Spacing": "Spacing",
  };
  if (aliases[normalized]) return aliases[normalized];
  const words = normalized.split(" ");
  return words.length > 2 ? words.slice(0, 2).join(" ") : normalized;
}

export function ToolbarFloatingMenu(props: {
  children: ReactNode;
  menuRef: RefObject<HTMLDivElement | null>;
  position: ToolbarFloatingMenuPosition;
  width?: number;
}) {
  const width = props.position.width ?? props.width;
  return (
    <div
      ref={props.menuRef}
      className={toolbarFloatingMenu}
      data-toolbar-skip-selection-preserve="true"
      role="menu"
      style={{ left: props.position.left, top: props.position.top, maxHeight: props.position.maxHeight, width }}
    >
      {props.children}
    </div>
  );
}

export function useToolbarFloatingMenuPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  options: {
    align?: FloatingMenuAlign;
    gap?: number;
    maxHeight?: number;
    viewportMargin?: number;
    width?: number;
  } = {},
) {
  const [position, setPosition] = useState<ToolbarFloatingMenuPosition>({
    left: floatingMenuViewportMargin,
    top: floatingMenuViewportMargin,
    maxHeight: options.maxHeight ?? floatingMenuDefaultMaxHeight,
    width: options.width,
  });

  const updatePosition = useCallback(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const next = getToolbarFloatingMenuPosition(anchor.getBoundingClientRect(), menu, options);
    setPosition((current) =>
      current.left === next.left && current.top === next.top && current.width === next.width && current.maxHeight === next.maxHeight ? current : next,
    );
  }, [anchorRef, menuRef, open, options.align, options.gap, options.maxHeight, options.viewportMargin, options.width]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (anchorRef.current) resizeObserver?.observe(anchorRef.current);
    if (menuRef.current) resizeObserver?.observe(menuRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [anchorRef, menuRef, open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updatePosition);
    viewport?.addEventListener("scroll", updatePosition);
    return () => {
      viewport?.removeEventListener("resize", updatePosition);
      viewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open, updatePosition]);

  return position;
}

function getToolbarFloatingMenuPosition(anchorRect: DOMRect, menu: HTMLElement, options: {
  align?: FloatingMenuAlign;
  gap?: number;
  maxHeight?: number;
  viewportMargin?: number;
  width?: number;
}): ToolbarFloatingMenuPosition {
  const viewport = getVisualViewportRect();
  const margin = options.viewportMargin ?? floatingMenuViewportMargin;
  const gap = options.gap ?? floatingMenuAnchorGap;
  const maxConfiguredHeight = options.maxHeight ?? floatingMenuDefaultMaxHeight;
  const availableWidth = Math.max(0, viewport.width - margin * 2);
  const measuredWidth = options.width ?? (menu.offsetWidth || floatingMenuDefaultWidth);
  const width = Math.min(measuredWidth, availableWidth);
  const viewportLeft = viewport.left + margin;
  const viewportRight = viewport.left + viewport.width - margin;
  const viewportTop = viewport.top + margin;
  const viewportBottom = viewport.top + viewport.height - margin;
  const belowSpace = viewportBottom - anchorRect.bottom - gap;
  const aboveSpace = anchorRect.top - viewportTop - gap;
  const measuredHeight = Math.min(menu.scrollHeight || menu.offsetHeight || maxConfiguredHeight, maxConfiguredHeight);
  const placeAbove = belowSpace < measuredHeight && aboveSpace > belowSpace;
  const sideSpace = Math.max(floatingMenuMinimumMaxHeight, placeAbove ? aboveSpace : belowSpace);
  const maxHeight = Math.min(maxConfiguredHeight, sideSpace);
  const placementHeight = Math.min(measuredHeight, maxHeight);
  const rawTop = placeAbove ? anchorRect.top - gap - placementHeight : anchorRect.bottom + gap;
  const top = clampNumber(rawTop, viewportTop, Math.max(viewportTop, viewportBottom - placementHeight));
  const align = options.align ?? "end";
  const rawLeft =
    align === "start"
      ? anchorRect.left
      : align === "center"
        ? anchorRect.left + anchorRect.width / 2 - width / 2
        : anchorRect.right - width;
  const left = clampNumber(rawLeft, viewportLeft, Math.max(viewportLeft, viewportRight - width));

  return { left, top, width, maxHeight };
}

function getVisualViewportRect() {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

export function useDismissableFloatingLayer(open: boolean, onOpenChange: (open: boolean) => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChange(false);
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      close();
    };
    const closeOnOutsideScroll = (event: Event) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOnOutsideScroll, true);
    window.addEventListener("blur", close);
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnOutsideScroll, true);
      window.removeEventListener("blur", close);
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange, ref]);
}

export function cssNumber(value: string, fallback: number) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "normal") return fallback;
  const match = trimmed.match(/^-?\d+(\.\d+)?/);
  if (!match) return fallback;
  return Number(match[0]);
}

export function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function formatSliderNumber(value: number) {
  return Number(value.toFixed(2)).toString();
}
