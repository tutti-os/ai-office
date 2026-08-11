import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Loader2, Redo2, Undo2 } from "lucide-react";
import { scrollbarClass } from "@ai-app/ui/app-shell";
import { ArtifactAgentProcessingOverlay, ArtifactEditorWorkspace, type ArtifactSaveState as WorkspaceSaveState } from "@ai-app/ui/editor-frame";
import { editorToolbarStripClass, type ToolbarLayoutValue } from "@ai-app/ui/toolbar";
import type { DocumentRunTimelineItem, LocalAgentTargetStatus, RuntimeProfile } from "@ai-doc/shared";
import type { RuntimeState, SelectionState } from "../artifact/runtime/types";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { isMissingDocumentError } from "./documentLoadErrors";
import { HtmlEditorToolbar } from "./HtmlEditorToolbar";
import { HtmlTiptapEditorSurface, useHtmlTiptapEditor } from "./HtmlTiptapEditorSurface";
import { artifactEditorCopy } from "../i18n/copy";
import { useI18n } from "../i18n";
import type { Alignment, EditorStats, HeadingTag, ImageAttributes, InlineFormatTag, LinkDraft, ListKind, ToolbarState } from "./runtimeWorkbenchTypes";

const linkEditorPanelWidth = 300;
const linkEditorViewportMargin = 8;
const linkEditorAnchorGap = 8;
type LinkEditorPosition = {
  left: number;
  top: number;
  width: number;
};

