import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { FileText } from "lucide-react";
import { scrollbarClass } from "@ai-app/ui/app-shell";
import {
  clearPersistentSelectionHighlight,
  persistentSelectionRectsForRange,
  setPersistentSelectionHighlight,
  type PersistentSelectionRect,
} from "@ai-app/ui/persistent-selection-highlight";
import { DocxRenderer } from "@tutti-os/office-preview/docx";
import "@tutti-os/office-preview/styles/docx.css";
import type { DocxRuntimeState, DocxSelection } from "../artifact/docxArtifactAdapter";

type DocxPreviewProps = {
  runtime: DocxRuntimeState;
  projectId: string | null;
  previewRef: RefObject<HTMLDivElement | null>;
  error: string;
  onSelectionChange: (selection: DocxSelection) => void;
};

export function DocxPreview(props: DocxPreviewProps) {
  const activeSelectionRangeRef = useRef<Range | null>(null);
  const activeSelectionRectsRef = useRef<PersistentSelectionRect[]>([]);
  const [persistentSelectionRects, setPersistentSelectionRects] = useState<PersistentSelectionRect[]>([]);
  const { onSelectionChange } = props;

  const preserveSelectionHighlight = useCallback(() => {
    const range = activeSelectionRangeRef.current;
    if (!range) return;
    if (setPersistentSelectionHighlight(docxPersistentSelectionHighlightName, range)) {
      setPersistentSelectionRects([]);
    } else {
      setPersistentSelectionRects(activeSelectionRectsRef.current);
    }
  }, []);

  const clearPersistentSelection = useCallback(() => {
    clearPersistentSelectionHighlight(docxPersistentSelectionHighlightName);
    setPersistentSelectionRects([]);
  }, []);

  const syncSelection = useCallback(() => {
    const root = props.previewRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) {
      preserveSelectionHighlight();
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      preserveSelectionHighlight();
      return;
    }
    const selectedText = selection.toString().trim();
    clearPersistentSelection();
    if (selectedText) {
      const clonedRange = range.cloneRange();
      activeSelectionRangeRef.current = clonedRange;
      activeSelectionRectsRef.current = persistentSelectionRectsForRange(root, clonedRange);
    } else {
      activeSelectionRangeRef.current = null;
      activeSelectionRectsRef.current = [];
    }
    onSelectionChange({ selectedText });
  }, [clearPersistentSelection, onSelectionChange, preserveSelectionHighlight, props.previewRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", syncSelection);
    return () => document.removeEventListener("selectionchange", syncSelection);
  }, [syncSelection]);

  useEffect(() => {
    activeSelectionRangeRef.current = null;
    activeSelectionRectsRef.current = [];
    clearPersistentSelection();
  }, [props.runtime.revision]);

  useEffect(() => {
    return clearPersistentSelection;
  }, [clearPersistentSelection]);

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-[#EEE8DC]">
        <div className={`h-full overflow-x-hidden overflow-y-auto bg-[#EEE8DC] px-3 py-4 md:px-6 md:py-6 ${scrollbarClass}`}>
          {props.error ? <div className="mx-auto mb-4 max-w-[980px] rounded-[16px] border border-[#B8A07C]/30 bg-[#F4EFE6]/80 p-3 text-[13px] leading-5 text-[#7b2e24]">{props.error}</div> : null}
          <div
            ref={props.previewRef}
            className="ai-docx-preview relative mx-auto min-h-[760px] w-full max-w-[980px] text-[#202124]"
            onKeyUp={syncSelection}
            onMouseDownCapture={clearPersistentSelection}
            onMouseUp={syncSelection}
          >
            {props.runtime.preview ? (
              <>
                <DocxRenderer document={props.runtime.preview.renderDocument} />
                <PersistentSelectionOverlay rects={persistentSelectionRects} />
              </>
            ) : (
              <div className="grid min-h-[760px] place-items-center px-8 text-center text-[#5f6368]">
                <div>
                  <FileText className="mx-auto mb-3 text-[#5C6B50]" size={34} />
                  <div className="text-[15px] font-semibold text-[#2A2620]">Waiting for document.docx</div>
                  <p className="mt-2 max-w-[360px] text-[13px] leading-5 text-[#8B8275]">
                    The agent can create or update the canonical DOCX file in this project workspace.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
    </section>
  );
}

const docxPersistentSelectionHighlightName = "ai-agent-docx-selection";

function PersistentSelectionOverlay(props: { rects: PersistentSelectionRect[] }) {
  if (props.rects.length === 0) return null;
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-10" aria-hidden="true">
      {props.rects.map((rect, index) => (
        <span
          key={`${index}:${rect.left}:${rect.top}:${rect.width}:${rect.height}`}
          className="absolute rounded-[2px] bg-[#94A3B8]/35"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      ))}
    </div>
  );
}
