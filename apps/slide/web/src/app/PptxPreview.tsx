import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { PptxRenderer } from "@tutti-os/office-preview/pptx";
import "@tutti-os/office-preview/styles/pptx.css";
import type { PptxRenderPresentation } from "@tutti-os/office-preview/pptx";
import type { PptxRuntimeState, PptxSelection } from "../artifact/pptxArtifactAdapter";
import { SlideFilmstrip } from "./SlideFilmstrip";
import { fitScale, nextSlideIndex, scaledHeight, scaledWidth, shouldIgnoreSlideNavigationEvent, slideDirectionFromKey, thumbnailMetrics, useElementSize } from "./slideView";

type PptxPreviewProps = {
  runtime: PptxRuntimeState;
  error: string;
  loading: boolean;
  onBackHome: () => void;
  onSelectionChange: (selection: PptxSelection) => void;
};

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
    <section className="pptx-preview">
      <header className="pptx-preview-header">
        <div className="pptx-preview-title">
          <div>{props.runtime.title || "Untitled Presentation"}</div>
          <span>
            {props.loading ? <Loader2 className="spin" size={12} /> : <FileText size={12} />}
            Saved · PPTX · {visibleSlides.length ? `${activeSlideIndex + 1}/${visibleSlides.length}` : "read-only preview"}
          </span>
        </div>
        <button className="editor-back" type="button" onClick={props.onBackHome}>
          Home
        </button>
      </header>

      <div ref={stageRef} className="pptx-preview-stage" tabIndex={0}>
        {props.error ? <div className="pptx-preview-error">{props.error}</div> : null}
        <div
          ref={rootRef}
          className="pptx-preview-frame"
          style={currentPresentation ? { width: frameWidth, height: frameHeight } : undefined}
          onKeyUp={syncSelection}
          onMouseUp={syncSelection}
        >
          {currentPresentation ? (
            <div
              className="pptx-current-render"
              style={{
                width: slideWidth,
                height: slideHeight,
                transform: `scale(${slideScale})`,
              }}
            >
              <PptxRenderer presentation={currentPresentation} />
            </div>
          ) : (
            <div className="pptx-preview-empty">
              <FileText size={36} />
              <strong>Waiting for slides.pptx</strong>
              <span>The agent can create or update the canonical PowerPoint file in this project workspace.</span>
            </div>
          )}
        </div>
      </div>
      {presentation && visibleSlides.length > 0 ? (
        <SlideFilmstrip
          activeId={activeSlide?.id ?? null}
          ariaLabel="Slides"
          className="pptx-filmstrip"
          frameHeight={pptxThumbnail.height}
          frameWidth={pptxThumbnail.width}
          items={filmstripItems}
          renderPreview={(item) => (
            <div
              className="pptx-thumbnail-render"
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
