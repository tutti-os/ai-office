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

export function SlideFilmstrip(props: SlideFilmstripProps) {
  const localRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const filmstrip = localRef.current;
    const activeThumb = filmstrip?.querySelector<HTMLElement>(".slide-filmstrip-thumb.active");
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
    <div ref={localRef} className={`slide-filmstrip ${props.className ?? ""}`} aria-label={props.ariaLabel ?? "Slides"}>
      {props.items.map((item, index) => {
        const isActive = item.id === props.activeId;
        return (
          <button
            className={`slide-filmstrip-thumb ${isActive ? "active" : ""}`}
            key={item.id}
            type="button"
            title={item.title}
            onClick={() => props.onSelect(item.id)}
          >
            <span>{item.label}</span>
            <div className="slide-filmstrip-frame" style={{ width: props.frameWidth, height: props.frameHeight }}>
              {props.renderPreview(item, index)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
