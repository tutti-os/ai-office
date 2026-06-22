import { useEffect, useRef, type ReactNode } from "react";

export type SlideFilmstripItem = {
  id: string;
  label: string;
  title?: string;
};

type SlideFilmstripProps = {
  activeId: string | null;
  ariaLabel?: string;
  className?: string;
  frameHeight: number;
  frameWidth: number;
  items: SlideFilmstripItem[];
  renderPreview: (item: SlideFilmstripItem, index: number) => ReactNode;
  onSelect: (id: string) => void;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function SlideFilmstrip(props: SlideFilmstripProps) {
  const localRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const filmstrip = localRef.current;
    const activeThumb = filmstrip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!filmstrip || !activeThumb) return;
    const frame = requestAnimationFrame(() => {
      const stripRect = filmstrip.getBoundingClientRect();
      const thumbRect = activeThumb.getBoundingClientRect();
      const margin = 12;
      if (thumbRect.left < stripRect.left + margin) {
        filmstrip.scrollBy({ left: thumbRect.left - stripRect.left - margin, behavior: "smooth" });
      } else if (thumbRect.right > stripRect.right - margin) {
        filmstrip.scrollBy({ left: thumbRect.right - stripRect.right + margin, behavior: "smooth" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [props.activeId]);

  return (
    <div ref={localRef} className={props.className ?? ""} aria-label={props.ariaLabel ?? "Slides"}>
      {props.items.map((item, index) => {
        const isActive = item.id === props.activeId;
        return (
          <button
            aria-selected={isActive}
            className={cn(
              "relative w-36 shrink-0 rounded-[16px] border border-[#B8A07C]/50 bg-[#F4EFE6]/58 p-[7px] text-[#2A2620]/70 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
              "aria-selected:border-[#5C6B50] aria-selected:shadow-[0_0_0_2px_rgba(92,107,80,0.18)]",
            )}
            key={item.id}
            type="button"
            title={item.title}
            onClick={() => props.onSelect(item.id)}
          >
            <span className="absolute left-2.5 top-2.5 z-[2] inline-flex h-[22px] items-center rounded-md bg-[#2A2620]/72 px-1.5 font-mono text-[11px] font-black text-[#F4EFE6]">{item.label}</span>
            <div className="relative overflow-hidden rounded bg-white [&>iframe]:absolute [&>iframe]:left-0 [&>iframe]:top-0 [&>iframe]:block [&>iframe]:origin-top-left [&>iframe]:border-0 [&>iframe]:pointer-events-none" style={{ width: props.frameWidth, height: props.frameHeight }}>
              {props.renderPreview(item, index)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
