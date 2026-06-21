import { useEffect, type ReactNode, type RefObject } from "react";

export const toolbarIconButton =
  "inline-grid size-7 shrink-0 place-items-center rounded-[10px] border-0 bg-transparent text-[#2A2620]/72 outline-none transition hover:not-disabled:bg-[#E6DDCD]/70 hover:not-disabled:text-[#5C6B50] disabled:cursor-default disabled:text-[#8B8275] disabled:opacity-45 [&_svg]:size-[18px]";
export const toolbarTooltip =
  "relative before:pointer-events-none before:absolute before:left-1/2 before:top-full before:z-50 before:mt-2 before:-translate-x-1/2 before:whitespace-nowrap before:rounded-[10px] before:bg-[#2A2620] before:px-2 before:py-1 before:text-[10px] before:font-bold before:leading-none before:text-[#F4EFE6] before:opacity-0 before:shadow-[0_10px_24px_rgba(0,0,0,0.18)] before:transition-opacity before:duration-150 before:content-[attr(data-tip)] after:pointer-events-none after:absolute after:left-1/2 after:top-full after:z-50 after:mt-0.5 after:-translate-x-1/2 after:border-x-[5px] after:border-b-[5px] after:border-x-transparent after:border-b-[#2A2620] after:opacity-0 after:transition-opacity after:duration-150 hover:before:opacity-100 hover:after:opacity-100 focus-visible:before:opacity-100 focus-visible:after:opacity-100";
const toolbarFloatingMenu =
  "fixed z-50 max-h-80 w-56 overflow-y-auto rounded-[16px] border border-[#B8A07C]/55 bg-[#F4EFE6] py-1.5 text-[#2A2620] shadow-[0_18px_42px_rgba(0,0,0,0.16)]";
export const toolbarFloatingMenuButton =
  "flex h-7 w-full items-center justify-between border-0 bg-transparent px-2.5 text-left text-[10px] font-semibold text-inherit hover:not-disabled:bg-[#E6DDCD]/55 disabled:text-[#8B8275]/50";

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
  position: { left: number; top: number };
  width?: number;
}) {
  return (
    <div
      ref={props.menuRef}
      className={toolbarFloatingMenu}
      data-toolbar-skip-selection-preserve="true"
      role="menu"
      style={{ left: props.position.left, top: props.position.top, width: props.width }}
    >
      {props.children}
    </div>
  );
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
