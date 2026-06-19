import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { ArtifactAgentProcessingOverlay, ArtifactEditorFrame, ArtifactWorkspaceHeader, type ArtifactSaveState as WorkspaceSaveState } from "@ai-app/ui/editor-frame";
import { type ToolbarLayoutValue } from "@ai-app/ui/toolbar";
import type { DocumentRunTimelineItem, LocalAgentProviderStatus, RuntimeProfile } from "@ai-doc/shared";
import type { AdjacentInsertPosition, Alignment, ElementStyleAttributes, HeadingTag, ImageAttributes, InlineFormatTag, ListKind } from "../artifact/runtime/operations";
import type { RuntimeState } from "../artifact/runtime/types";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { HtmlEditorToolbar } from "./HtmlEditorToolbar";
import type { AttributeDraft, EditorStats, LinkDraft, OperationPanelMode, ToolbarState } from "./runtimeWorkbenchTypes";

const minimumHtmlFrameHeight = 860;
const linkEditorPanelWidth = 300;
const linkEditorViewportMargin = 8;
const linkEditorAnchorGap = 8;
type LinkEditorPosition = {
  left: number;
  top: number;
  width: number;
};

export function DocumentLoadingScreen(props: { error: string; loading: boolean }) {
  return (
    <section className="relative flex h-full min-h-0 flex-col bg-[#1f1f1f]">
      <header className="flex h-12 shrink-0 items-center border-b border-white/8 px-5">
        <div className="min-w-0 truncate text-[13px] font-semibold text-white">Loading doc</div>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center bg-[#2a2a2a] px-6 text-center">
        <div className="max-w-[360px] text-[13px] font-semibold text-white/58">
          {props.error ? (
            props.error
          ) : (
            <span className="inline-flex items-center gap-2">
              {props.loading ? <Loader2 className="animate-spin" size={16} /> : null}
              Loading doc...
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export type HtmlEditorScreenProps = {
  activeSelectionText: string;
  dirty: boolean;
  error: string;
  editorStats: EditorStats;
  frameRevision: number;
  frameSrcDoc: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  agentConversationItems: DocumentRunTimelineItem[];
  agentConversationLoading: boolean;
  agentConversationError: string;
  agentSending: boolean;
  localAgentProviders: LocalAgentProviderStatus[];
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  attributeDraft: AttributeDraft;
  imageDraft: ImageAttributes;
  tableDraft: { rows: string; columns: string };
  styleDraft: ElementStyleAttributes;
  linkDraft: LinkDraft;
  linkEditorOpen: boolean;
  loading: boolean;
  operationDraft: string;
  operationIsHtml: boolean;
  operationPanelMode: OperationPanelMode;
  operationPosition: AdjacentInsertPosition;
  operationWrapperTag: string;
  runtime: RuntimeState | null;
  saveState: WorkspaceSaveState;
  agentProcessing: boolean;
  readOnly: boolean;
  toolbarDisabled: boolean;
  toolbarState: ToolbarState;
  onAlignment: (alignment: Alignment) => void;
  onApplyLink: (draft: LinkDraft) => void;
  onApplyOperation: () => void;
  onAttributeDraftChange: (value: AttributeDraft) => void;
  onBackHome: () => void;
  onCloseLinkEditor: () => void;
  onCloseOperation: () => void;
  onBackColor: (color: string) => void;
  onForeColor: (color: string) => void;
  onTableDraftChange: (value: { rows: string; columns: string }) => void;
  onStyleDraftChange: (value: ElementStyleAttributes) => void;
  onLineHeight: (lineHeight: string) => void;
  onLetterSpacing: (letterSpacing: string) => void;
  onLayoutChange: (attributes: Partial<ToolbarLayoutValue>) => void;
  onCreateLink: () => void;
  onFontFamily: (fontFamily: string) => void;
  onFontSize: (fontSize: string) => void;
  onFrameLoad: () => void;
  onFormat: (tagName: InlineFormatTag) => void;
  onHeading: (tagName: HeadingTag) => void;
  onImageDraftChange: (value: ImageAttributes) => void;
  onIndent: () => void;
  onChecklist: () => void;
  onList: (kind: ListKind) => void;
  onLinkDraftChange: (value: LinkDraft) => void;
  onLoadFixture: () => void;
  onMoreAction: (action: string) => void;
  onMutation: (operationType: string, description: string) => void;
  onOperationDraftChange: (value: string) => void;
  onOperationHtmlChange: (value: boolean) => void;
  onOperationPositionChange: (value: AdjacentInsertPosition) => void;
  onOperationWrapperTagChange: (value: string) => void;
  onOutdent: () => void;
  onPickImage: () => void;
  onSendAgentPrompt: (prompt: string) => Promise<void>;
  onRuntimeProfileChange: (profileId: string) => void;
  onCancelAgentRun: (runId: string) => Promise<void>;
  onRemoveLink: () => void;
  onRedo: () => void;
  onResetFrame: () => void;
  onSelection: () => void;
  onToolbarInteractionStart: () => void;
  onUndo: () => void;
};

export function HtmlEditorScreen(props: HtmlEditorScreenProps) {
  const canUndo = Boolean(props.runtime && props.runtime.history.currentIndex > 0);
  const canRedo = Boolean(props.runtime && props.runtime.history.currentIndex < props.runtime.history.snapshots.length - 1);
  const toolbarDisabled = props.toolbarDisabled || props.readOnly;
  const [spacingMenuOpen, setSpacingMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [frameHeight, setFrameHeight] = useState(minimumHtmlFrameHeight);
  const linkEditorRef = useRef<HTMLDivElement | null>(null);
  const linkEditorPanelRef = useRef<HTMLFormElement | null>(null);
  const frameScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const frameResizeRafRef = useRef<number | null>(null);
  const [linkEditorPosition, setLinkEditorPosition] = useState<LinkEditorPosition | null>(null);
  const hasPreservedRangeSelection = Boolean(props.runtime?.activeSelection && props.runtime.activeSelection.selectionType !== "write");
  const hasPreservedWriteSelection = Boolean(props.runtime?.activeSelection?.selectionType === "write" && props.runtime.activeSelection.commonAncestorPath);
  const canUseRangeSelection = props.toolbarState.rangeSelection || hasPreservedRangeSelection;
  const canCreateLink = !toolbarDisabled && (canUseRangeSelection || hasPreservedWriteSelection || props.toolbarState.table || props.toolbarState.contentElement);

  const updateHtmlFrameHeight = (pass = 0) => {
    const frame = props.iframeRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) return;
    const nextHeight = measureHtmlFrameContentHeight(doc);
    frame.style.height = `${nextHeight}px`;
    setFrameHeight((current) => (current === nextHeight ? current : nextHeight));
    if (pass >= 2) return;
    frameResizeRafRef.current = window.requestAnimationFrame(() => {
      frameResizeRafRef.current = null;
      const renderedHeight = Math.ceil(frame.getBoundingClientRect().height);
      if (measureHtmlFrameContentHeight(doc) > renderedHeight) updateHtmlFrameHeight(pass + 1);
    });
  };

  const scheduleHtmlFrameResize = () => {
    if (frameResizeRafRef.current !== null) window.cancelAnimationFrame(frameResizeRafRef.current);
    frameResizeRafRef.current = window.requestAnimationFrame(() => {
      frameResizeRafRef.current = null;
      updateHtmlFrameHeight();
    });
  };

  useEffect(() => {
    setFrameHeight(minimumHtmlFrameHeight);
    scheduleHtmlFrameResize();

    const doc = props.iframeRef.current?.contentDocument ?? null;
    if (!doc?.body) {
      return () => {
        if (frameResizeRafRef.current !== null) window.cancelAnimationFrame(frameResizeRafRef.current);
      };
    }

    const mutationObserver = new MutationObserver(scheduleHtmlFrameResize);
    mutationObserver.observe(doc.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    doc.addEventListener("load", scheduleHtmlFrameResize, true);

    return () => {
      mutationObserver.disconnect();
      doc.removeEventListener("load", scheduleHtmlFrameResize, true);
      if (frameResizeRafRef.current !== null) window.cancelAnimationFrame(frameResizeRafRef.current);
      frameResizeRafRef.current = null;
    };
  }, [props.frameRevision, props.frameSrcDoc]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== props.iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; deltaX?: unknown; deltaY?: unknown };
      if (!data || data.type !== "ai-doc-frame-wheel") return;
      const scroller = frameScrollContainerRef.current;
      if (!scroller) return;
      scroller.scrollLeft += typeof data.deltaX === "number" ? data.deltaX : 0;
      scroller.scrollTop += typeof data.deltaY === "number" ? data.deltaY : 0;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [props.iframeRef]);

  useLayoutEffect(() => {
    if (!props.linkEditorOpen) {
      setLinkEditorPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchor = linkEditorRef.current?.querySelector("button");
      const panel = linkEditorPanelRef.current;
      if (!anchor || !panel) return;
      const anchorRect = anchor.getBoundingClientRect();
      const availableWidth = Math.max(0, window.innerWidth - linkEditorViewportMargin * 2);
      const panelWidth = Math.min(linkEditorPanelWidth, availableWidth);
      const panelHeight = panel.offsetHeight;
      const centeredLeft = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
      const maxLeft = window.innerWidth - linkEditorViewportMargin - panelWidth;
      const left = clampNumber(centeredLeft, linkEditorViewportMargin, Math.max(linkEditorViewportMargin, maxLeft));
      const belowTop = anchorRect.bottom + linkEditorAnchorGap;
      const aboveTop = anchorRect.top - linkEditorAnchorGap - panelHeight;
      const maxTop = window.innerHeight - linkEditorViewportMargin - panelHeight;
      const top =
        belowTop + panelHeight <= window.innerHeight - linkEditorViewportMargin || aboveTop < linkEditorViewportMargin
          ? clampNumber(belowTop, linkEditorViewportMargin, Math.max(linkEditorViewportMargin, maxTop))
          : clampNumber(aboveTop, linkEditorViewportMargin, Math.max(linkEditorViewportMargin, maxTop));
      setLinkEditorPosition((current) =>
        current && current.left === left && current.top === top && current.width === panelWidth
          ? current
          : { left, top, width: panelWidth },
      );
    };

    const raf = window.requestAnimationFrame(updatePosition);
    const scroller = frameScrollContainerRef.current;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    scroller?.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      scroller?.removeEventListener("scroll", updatePosition);
    };
  }, [props.linkEditorOpen]);

  useEffect(() => {
    if (!props.linkEditorOpen) return;
    const doc = props.iframeRef.current?.contentDocument;
    if (!doc) return;
    const onFramePointerDown = () => props.onCloseLinkEditor();
    doc.addEventListener("pointerdown", onFramePointerDown, true);
    return () => doc.removeEventListener("pointerdown", onFramePointerDown, true);
  }, [props.frameRevision, props.iframeRef, props.linkEditorOpen, props.onCloseLinkEditor]);

  useEffect(() => {
    if (!props.linkEditorOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (linkEditorRef.current?.contains(event.target as Node) || linkEditorPanelRef.current?.contains(event.target as Node)) return;
      props.onCloseLinkEditor();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onCloseLinkEditor();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [props.linkEditorOpen, props.onCloseLinkEditor]);

  const linkEditorStyle: CSSProperties = linkEditorPosition
    ? { left: linkEditorPosition.left, top: linkEditorPosition.top, width: linkEditorPosition.width }
    : { visibility: "hidden" };
  const linkEditorPortal =
    props.linkEditorOpen && typeof document !== "undefined"
      ? createPortal(
          <form
            ref={linkEditorPanelRef}
            data-toolbar-skip-selection-preserve="true"
            className="fixed z-50 grid w-[300px] max-w-[calc(100vw-16px)] gap-1.5 rounded-lg border border-black/10 bg-white p-2 shadow-[0_12px_28px_rgba(0,0,0,0.14)]"
            style={linkEditorStyle}
            onSubmit={(event) => {
              event.preventDefault();
              props.onApplyLink(props.linkDraft);
            }}
          >
            <input
              className="h-7 w-full rounded-md border border-black/10 bg-white px-2 text-[11px] font-medium text-[#333] outline-none"
              value={props.linkDraft.text}
              onChange={(event) => props.onLinkDraftChange({ ...props.linkDraft, text: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder="Text"
              aria-label="Link text"
            />
            <div className="flex min-w-0 items-center gap-1">
              <input
                className="h-7 min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 text-[11px] font-medium text-[#333] outline-none"
                value={props.linkDraft.href}
                onChange={(event) => props.onLinkDraftChange({ ...props.linkDraft, href: event.currentTarget.value })}
                onMouseDown={(event) => event.stopPropagation()}
                placeholder="https://"
                aria-label="Link URL"
              />
              <button className="h-7 rounded-md bg-black px-2.5 text-[10px] font-semibold text-white" type="submit">
                Apply
              </button>
              {props.toolbarState.link ? (
                <button
                  className="h-7 rounded-md border border-black/10 bg-white px-2.5 text-[10px] font-semibold text-[#333]"
                  type="button"
                  onClick={props.onRemoveLink}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </form>,
          document.body,
        )
      : null;

  return (
    <>
    <ArtifactEditorFrame
      sidebar={
        <AgentConversationPanel
          activeSelectionText={props.activeSelectionText}
          artifactLabel="html"
          dirty={props.dirty}
          error={props.error || props.agentConversationError}
          items={props.agentConversationItems}
          localAgentProviders={props.localAgentProviders}
          loading={props.agentConversationLoading}
          runtimeProfiles={props.runtimeProfiles}
          selectedRuntimeProfileId={props.selectedRuntimeProfileId}
          sending={props.agentSending}
          onBackHome={props.onBackHome}
          onRuntimeProfileChange={props.onRuntimeProfileChange}
          onCancel={props.onCancelAgentRun}
          onSend={props.onSendAgentPrompt}
        />
      }
    >
      <section className="relative flex h-full min-h-0 flex-col bg-[#1f1f1f]">
        <ArtifactWorkspaceHeader
          title={props.runtime?.title ?? "Untitled Doc"}
          saveState={props.saveState}
          exportItems={[
            { label: "PDF", disabled: true, onSelect: () => undefined },
            { label: "DOCX", disabled: true, onSelect: () => undefined },
          ]}
        />

        <div className="relative min-h-0 flex-1">
          <div ref={frameScrollContainerRef} className="h-full overflow-x-hidden overflow-y-auto bg-[#2a2a2a] px-3 py-5 md:px-6 md:py-7">
            <HtmlEditorToolbar
              canCreateLink={canCreateLink}
              canRedo={canRedo}
              canUndo={canUndo}
              layoutMenuOpen={layoutMenuOpen}
              linkEditorRef={linkEditorRef}
              props={props}
              spacingMenuOpen={spacingMenuOpen}
              toolbarDisabled={toolbarDisabled}
              onLayoutMenuOpenChange={setLayoutMenuOpen}
              onSpacingMenuOpenChange={setSpacingMenuOpen}
            />

            {props.frameSrcDoc ? (
              <iframe
                key={props.frameRevision}
                ref={props.iframeRef}
                className="mx-auto block min-h-[860px] w-full max-w-[980px] overflow-clip rounded-[2px] border border-black/30 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
                style={{ height: frameHeight }}
                title={props.runtime?.title ?? "Runtime doc"}
                sandbox="allow-scripts allow-same-origin"
                scrolling="no"
                srcDoc={props.frameSrcDoc}
                onLoad={() => {
                  props.onFrameLoad();
                  scheduleHtmlFrameResize();
                }}
                onInput={() => {
                  props.onMutation("input", "User edited doc body");
                  scheduleHtmlFrameResize();
                }}
                onKeyUp={props.onSelection}
                onMouseUp={props.onSelection}
              />
            ) : (
              <div className="mx-auto grid min-h-[620px] max-w-[860px] place-items-center rounded border border-white/10 bg-[#202020] text-center text-white/42">
                Loading doc...
              </div>
            )}
          </div>
          <ArtifactAgentProcessingOverlay active={props.agentProcessing} />
        </div>
      </section>
    </ArtifactEditorFrame>
    {linkEditorPortal}
    </>
  );
}


function measureHtmlFrameContentHeight(doc: Document) {
  const body = doc.body;
  const view = doc.defaultView;
  const computed = view?.getComputedStyle(body);
  const contentBottom = measureBodyContentBottom(doc);
  const paddingBottom = Number.parseFloat(computed?.paddingBottom || "") || 0;
  const borderBottom = Number.parseFloat(computed?.borderBottomWidth || "") || 0;
  const marginBottom = Number.parseFloat(computed?.marginBottom || "") || 0;
  return Math.ceil(Math.max(minimumHtmlFrameHeight, contentBottom + (view?.scrollY ?? 0) + paddingBottom + borderBottom + marginBottom)) + 2;
}

function measureBodyContentBottom(doc: Document) {
  const bodyRect = doc.body.getBoundingClientRect();
  const elementBottom = Array.from(doc.body.querySelectorAll<HTMLElement>("body *")).reduce((max, element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return max;
    return Math.max(max, rect.bottom - bodyRect.top);
  }, 0);
  return Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, elementBottom);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
