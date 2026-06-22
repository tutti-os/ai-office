import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { darkScrollbarClass } from "@ai-app/ui/app-shell";
import { PptxRenderer } from "@tutti-os/office-preview/pptx";
import "@tutti-os/office-preview/styles/pptx.css";
import type { PptxRenderPresentation } from "@tutti-os/office-preview/pptx";
import type { PptxRuntimeState, PptxSelection } from "../artifact/pptxArtifactAdapter";
import { SlideFilmstrip } from "./SlideFilmstrip";
import { fitScale, nextSlideIndex, scaledHeight, scaledWidth, shouldIgnoreSlideNavigationEvent, slideDirectionFromKey, thumbnailMetrics, useElementSize } from "./slideView";

type PptxPreviewProps = {
  runtime: PptxRuntimeState;
  error: string;
  onSelectionChange: (selection: PptxSelection) => void;
};

const filmstripClass = "flex min-h-32 min-w-0 shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden border-t border-white/8 bg-[#242424] px-5 pb-4 pt-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function PptxPreview(props: PptxPreviewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { ref: stageRef, width: stageWidth, height: stageHeight } = useElementSize<HTMLDivElement>();
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const { onSelectionChange } = props;
  const presentation = props.runtime.preview?.renderPresentation ?? null;
  const visibleSlides = useMemo(() => presentation?.slides.filter((slide) => !slide.hidden) ?? [], [presentation]);
  const filmstripItems = useMemo(
    () =>
      visibleSlides.map((slide, index) => ({
        id: slide.id,
        label: String(index + 1).padStart(2, "0"),
        title: slide.name || `Slide ${index + 1}`,
      })),
    [visibleSlides],
  );
  const activeSlide = visibleSlides.find((slide) => slide.id === activeSlideId) ?? visibleSlides[0] ?? null;
  const activeSlideIndex = activeSlide ? visibleSlides.findIndex((slide) => slide.id === activeSlide.id) : -1;
  const currentPresentation = useMemo(
    () => (presentation && activeSlide ? presentationForSlide(presentation, activeSlide.id) : null),
    [activeSlide, presentation],
  );
  const slideWidth = presentation?.slideWidthPx ?? 1280;
  const slideHeight = presentation?.slideHeightPx ?? 720;
  const slideScale = fitScale({
    availableHeight: Math.max(0, stageHeight - 56),
    availableWidth: Math.max(0, stageWidth - 64),
    height: slideHeight,
    minScale: 0.5,
    width: slideWidth,
  });
  const frameWidth = scaledWidth({ scale: slideScale, width: slideWidth });
  const frameHeight = scaledHeight({ height: slideHeight, scale: slideScale });
  const pptxThumbnail = thumbnailMetrics({ height: slideHeight, width: slideWidth });

  const syncSelection = useCallback(() => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) {
      onSelectionChange({ selectedText: "" });
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      onSelectionChange({ selectedText: "" });
      return;
    }
    onSelectionChange({ selectedText: selection.toString().trim() });
  }, [onSelectionChange]);

  useEffect(() => {
    document.addEventListener("selectionchange", syncSelection);
    return () => document.removeEventListener("selectionchange", syncSelection);
  }, [syncSelection]);

  useEffect(() => {
    if (!visibleSlides.length) {
      setActiveSlideId(null);
      return;
    }
    if (!activeSlideId || !visibleSlides.some((slide) => slide.id === activeSlideId)) {
      setActiveSlideId(visibleSlides[0].id);
    }
  }, [activeSlideId, visibleSlides]);

  const moveSlide = (offset: -1 | 1) => {
    if (!visibleSlides.length) return;
    const currentIndex = Math.max(0, activeSlideIndex);
    const nextIndex = nextSlideIndex({ count: visibleSlides.length, currentIndex, direction: offset, wrap: true });
    setActiveSlideId(visibleSlides[nextIndex].id);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreSlideNavigationEvent(event)) return;
      const direction = slideDirectionFromKey(event.key, "all");
      if (!direction) return;
      event.preventDefault();
      moveSlide(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#1f1f1f]">
      <div ref={stageRef} className={`relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#2a2a2a] px-8 py-7 outline-none ${darkScrollbarClass}`} tabIndex={0}>
        {props.error ? <div className="absolute left-1/2 top-4 z-[2] w-[min(calc(100%_-_48px),980px)] -translate-x-1/2 rounded-[10px] bg-[#3a241f] p-3 text-[12px] leading-5 text-[#ffad9f]">{props.error}</div> : null}
        <div
          ref={rootRef}
          className="relative shrink-0 overflow-hidden rounded-[2px] border border-black/30 bg-white text-[#202124] shadow-[0_30px_90px_rgba(0,0,0,0.45)] [&_.tsh-pptx-document]:block [&_.tsh-pptx-slide]:shadow-none"
          style={currentPresentation ? { width: frameWidth, height: frameHeight } : undefined}
          onKeyUp={syncSelection}
          onMouseUp={syncSelection}
        >
          {currentPresentation ? (
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: slideWidth,
                height: slideHeight,
                transform: `scale(${slideScale})`,
              }}
            >
              <PptxRenderer presentation={currentPresentation} />
            </div>
          ) : (
            <div className="grid min-h-[420px] w-[min(calc(100vw_-_420px),760px)] min-w-[360px] place-items-center content-center gap-2.5 p-8 text-center text-[#5f6368]">
              <FileText className="text-[#2f66d9]" size={36} />
              <strong className="text-[14px] text-[#202124]">Waiting for slides.pptx</strong>
              <span className="max-w-[380px] text-[12px] leading-5">The agent can create or update the canonical PowerPoint file in this project workspace.</span>
            </div>
          )}
        </div>
      </div>
      {presentation && visibleSlides.length > 0 ? (
        <SlideFilmstrip
          activeId={activeSlide?.id ?? null}
          ariaLabel="Slides"
          className={filmstripClass}
          frameHeight={pptxThumbnail.height}
          frameWidth={pptxThumbnail.width}
          items={filmstripItems}
          renderPreview={(item) => (
            <div
              className="absolute left-0 top-0 origin-top-left [&_.tsh-pptx-document]:block [&_.tsh-pptx-slide]:shadow-none"
              style={{
                width: slideWidth,
                height: slideHeight,
                transform: `scale(${pptxThumbnail.scale})`,
              }}
            >
              <PptxRenderer presentation={presentationForSlide(presentation, item.id)} />
            </div>
          )}
          onSelect={setActiveSlideId}
        />
      ) : null}
    </section>
  );
}

function presentationForSlide(presentation: PptxRenderPresentation, slideId: string): PptxRenderPresentation {
  const slide = presentation.slides.find((item) => item.id === slideId);
  return {
    ...presentation,
    slides: slide ? [slide] : [],
  };
}
