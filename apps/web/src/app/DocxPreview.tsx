import { useCallback, useEffect, useRef } from "react";
import { FileText, Loader2 } from "lucide-react";
import { DocxRenderer } from "@tutti-os/office-preview/docx";
import "@tutti-os/office-preview/styles/docx.css";
import type { DocxRuntimeState, DocxSelection } from "../artifacts/docxArtifactAdapter";

type DocxPreviewProps = {
  runtime: DocxRuntimeState;
  dirty: boolean;
  error: string;
  loading: boolean;
  onBackHome: () => void;
  onSelectionChange: (selection: DocxSelection) => void;
};

export function DocxPreview(props: DocxPreviewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { onSelectionChange } = props;

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

  return (
    <section className="relative flex min-h-0 flex-col bg-[#1f1f1f]">
      <header className="flex h-12 items-center justify-between border-b border-white/8 px-5">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white">{props.runtime.title || "Untitled Word Document"}</div>
          <div className="flex items-center gap-2 text-[11px] text-white/38">
            {props.loading ? <Loader2 className="animate-spin" size={12} /> : <FileText size={12} />}
            <span>{props.dirty ? "Unsaved changes" : "Saved"} · DOCX · read-only preview</span>
          </div>
        </div>
        <button className="text-[12px] font-semibold text-white/52 hover:text-white" type="button" onClick={props.onBackHome}>
          Home
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#2a2a2a] px-3 py-4 md:px-6 md:py-6">
        {props.error ? <div className="mx-auto mb-4 max-w-[980px] rounded-xl bg-[#3a241f] p-3 text-[12px] leading-5 text-[#ffad9f]">{props.error}</div> : null}
        <div
          ref={rootRef}
          className="mx-auto min-h-[760px] w-full max-w-[980px] rounded-[2px] border border-black/30 bg-white text-[#202124] shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
          onKeyUp={syncSelection}
          onMouseUp={syncSelection}
        >
          {props.runtime.preview ? (
            <DocxRenderer document={props.runtime.preview.renderDocument} />
          ) : (
            <div className="grid min-h-[760px] place-items-center px-8 text-center text-[#5f6368]">
              <div>
                <FileText className="mx-auto mb-3 text-[#2f66d9]" size={34} />
                <div className="text-[14px] font-semibold text-[#202124]">Waiting for document.docx</div>
                <p className="mt-2 max-w-[360px] text-[12px] leading-5">
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
