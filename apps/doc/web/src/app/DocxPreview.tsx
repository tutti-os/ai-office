import { useCallback, useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { ArtifactAgentProcessingOverlay, ArtifactWorkspaceHeader } from "@ai-app/ui/editor-frame";
import { DocxRenderer } from "@tutti-os/office-preview/docx";
import "@tutti-os/office-preview/styles/docx.css";
import type { DocxRuntimeState, DocxSelection } from "../artifact/docxArtifactAdapter";

type DocxPreviewProps = {
  runtime: DocxRuntimeState;
  projectId: string | null;
  dirty: boolean;
  error: string;
  agentProcessing: boolean;
  loading: boolean;
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
    <section className="relative flex h-full min-h-0 flex-col bg-[#1f1f1f]">
      <ArtifactWorkspaceHeader
        title={props.runtime.title || "Untitled Word Doc"}
        saveState={props.loading ? "loading" : props.dirty ? "saving" : "saved"}
        exportItems={[
          { label: "PDF", disabled: true, onSelect: () => undefined },
        ]}
      />

      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-x-hidden overflow-y-auto bg-[#2a2a2a] px-3 py-4 md:px-6 md:py-6">
          {props.error ? <div className="mx-auto mb-4 max-w-[980px] rounded-xl bg-[#3a241f] p-3 text-[12px] leading-5 text-[#ffad9f]">{props.error}</div> : null}
          <div
            ref={rootRef}
            className="ai-docx-preview mx-auto min-h-[760px] w-full max-w-[980px] text-[#202124]"
            onKeyUp={syncSelection}
            onMouseUp={syncSelection}
          >
            {props.runtime.preview ? (
              <DocxRenderer document={props.runtime.preview.renderDocument} />
            ) : (
              <div className="grid min-h-[760px] place-items-center px-8 text-center text-[#5f6368]">
                <div>
                  <FileText className="mx-auto mb-3 text-[#2f66d9]" size={34} />
                  <div className="text-[14px] font-semibold text-white">Waiting for document.docx</div>
                  <p className="mt-2 max-w-[360px] text-[12px] leading-5 text-white/48">
                    The agent can create or update the canonical DOCX file in this project workspace.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        <ArtifactAgentProcessingOverlay active={props.agentProcessing} />
      </div>
    </section>
  );
}