export function DocumentLoadingScreen(props: {
  error: string;
  loading: boolean;
  title?: string;
  onBackHome?: () => void;
}) {
  const { t } = useI18n();
  const missing = Boolean(props.error && isMissingDocumentError(props.error));
  const headerTitle = missing
    ? props.title?.trim() || t("editor.documentNotFound")
    : props.title?.trim() || t("editor.loadingDoc");

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-[#E6DDCD] text-[#2A2620]">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#B8A07C]/45 px-5">
        {props.onBackHome ? (
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold text-[#5C5346] transition hover:bg-[#B8A07C]/20 hover:text-[#2A2620]"
            onClick={props.onBackHome}
          >
            {t("editor.backHome")}
          </button>
        ) : null}
        <div className="min-w-0 truncate text-[13px] font-semibold text-[#2A2620]">{headerTitle}</div>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center bg-[#E6DDCD] px-6 text-center">
        {missing ? (
          <div className="w-[min(480px,calc(100%_-_32px))] rounded-xl border border-[#B8A07C]/35 bg-[#F4EEE3] px-6 py-7 text-left shadow-sm">
            <h2 className="m-0 text-[15px] font-extrabold leading-snug text-[#2A2620]">{t("editor.documentNotFound")}</h2>
            <p className="mt-2 mb-0 text-[13px] font-medium leading-relaxed text-[#5C5346]">{t("editor.documentMissingDetail")}</p>
          </div>
        ) : (
          <div className="max-w-[360px] text-[13px] font-semibold text-[#8B8275]">
            {props.error ? (
              props.error
            ) : (
              <span className="inline-flex items-center gap-2">
                {props.loading ? <Loader2 className="animate-spin" size={16} /> : null}
                {t("editor.loadingDocProgress")}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export type HtmlEditorScreenProps = {
  activeSelectionText: string;
  dirty: boolean;
  pdfExportAvailable: boolean;
  pdfExporting: boolean;
  projectId: string | null;
  error: string;
  exportNotice: string;
  exportRevealPath?: string;
  editorStats: EditorStats;
  agentConversationItems: DocumentRunTimelineItem[];
  agentConversationLoading: boolean;
  agentConversationError: string;
  agentSending: boolean;
  localAgentTargets: LocalAgentTargetStatus[];
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  linkDraft: LinkDraft;
  linkEditorOpen: boolean;
  loading: boolean;
  runtime: RuntimeState | null;
  saveState: WorkspaceSaveState;
  agentProcessing: boolean;
  readOnly: boolean;
  showExport?: boolean;
  toolbarDisabled: boolean;
  toolbarState: ToolbarState;
  onAlignment: (alignment: Alignment) => void;
  onApplyLink: (draft: LinkDraft) => void;
  onBackHome: () => void;
  onTitleChange?: (title: string) => void | Promise<void>;
  onTiptapBodyChange: (bodyInnerHTML: string, selection: SelectionState | null) => void;
  onTiptapSelectionChange: (selection: SelectionState | null, toolbarState?: ToolbarState) => void;
  onToolbarInteractionStart: () => void;
  onExportHtml: () => Promise<void>;
  onExportPdf: () => Promise<void>;
  onDismissExportNotice: () => void;
  onOpenExportLocation: () => void;
  onOpenProjectLocation?: () => void;
  onCloseLinkEditor: () => void;
  onBackColor: (color: string) => void;
  onForeColor: (color: string) => void;
  onUploadImageFile: (file: File) => Promise<ImageAttributes>;
  onLineHeight: (lineHeight: string) => void;
  onLetterSpacing: (letterSpacing: string) => void;
  onLayoutChange: (attributes: Partial<ToolbarLayoutValue>) => void;
  onCreateLink: () => void;
  onFontFamily: (fontFamily: string) => void;
  onFontSize: (fontSize: string) => void;
  onFormat: (tagName: InlineFormatTag) => void;
  onHeading: (tagName: HeadingTag) => void;
  onIndent: () => void;
  onChecklist: () => void;
  onList: (kind: ListKind) => void;
  onLinkDraftChange: (value: LinkDraft) => void;
  onLoadFixture: () => void;
  onMoreAction: (action: string) => void;
  onOutdent: () => void;
  onPickImage: () => void;
  onSendAgentPrompt: (prompt: string) => Promise<void>;
  onRuntimeProfileChange: (profileId: string) => void;
  onCancelAgentRun: (runId: string) => Promise<void>;
  onRemoveLink: () => void;
  onRedo: () => void;
  onUndo: () => void;
};

export function HtmlEditorScreen(props: HtmlEditorScreenProps) {
  const { t } = useI18n();
  const baseToolbarDisabled = props.toolbarDisabled || props.readOnly;
  const [spacingMenuOpen, setSpacingMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const linkEditorRef = useRef<HTMLDivElement | null>(null);
  const linkEditorPanelRef = useRef<HTMLFormElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const editorScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const toolbarHostRef = useRef<HTMLDivElement | null>(null);
  const [toolbarFocusActive, setToolbarFocusActive] = useState(false);
  const [linkEditorPosition, setLinkEditorPosition] = useState<LinkEditorPosition | null>(null);
  const tiptapEditor = useHtmlTiptapEditor({
    props,
    toolbarDisabled: baseToolbarDisabled,
    onRequestLinkEditor: (draft) => {
      props.onLinkDraftChange(draft);
      props.onCreateLink();
    },
    onRequestImageFile: () => {
      if (props.readOnly) return;
      const fileInput = imageFileInputRef.current;
      if (!fileInput) return;
      fileInput.value = "";
      fileInput.click();
    },
  });
  const toolbarActive = tiptapEditor.focused || toolbarFocusActive || props.linkEditorOpen;
  const toolbarDisabled = baseToolbarDisabled || !toolbarActive;

  const handleTiptapImageFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0] ?? null;
    fileInput.value = "";
    if (!file) return;
    const image = await props.onUploadImageFile(file);
    tiptapEditor.insertImage({ src: image.src, alt: image.alt });
  };

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
    const scroller = editorScrollContainerRef.current;
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

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (toolbarHostRef.current?.contains(target) || linkEditorPanelRef.current?.contains(target))) {
        setToolbarFocusActive(true);
        return;
      }
      setToolbarFocusActive(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  const linkEditorStyle: CSSProperties = linkEditorPosition
    ? { left: linkEditorPosition.left, top: linkEditorPosition.top, width: linkEditorPosition.width }
    : { visibility: "hidden" };
  const linkEditorPortal =
    props.linkEditorOpen && typeof document !== "undefined"
      ? createPortal(
          <form
            ref={linkEditorPanelRef}
            data-toolbar-skip-selection-preserve="true"
            className="fixed z-50 grid w-[300px] max-w-[calc(100vw-16px)] gap-1.5 rounded-[16px] border border-[#B8A07C]/55 bg-[#F4EFE6] p-2 shadow-[0_18px_46px_rgba(0,0,0,0.16)]"
            style={linkEditorStyle}
            onSubmit={(event) => {
              event.preventDefault();
              tiptapEditor.toolbarProps.onApplyLink(props.linkDraft);
            }}
          >
            <input
              className="h-7 w-full rounded-[10px] border border-[#B8A07C]/50 bg-[#E6DDCD]/55 px-2 text-[11px] font-medium text-[#2A2620] outline-none placeholder:text-[#8B8275]"
              value={props.linkDraft.text}
              onChange={(event) => props.onLinkDraftChange({ ...props.linkDraft, text: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder={t("editor.linkText")}
              aria-label={t("editor.linkTextAria")}
            />
            <div className="flex min-w-0 items-center gap-1">
              <input
                className="h-7 min-w-0 flex-1 rounded-[10px] border border-[#B8A07C]/50 bg-[#E6DDCD]/55 px-2 text-[11px] font-medium text-[#2A2620] outline-none placeholder:text-[#8B8275]"
                value={props.linkDraft.href}
                onChange={(event) => props.onLinkDraftChange({ ...props.linkDraft, href: event.currentTarget.value })}
                onMouseDown={(event) => event.stopPropagation()}
                placeholder="https://"
                aria-label={t("editor.linkUrlAria")}
              />
              <button className="h-7 rounded-[10px] bg-[#2A2620] px-2.5 text-[10px] font-semibold text-[#F4EFE6]" type="submit">
                {t("editor.apply")}
              </button>
              {tiptapEditor.toolbarState.link ? (
                <button
                  className="h-7 rounded-[10px] border border-[#B8A07C]/50 bg-[#F4EFE6] px-2.5 text-[10px] font-semibold text-[#2A2620]"
                  type="button"
                  onClick={tiptapEditor.toolbarProps.onRemoveLink}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {t("editor.remove")}
                </button>
              ) : null}
            </div>
          </form>,
          document.body,
        )
      : null;

  return (
    <>
      <ArtifactEditorWorkspace
        title={props.runtime?.title ?? t("editor.untitledDoc")}
        saveState={props.saveState}
        agentWorking={props.agentProcessing}
        agentOverlayActive={false}
        exportNotice={props.exportNotice}
        exportRevealPath={props.exportRevealPath}
        copy={artifactEditorCopy(t)}
        bodyClassName="flex flex-col"
        tone="lumen"
        onBackHome={props.onBackHome}
        onTitleChange={props.onTitleChange}
        onDismissExportNotice={props.onDismissExportNotice}
        onOpenExportLocation={props.onOpenExportLocation}
        onOpenProjectLocation={props.onOpenProjectLocation}
        showExport={props.showExport}
        exportItems={[
          {
            label: t("editor.docxComingSoon"),
            disabled: true,
            onSelect: () => undefined,
          },
          {
            label: props.pdfExporting ? t("editor.pdfExporting") : "PDF",
            disabled: props.pdfExporting || !props.pdfExportAvailable,
            loading: props.pdfExporting,
            onSelect: () => props.onExportPdf(),
          },
        ]}
        sidebar={
          <AgentConversationPanel
            activeSelectionText={props.activeSelectionText}
            artifactLabel="html"
            dirty={props.dirty}
            error={props.error || props.agentConversationError}
            items={props.agentConversationItems}
            localAgentTargets={props.localAgentTargets}
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
        <input
          ref={imageFileInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          onChange={(event) => void handleTiptapImageFileInputChange(event)}
        />
        <div
          ref={toolbarHostRef}
          className={editorToolbarStripClass}
          onFocusCapture={() => setToolbarFocusActive(true)}
          onBlurCapture={() => {
            window.requestAnimationFrame(() => {
              const activeElement = document.activeElement;
              if (activeElement instanceof Node && toolbarHostRef.current?.contains(activeElement)) return;
              setToolbarFocusActive(false);
            });
          }}
          onMouseDownCapture={() => setToolbarFocusActive(true)}
        >
          <HtmlEditorToolbar
            canCreateLink={tiptapEditor.canCreateLink}
            layoutMenuOpen={layoutMenuOpen}
            linkEditorRef={linkEditorRef}
            props={tiptapEditor.toolbarProps}
            spacingMenuOpen={spacingMenuOpen}
            toolbarDisabled={toolbarDisabled}
            onLayoutMenuOpenChange={setLayoutMenuOpen}
            onSpacingMenuOpenChange={setSpacingMenuOpen}
          />
        </div>
        <div ref={editorScrollContainerRef} className={`relative h-full overflow-x-hidden overflow-y-auto bg-[#EEE9DD] px-3 py-5 md:px-6 md:py-7 ${scrollbarClass}`}>
          {props.runtime ? (
            <HtmlTiptapEditorSurface editor={tiptapEditor.editor} projectId={props.projectId} runtime={props.runtime} />
          ) : (
            <div className="mx-auto grid min-h-[620px] max-w-[860px] place-items-center rounded-[20px] border border-[#B8A07C]/55 bg-[#F4EFE6]/55 text-center text-[#8B8275]">
              {t("editor.loadingDocProgress")}
            </div>
          )}
          <ArtifactAgentProcessingOverlay active={props.agentProcessing} className="opacity-45" />
        </div>
        <HtmlHistoryToolbar
          canRedo={tiptapEditor.canRedo}
          canUndo={tiptapEditor.canUndo}
          onRedo={props.onRedo}
          onToolbarInteractionStart={tiptapEditor.toolbarProps.onToolbarInteractionStart}
          onUndo={props.onUndo}
        />
      </ArtifactEditorWorkspace>
      {linkEditorPortal}
    </>
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function HtmlHistoryToolbar(props: {
  canRedo: boolean;
  canUndo: boolean;
  onRedo: () => void;
  onToolbarInteractionStart: () => void;
  onUndo: () => void;
}) {
  return (
    <div
      className="absolute bottom-4 left-4 z-30 inline-flex items-center gap-1 rounded-[12px] border border-[#B8A07C]/30 bg-[#F9F4EC] p-1 text-[#2A2620] "
      data-toolbar-skip-selection-preserve="true"
      aria-label="History tools"
      onMouseDownCapture={(event) => {
        props.onToolbarInteractionStart();
        event.preventDefault();
      }}
      onPointerDownCapture={props.onToolbarInteractionStart}
    >
      <button
        className="grid size-7 place-items-center rounded-[8px] border-0 bg-transparent text-[#2A2620]/72 outline-none transition hover:not-disabled:bg-[#EEE8DC]/70 hover:not-disabled:text-[#5C6B50] disabled:cursor-default disabled:text-[#8B8275] disabled:opacity-45"
        type="button"
        aria-label="Undo"
        title="Undo"
        disabled={!props.canUndo}
        onClick={props.onUndo}
      >
        <Undo2 size={18} />
      </button>
      <button
        className="grid size-7 place-items-center rounded-[8px] border-0 bg-transparent text-[#2A2620]/72 outline-none transition hover:not-disabled:bg-[#EEE8DC]/70 hover:not-disabled:text-[#5C6B50] disabled:cursor-default disabled:text-[#8B8275] disabled:opacity-45"
        type="button"
        aria-label="Redo"
        title="Redo"
        disabled={!props.canRedo}
        onClick={props.onRedo}
      >
        <Redo2 size={18} />
      </button>
    </div>
  );
}
