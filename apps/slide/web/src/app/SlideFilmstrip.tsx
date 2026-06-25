import { useEffect, useRef, useState, type ReactNode } from "react";

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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrollbar, setScrollbar] = useState({ left: 0, visible: false, width: 100 });

  const updateScrollbar = () => {
    const filmstrip = localRef.current;
    if (!filmstrip) return;
    const scrollWidth = filmstrip.scrollWidth;
    const clientWidth = filmstrip.clientWidth;
    const maxScrollLeft = scrollWidth - clientWidth;
    if (maxScrollLeft <= 1) {
      setScrollbar({ left: 0, visible: false, width: 100 });
      return;
    }
    setScrollbar({
      left: (filmstrip.scrollLeft / scrollWidth) * 100,
      visible: true,
      width: (clientWidth / scrollWidth) * 100,
    });
  };

  useEffect(() => {
    const filmstrip = localRef.current;
    const activeThumb = filmstrip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!filmstrip || !activeThumb) return;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement && filmstrip.contains(document.activeElement)) {
        activeThumb.focus({ preventScroll: true });
      }
      const stripRect = filmstrip.getBoundingClientRect();
      const thumbRect = activeThumb.getBoundingClientRect();
      const margin = 12;
      if (thumbRect.left < stripRect.left + margin) {
        filmstrip.scrollBy({ left: thumbRect.left - stripRect.left - margin, behavior: "smooth" });
      } else if (thumbRect.right > stripRect.right - margin) {
        filmstrip.scrollBy({ left: thumbRect.right - stripRect.right + margin, behavior: "smooth" });
      }
      updateScrollbar();
    });
    return () => cancelAnimationFrame(frame);
  }, [props.activeId]);

  useEffect(() => {
    const filmstrip = localRef.current;
    if (!filmstrip) return;
    const update = () => updateScrollbar();
    const frame = requestAnimationFrame(update);
    filmstrip.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(filmstrip);
    return () => {
      cancelAnimationFrame(frame);
      filmstrip.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [props.items.length, props.frameHeight, props.frameWidth]);

  const scrollToTrackPoint = (clientX: number) => {
    const filmstrip = localRef.current;
    const track = trackRef.current;
    if (!filmstrip || !track) return;
    const trackRect = track.getBoundingClientRect();
    const thumbWidth = (scrollbar.width / 100) * trackRect.width;
    const thumbLeft = Math.min(Math.max(clientX - trackRect.left - thumbWidth / 2, 0), Math.max(0, trackRect.width - thumbWidth));
    const maxScrollLeft = Math.max(1, filmstrip.scrollWidth - filmstrip.clientWidth);
    const maxThumbLeft = Math.max(1, trackRect.width - thumbWidth);
    filmstrip.scrollLeft = (thumbLeft / maxThumbLeft) * maxScrollLeft;
    updateScrollbar();
  };

  const beginThumbDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const filmstrip = localRef.current;
    const track = trackRef.current;
    if (!filmstrip || !track) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startScrollLeft = filmstrip.scrollLeft;
    const trackWidth = track.getBoundingClientRect().width;
    const thumbWidth = (scrollbar.width / 100) * trackWidth;
    const maxScrollLeft = Math.max(1, filmstrip.scrollWidth - filmstrip.clientWidth);
    const maxThumbLeft = Math.max(1, trackWidth - thumbWidth);
    const scrollPerPixel = maxScrollLeft / maxThumbLeft;
    const move = (moveEvent: PointerEvent) => {
      filmstrip.scrollLeft = startScrollLeft + (moveEvent.clientX - startX) * scrollPerPixel;
      updateScrollbar();
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <div className={cn(props.className, "group/filmstrip relative")} aria-label={props.ariaLabel ?? "Slides"}>
      <div ref={localRef} className="flex min-w-0 items-center gap-3 overflow-x-auto overflow-y-hidden py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {props.items.map((item, index) => {
          const isActive = item.id === props.activeId;
          return (
            <button
              aria-selected={isActive}
              className={cn(
                "relative w-36 shrink-0 rounded-[16px] border border-[#B8A07C]/30 bg-[#F4EFE6]/58 p-[7px] text-[#2A2620]/70  outline-none transition",
                "aria-selected:border-2 aria-selected:border-[#5C6B50]/78 aria-selected:bg-[#F4EFE6] aria-selected:p-1.5",
                "focus:outline-none focus-visible:outline-none",
              )}
              key={item.id}
              type="button"
              title={item.title}
              onClick={() => props.onSelect(item.id)}
            >
              <span className={cn("absolute left-2.5 top-2.5 z-[2] inline-flex h-[22px] items-center rounded-md px-1.5 font-mono text-[11px] font-black", isActive ? "bg-[#5C6B50] text-[#F4EFE6]" : "bg-[#2A2620]/72 text-[#F4EFE6]")}>{item.label}</span>
              <div className="relative overflow-hidden rounded bg-white [&>iframe]:absolute [&>iframe]:left-0 [&>iframe]:top-0 [&>iframe]:block [&>iframe]:origin-top-left [&>iframe]:border-0 [&>iframe]:pointer-events-none" style={{ width: props.frameWidth, height: props.frameHeight }}>
                {props.renderPreview(item, index)}
              </div>
            </button>
          );
        })}
      </div>
      {scrollbar.visible ? (
        <div className="absolute bottom-1 left-5 right-5 z-20 flex h-3 items-center opacity-0 transition-opacity group-hover/filmstrip:opacity-100 group-focus-within/filmstrip:opacity-100">
          <div
            ref={trackRef}
            className="relative h-1.5 w-full cursor-pointer rounded-full bg-[#B8A07C]/18"
            role="presentation"
            onPointerDown={(event) => {
              event.preventDefault();
              scrollToTrackPoint(event.clientX);
            }}
          >
            <div
              className="absolute top-0 h-1.5 cursor-grab rounded-full bg-[#5C6B50]/62 active:cursor-grabbing"
              style={{ left: `${scrollbar.left}%`, width: `${scrollbar.width}%` }}
              onPointerDown={beginThumbDrag}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
