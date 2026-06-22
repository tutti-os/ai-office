import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type CompositionEvent as ReactCompositionEvent, type FC, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  MDXEditor,
  $isImageNode,
  NESTED_EDITOR_UPDATED_COMMAND,
  type MDXEditorMethods,
  activeEditor$,
  addTopAreaChild$,
  createActiveEditorSubscription$,
  editorInTable$,
  applyFormat$,
  applyListType$,
  codeBlockPlugin,
  type CodeBlockEditorProps,
  currentBlockType$,
  currentFormat$,
  currentListType$,
  convertSelectionToNode$,
  headingsPlugin,
  imagePlugin,
  insertCodeBlock$,
  insertImage$,
  insertMarkdown$,
  insertTable$,
  insertThematicBreak$,
  lexical,
  linkDialogPlugin,
  linkDialogState$,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  realmPlugin,
  removeLink$,
  tablePlugin,
  thematicBreakPlugin,
  useCodeBlockEditorContext,
  useCellValue,
  useCellValues,
  usePublisher,
  type ImageNode,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from "@lexical/rich-text";
import { AlignCenter, AlignLeft, AlignRight, Bold, Code2, Image, Italic, Link2, List, ListOrdered, ListTodo, Minus, Quote, Redo2, Replace, Strikethrough, Table2, Undo2 } from "lucide-react";
import { scrollbarClass } from "@ai-app/ui/app-shell";
import { ArtifactAgentProcessingOverlay, ArtifactExportToast, ArtifactWorkspaceHeader } from "@ai-app/ui/editor-frame";
import type { ArtifactSaveState } from "@ai-app/ui/editor-frame";
import { IconButtonLight, Toolbar, ToolbarDivider, ToolbarGroup, ToolbarRow, ToolbarSelect } from "@ai-app/ui/toolbar";
import type { MarkdownRuntimeState, MarkdownSelection } from "../artifact/markdownArtifactAdapter";
import { uploadProjectAsset } from "../api/projects";
import { markdownParagraphCount, markdownWordCount } from "./documentWorkbenchContent";

type MarkdownEditorProps = {
  runtime: MarkdownRuntimeState;
  projectId: string | null;
  dirty: boolean;
  exportNotice: string;
  saveState: ArtifactSaveState;
  loading: boolean;
  agentProcessing: boolean;
  readOnly: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onChange: (content: string, selection: MarkdownSelection) => void;
  onExportDocx: (markdown: string) => Promise<void>;
  onExportMarkdown: (markdown: string) => Promise<void>;
  onExportPdf: (markdown: string) => Promise<void>;
  onDismissExportNotice: () => void;
  onOpenExportLocation: () => void;
  onBackHome: () => void;
  pdfExportAvailable: boolean;
  pdfExporting: boolean;
  onPendingTableCellEditChange: (pending: boolean) => void;
  onSelectionChange: (selection: MarkdownSelection) => void;
  onTableCellCommitterChange: (committer: (() => boolean) | null) => void;
};

type MarkdownLinkDraft = {
  text: string;
  href: string;
};

type MarkdownLinkPosition = {
  left: number;
  top: number;
  width: number;
};

const markdownLinkPanelWidth = 300;
const markdownLinkViewportMargin = 8;
const markdownLinkAnchorGap = 8;
const markdownImageCenterTitleToken = "ai-md-align-center";
const markdownImageRightTitleToken = "ai-md-align-right";
type MarkdownImageAlignment = "left" | "center" | "right";
type MarkdownEditorStateSnapshot = {
  toJSON: () => { root: unknown };
};
type MarkdownSelectedImageState = {
  alignment: MarkdownImageAlignment;
  nodeKey: string;
};
type MarkdownTableCellEditor = {
  dispatchCommand: (command: typeof NESTED_EDITOR_UPDATED_COMMAND, payload: undefined) => boolean;
  getEditorState: () => MarkdownEditorStateSnapshot;
  getRootElement: () => HTMLElement | null;
  registerUpdateListener: (listener: (payload: { editorState: MarkdownEditorStateSnapshot }) => void) => () => void;
};
const MarkdownToolbarContext = createContext<{
  active: boolean;
  canRedo: boolean;
  canUndo: boolean;
  projectId: string | null;
  readOnly: boolean;
  onToolbarInteractionStart: () => void;
  onRedo: () => void;
  runProgrammaticChange: <T>(mutation: () => T) => T | undefined;
  onUndo: () => void;
}>({
  active: false,
  canRedo: false,
  canUndo: false,
  projectId: null,
  readOnly: false,
  onToolbarInteractionStart: () => undefined,
  onRedo: () => undefined,
  runProgrammaticChange: () => undefined,
  onUndo: () => undefined,
});

export function MarkdownEditor(props: MarkdownEditorProps) {
  const editorRef = useRef<MDXEditorMethods | null>(null);
  const markdownRef = useRef(props.runtime.content);
  const activeSelectionRangeRef = useRef<Range | null>(null);
  const lastMarkdownSelectionRef = useRef<MarkdownSelection | null>(null);
  const activeTableCellEditorRef = useRef<MarkdownTableCellEditor | null>(null);
  const pendingTableCellEditRef = useRef(false);
  // Toolbar/plugin mutations update Lexical nodes first; this bridge is the single
  // place that promotes those editor-state changes into runtime content.
  const programmaticChangePendingRef = useRef(false);
  const programmaticCommitFrameRef = useRef<number | null>(null);
  const markdownCompositionActiveRef = useRef(false);
  const markdownCompositionDraftRef = useRef<string | null>(null);
  const [toolbarActive, setToolbarActive] = useState(false);

  const setPendingTableCellEdit = useCallback(
    (pending: boolean) => {
      if (pendingTableCellEditRef.current === pending) return;
      pendingTableCellEditRef.current = pending;
      props.onPendingTableCellEditChange(pending);
    },
    [props.onPendingTableCellEditChange],
  );

  const commitPendingTableCellEdit = useCallback(() => {
    const editor = activeTableCellEditorRef.current;
    if (!editor || !pendingTableCellEditRef.current) return false;
    editor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined);
    setPendingTableCellEdit(false);
    return true;
  }, [setPendingTableCellEdit]);

  const commitMarkdownRuntimeChange = useCallback(() => {
    if (props.readOnly) {
      programmaticChangePendingRef.current = false;
      return false;
    }
    const editor = editorRef.current;
    const markdown = normalizeMarkdownEditorOutput(editor?.getMarkdown() ?? markdownRef.current);
    if (markdown === markdownRef.current) return false;
    markdownRef.current = markdown;
    programmaticChangePendingRef.current = false;
    const selection = selectionFromEditor(editor, markdown, lastMarkdownSelectionRef.current);
    lastMarkdownSelectionRef.current = selection;
    setPendingTableCellEdit(false);
    props.onSelectionChange(selection);
    props.onChange(markdown, selection);
    return true;
  }, [props, setPendingTableCellEdit]);

  const scheduleProgrammaticCommit = useCallback(
    (attempt = 0) => {
      if (programmaticCommitFrameRef.current !== null) window.cancelAnimationFrame(programmaticCommitFrameRef.current);
      programmaticCommitFrameRef.current = window.requestAnimationFrame(() => {
        programmaticCommitFrameRef.current = null;
        const committed = commitMarkdownRuntimeChange();
        if (committed || !programmaticChangePendingRef.current) return;
        if (attempt < 5) {
          scheduleProgrammaticCommit(attempt + 1);
          return;
        }
        programmaticChangePendingRef.current = false;
      });
    },
    [commitMarkdownRuntimeChange],
  );

  const runProgrammaticChange = useCallback(
    <T,>(mutation: () => T) => {
      if (props.readOnly) return undefined;
      programmaticChangePendingRef.current = true;
      const result = mutation();
      scheduleProgrammaticCommit();
      return result;
    },
    [props.readOnly, scheduleProgrammaticCommit],
  );

  const plugins = useMemo(
    () => [
      markdownToolbarPlugin(),
      markdownTableCellPendingPlugin({
        activeTableCellEditorRef,
        onPendingChange: setPendingTableCellEdit,
      }),
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4, 5, 6] }),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin({ showLinkTitleField: false }),
      tablePlugin(),
      imagePlugin({
        imagePreviewHandler: (imageSource) => Promise.resolve(markdownImagePreviewUrl(props.projectId, imageSource)),
        imageUploadHandler: (file) => uploadMarkdownImageAsset(props.projectId, file),
        EditImageToolbar: MarkdownImageReplaceToolbar as unknown as FC<{}>,
      }),
      codeBlockPlugin({
        defaultCodeBlockLanguage: "text",
        codeBlockEditorDescriptors: [
          {
            priority: 0,
            match: () => true,
            Editor: PlainMarkdownCodeBlockEditor,
          },
        ],
      }),
      markdownShortcutPlugin(),
    ],
    [props.projectId, setPendingTableCellEdit],
  );

  useEffect(() => {
    props.onTableCellCommitterChange(commitPendingTableCellEdit);
    return () => props.onTableCellCommitterChange(null);
  }, [commitPendingTableCellEdit, props.onTableCellCommitterChange]);

  useEffect(() => {
    if (markdownCompositionActiveRef.current) return;
    markdownRef.current = props.runtime.content;
    programmaticChangePendingRef.current = false;
    if (programmaticCommitFrameRef.current !== null) {
      window.cancelAnimationFrame(programmaticCommitFrameRef.current);
      programmaticCommitFrameRef.current = null;
    }
    activeSelectionRangeRef.current = null;
    lastMarkdownSelectionRef.current = null;
    clearMarkdownPersistentSelectionHighlight();
    const editor = editorRef.current;
    if (!editor || editor.getMarkdown() === props.runtime.content) return;
    editor.setMarkdown(props.runtime.content);
  }, [props.runtime.content, props.runtime.revision]);

  useEffect(() => {
    return () => {
      if (programmaticCommitFrameRef.current !== null) window.cancelAnimationFrame(programmaticCommitFrameRef.current);
    };
  }, []);

  const syncSelection = useCallback(() => {
    if (markdownCompositionActiveRef.current) return;
    const editor = editorRef.current;
    const markdown = editor?.getMarkdown() ?? markdownRef.current;
    const selection = selectionFromEditor(editor, markdown, lastMarkdownSelectionRef.current);
    const range = markdownSelectionRangeFromDocument();
    if (selection.selectedText && range) {
      activeSelectionRangeRef.current = range;
    } else if (!selection.selectedText) {
      activeSelectionRangeRef.current = null;
      clearMarkdownPersistentSelectionHighlight();
    }
    lastMarkdownSelectionRef.current = selection;
    props.onSelectionChange(selection);
  }, [props]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      const anchorNode = selection?.anchorNode ?? null;
      if (!anchorNode) return;
      const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
      if (!anchorElement?.closest(".markdown-preview")) return;
      clearMarkdownPersistentSelectionHighlight();
      syncSelection();
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [syncSelection]);

  useEffect(() => {
    return () => clearMarkdownPersistentSelectionHighlight();
  }, []);

  const activateToolbar = useCallback(() => setToolbarActive(true), []);
  const preserveMarkdownSelectionForToolbar = useCallback(() => {
    if (markdownCompositionActiveRef.current) return;
    const editor = editorRef.current;
    const markdown = editor?.getMarkdown() ?? markdownRef.current;
    lastMarkdownSelectionRef.current = selectionFromEditor(editor, markdown, lastMarkdownSelectionRef.current);
  }, []);
  const handleEditorBlur = useCallback(() => {
    window.requestAnimationFrame(() => {
      const range = activeSelectionRangeRef.current;
      if (range && !isMarkdownEditorFocusInside()) setMarkdownPersistentSelectionHighlight(range);
    });
  }, []);

  const handleEditorKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    activateToolbar();
    const historyOffset = markdownHistoryShortcutOffset(event);
    if (historyOffset) {
      event.preventDefault();
      event.stopPropagation();
      if (!props.readOnly) {
        if (historyOffset === -1) props.onUndo();
        else props.onRedo();
      }
      return;
    }
    if (props.readOnly) {
      if (isMarkdownEditingKey(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (isMarkdownComposingKeyEvent(event)) return;
    if (event.key !== "Tab") return;
    event.preventDefault();
    const markdown = editorRef.current?.getMarkdown() ?? markdownRef.current;
    const selection = selectionFromEditor(editorRef.current, markdown, lastMarkdownSelectionRef.current);
    const nextMarkdown = applyMarkdownLineIndent(markdown, selection, event.shiftKey);
    if (nextMarkdown === markdown) return;
    markdownRef.current = nextMarkdown;
    editorRef.current?.setMarkdown(nextMarkdown);
    const nextSelection = selectionFromOffsets(nextMarkdown, selection.start, selection.end);
    lastMarkdownSelectionRef.current = nextSelection;
    props.onChange(nextMarkdown, nextSelection);
  }, [activateToolbar, props]);
  const handleEditorClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (blockMarkdownReadOnlyTableChromeEvent(event, props.readOnly)) return;
    preventMarkdownLinkNavigation(event);
    if (props.readOnly) return;
    focusMarkdownTableCellEditor(event);
  }, [props.readOnly]);
  const handleEditorAuxClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    preventMarkdownLinkNavigation(event);
  }, []);
  const handleEditorMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (blockMarkdownReadOnlyTableChromeEvent(event, props.readOnly)) return;
    clearMarkdownPersistentSelectionHighlight();
    activateToolbar();
  }, [activateToolbar, props.readOnly]);

  const commitNormalizedMarkdownChange = useCallback(
    (normalizedMarkdown: string, initialMarkdownNormalize: boolean) => {
      if (props.readOnly) {
        if (normalizedMarkdown !== markdownRef.current) editorRef.current?.setMarkdown(markdownRef.current);
        props.onSelectionChange(selectionFromEditor(editorRef.current, markdownRef.current, lastMarkdownSelectionRef.current));
        return;
      }
      markdownRef.current = normalizedMarkdown;
      const selection = selectionFromEditor(editorRef.current, normalizedMarkdown, lastMarkdownSelectionRef.current);
      lastMarkdownSelectionRef.current = selection;
      props.onSelectionChange(selection);
      if (!initialMarkdownNormalize || programmaticChangePendingRef.current) {
        programmaticChangePendingRef.current = false;
        setPendingTableCellEdit(false);
        props.onChange(normalizedMarkdown, selection);
      }
    },
    [props, setPendingTableCellEdit],
  );

  const handleChange = useCallback(
    (markdown: string, initialMarkdownNormalize: boolean) => {
      const normalizedMarkdown = normalizeMarkdownEditorOutput(markdown);
      if (markdownCompositionActiveRef.current) {
        markdownCompositionDraftRef.current = normalizedMarkdown;
        return;
      }
      commitNormalizedMarkdownChange(normalizedMarkdown, initialMarkdownNormalize);
    },
    [commitNormalizedMarkdownChange],
  );

  const handleMarkdownCompositionStart = useCallback((event: ReactCompositionEvent<HTMLDivElement>) => {
    if (isMarkdownNestedTextInput(event.target)) return;
    markdownCompositionActiveRef.current = true;
    markdownCompositionDraftRef.current = null;
  }, []);

  const handleMarkdownCompositionEnd = useCallback((event: ReactCompositionEvent<HTMLDivElement>) => {
    if (isMarkdownNestedTextInput(event.target)) return;
    if (!markdownCompositionActiveRef.current) return;
    markdownCompositionActiveRef.current = false;
    const markdown = normalizeMarkdownEditorOutput(editorRef.current?.getMarkdown() ?? markdownCompositionDraftRef.current ?? markdownRef.current);
    markdownCompositionDraftRef.current = null;
    commitNormalizedMarkdownChange(markdown, false);
  }, [commitNormalizedMarkdownChange]);

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-[#E6DDCD]">
      <ArtifactWorkspaceHeader
        tone="lumen"
        title={props.runtime.title || "Untitled Markdown"}
        saveState={props.saveState}
        agentWorking={props.agentProcessing}
        onBackHome={props.onBackHome}
        stats={[
          `${markdownWordCount(props.runtime.content)} words`,
          `${markdownParagraphCount(props.runtime.content)} blocks`,
        ]}
        exportItems={[
          {
            label: "DOCX (coming soon)",
            disabled: true,
            onSelect: () => undefined,
          },
          {
            label: props.pdfExporting ? "PDF exporting..." : "PDF",
            disabled: props.pdfExporting || !props.pdfExportAvailable,
            onSelect: () => void props.onExportPdf(normalizeMarkdownEditorOutput(editorRef.current?.getMarkdown() ?? markdownRef.current)),
          },
        ]}
      />
      <ArtifactExportToast message={props.exportNotice} onClose={props.onDismissExportNotice} onOpenLocation={props.onOpenExportLocation} />

      <div className="relative min-h-0 flex-1">
        <div className={`h-full overflow-x-hidden overflow-y-auto bg-[linear-gradient(90deg,rgba(42,38,32,0.045)_1px,transparent_1px),linear-gradient(180deg,rgba(42,38,32,0.04)_1px,transparent_1px)] bg-[size:28px_28px] px-3 py-5 md:px-6 md:py-7 ${scrollbarClass}`}>
          <div
            className="mx-auto min-h-[760px] w-full max-w-[1120px]"
            onBlurCapture={handleEditorBlur}
            onAuxClickCapture={handleEditorAuxClick}
            onClickCapture={handleEditorClick}
            onFocusCapture={() => {
              clearMarkdownPersistentSelectionHighlight();
              activateToolbar();
            }}
            onCompositionStartCapture={handleMarkdownCompositionStart}
            onCompositionEndCapture={handleMarkdownCompositionEnd}
            onKeyDownCapture={handleEditorKeyDown}
            onBeforeInputCapture={(event) => blockMarkdownReadOnlyMutation(event, props.readOnly)}
            onPasteCapture={(event) => blockMarkdownReadOnlyMutation(event, props.readOnly)}
            onCutCapture={(event) => blockMarkdownReadOnlyMutation(event, props.readOnly)}
            onDropCapture={(event) => blockMarkdownReadOnlyMutation(event, props.readOnly)}
            onKeyUpCapture={syncSelection}
            onMouseDownCapture={handleEditorMouseDown}
            onMouseUpCapture={syncSelection}
          >
            <MarkdownToolbarContext.Provider
              value={{
                active: toolbarActive,
                canRedo: !props.readOnly && props.runtime.history.currentIndex < props.runtime.history.entries.length - 1,
                canUndo: !props.readOnly && props.runtime.history.currentIndex > 0,
                projectId: props.projectId,
                readOnly: props.readOnly,
                onToolbarInteractionStart: preserveMarkdownSelectionForToolbar,
                onRedo: props.onRedo,
                runProgrammaticChange,
                onUndo: props.onUndo,
              }}
            >
              <MDXEditor
                ref={editorRef}
                markdown={props.runtime.content}
                className={`ai-markdown-editor-page flex min-h-[760px] flex-col bg-transparent text-[#202124]${props.readOnly ? " ai-markdown-editor-readonly" : ""}`}
                contentEditableClassName="markdown-preview ai-markdown-content min-h-[780px] overflow-visible !px-12 !py-9 text-[#202124] outline-none max-[760px]:!px-7 max-[760px]:!py-7 md:!px-18 md:!py-10"
                onChange={handleChange}
                plugins={plugins}
                readOnly={false}
                spellCheck
              />
            </MarkdownToolbarContext.Provider>
          </div>
        </div>
        <ArtifactAgentProcessingOverlay active={props.agentProcessing} />
      </div>
    </section>
  );
}

type MarkdownBlockKind = "p" | "h1" | "h2" | "h3" | "h4" | "blockquote";
const markdownPersistentSelectionHighlightName = "ai-agent-markdown-selection";
const markdownPersistentSelectionHighlightStyleId = "ai-doc-markdown-persistent-selection-highlight";

type CssHighlightRegistry = {
  delete: (name: string) => void;
  set: (name: string, highlight: unknown) => void;
};

type CssHighlightConstructor = new (...ranges: Range[]) => unknown;

function blockMarkdownReadOnlyMutation(event: { preventDefault: () => void; stopPropagation: () => void }, readOnly: boolean) {
  if (!readOnly) return;
  event.preventDefault();
  event.stopPropagation();
}

function blockMarkdownReadOnlyTableChromeEvent(event: { target: EventTarget | null; preventDefault: () => void; stopPropagation: () => void }, readOnly: boolean) {
  if (!readOnly || !isMarkdownTableChromeTarget(event.target)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function preventMarkdownLinkNavigation(event: MouseEvent<HTMLDivElement>) {
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest("a[href]");
  if (!link?.closest(".markdown-preview")) return;
  event.preventDefault();
}

function isMarkdownTableChromeTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('[data-tool-cell="true"], [class*="toolCell"], [class*="tableToolsColumn"], button[class*="tableRowEditorTrigger"], button[class*="tableColumnEditorTrigger"]'));
}

function isMarkdownEditingKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.key.length === 1) return true;
  return event.key === "Backspace" || event.key === "Delete" || event.key === "Enter" || event.key === "Tab";
}

function markdownHistoryShortcutOffset(event: KeyboardEvent<HTMLDivElement>): -1 | 1 | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "y") return 1;
  if (key === "z") return event.shiftKey ? 1 : -1;
  return null;
}

function isMarkdownComposingKeyEvent(event: KeyboardEvent<HTMLDivElement>) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

function markdownSelectionRangeFromDocument() {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  if (!ancestor?.closest(".markdown-preview")) return null;
  return range.cloneRange();
}

function isMarkdownEditorFocusInside() {
  const activeElement = document.activeElement;
  return Boolean(activeElement instanceof Element && activeElement.closest(".ai-markdown-editor-page"));
}

function isMarkdownNestedTextInput(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select"));
}

function setMarkdownPersistentSelectionHighlight(range: Range) {
  const registry = markdownHighlightRegistry();
  const HighlightConstructor = markdownHighlightConstructor();
  if (!registry || !HighlightConstructor) return;
  ensureMarkdownPersistentSelectionHighlightStyle();
  registry.set(markdownPersistentSelectionHighlightName, new HighlightConstructor(range));
}

function clearMarkdownPersistentSelectionHighlight() {
  markdownHighlightRegistry()?.delete(markdownPersistentSelectionHighlightName);
}

function markdownHighlightRegistry() {
  return (CSS as typeof CSS & { highlights?: CssHighlightRegistry }).highlights ?? null;
}

function markdownHighlightConstructor() {
  return (globalThis as typeof globalThis & { Highlight?: CssHighlightConstructor }).Highlight ?? null;
}

function ensureMarkdownPersistentSelectionHighlightStyle() {
  if (document.getElementById(markdownPersistentSelectionHighlightStyleId)) return;
  const style = document.createElement("style");
  style.id = markdownPersistentSelectionHighlightStyleId;
  style.textContent = `
    ::highlight(${markdownPersistentSelectionHighlightName}) {
      background-color: rgba(148, 163, 184, 0.36);
      color: inherit;
    }
  `;
  document.head.append(style);
}

function markdownToolbarPlugin() {
  return realmPlugin({
    init(realm) {
      realm.pub(addTopAreaChild$, MarkdownToolbarAdapter);
    },
  })();
}

function markdownTableCellPendingPlugin(params: {
  activeTableCellEditorRef: RefObject<MarkdownTableCellEditor | null>;
  onPendingChange: (pending: boolean) => void;
}) {
  return realmPlugin<typeof params>({
    init(realm, pluginParams) {
      if (!pluginParams) return;
      realm.pub(createActiveEditorSubscription$, (editor) => {
        let previousRootJson = editorRootJson(editor.getEditorState());
        const updateActiveTableEditor = () => {
          const inTableCell = isMarkdownTableCellEditor(editor) || Boolean(realm.getValue(editorInTable$));
          if (inTableCell) {
            pluginParams.activeTableCellEditorRef.current = editor;
          } else if (pluginParams.activeTableCellEditorRef.current === editor) {
            pluginParams.activeTableCellEditorRef.current = null;
          }
          return inTableCell;
        };
        updateActiveTableEditor();
        return editor.registerUpdateListener(({ editorState }) => {
          const nextRootJson = editorRootJson(editorState);
          const inTableCell = updateActiveTableEditor();
          if (inTableCell && previousRootJson && nextRootJson !== previousRootJson) {
            pluginParams.onPendingChange(true);
          }
          previousRootJson = nextRootJson;
        });
      });
    },
  })(params);
}

function isMarkdownTableCellEditor(editor: MarkdownTableCellEditor) {
  const root = editor.getRootElement();
  const parentName = root?.parentNode?.nodeName.toLowerCase() ?? "";
  return parentName === "td" || parentName === "th";
}

function editorRootJson(editorState: MarkdownEditorStateSnapshot) {
  return JSON.stringify(editorState.toJSON().root);
}

function MarkdownToolbarAdapter() {
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const linkButtonRef = useRef<HTMLDivElement | null>(null);
  const linkPanelRef = useRef<HTMLFormElement | null>(null);
  const toolbarContext = useContext(MarkdownToolbarContext);
  const toolbarDisabled = !toolbarContext.active || toolbarContext.readOnly;
  const activeEditor = useCellValue(activeEditor$);
  const [currentFormat, currentListType, currentBlockType] = useCellValues(currentFormat$, currentListType$, currentBlockType$);
  const applyFormat = usePublisher(applyFormat$);
  const applyListType = usePublisher(applyListType$);
  const convertSelectionToNode = usePublisher(convertSelectionToNode$);
  const insertMarkdown = usePublisher(insertMarkdown$);
  const insertImage = usePublisher(insertImage$);
  const insertTable = usePublisher(insertTable$);
  const insertCodeBlock = usePublisher(insertCodeBlock$);
  const insertThematicBreak = usePublisher(insertThematicBreak$);
  const removeLink = usePublisher(removeLink$);
  const linkDialogState = useCellValue(linkDialogState$);
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<MarkdownLinkDraft>({ text: "", href: "https://" });
  const [linkPosition, setLinkPosition] = useState<MarkdownLinkPosition | null>(null);
  const [selectedImage, setSelectedImage] = useState<MarkdownSelectedImageState | null>(null);

  const blockType = markdownBlockTypeFromEditor(currentBlockType);
  const listType = markdownListTypeFromEditor(currentListType);
  const linkActive = linkDialogState.type !== "inactive";
  const applyBlockChange = (kind: MarkdownBlockKind) => {
    if (toolbarContext.readOnly) return;
    toolbarContext.runProgrammaticChange(() => {
      const factory = () => {
        if (kind === "p") return lexical.$createParagraphNode();
        if (kind === "blockquote") return $createQuoteNode();
        return $createHeadingNode(kind as HeadingTagType);
      };
      const apply = () => convertSelectionToNode(factory);
      if (activeEditor) activeEditor.focus(apply);
      else apply();
    });
  };

  useEffect(() => {
    if (!activeEditor) {
      setSelectedImage(null);
      return;
    }
    const readSelectedImage = () => activeEditor.getEditorState().read(selectedMarkdownImageStateFromSelection);
    setSelectedImage(readSelectedImage());
    return activeEditor.registerUpdateListener(({ editorState }) => {
      const nextSelectedImage = editorState.read(selectedMarkdownImageStateFromSelection);
      setSelectedImage((current) => {
        if (!current && !nextSelectedImage) return current;
        if (current?.alignment === nextSelectedImage?.alignment && current?.nodeKey === nextSelectedImage?.nodeKey) return current;
        return nextSelectedImage;
      });
    });
  }, [activeEditor]);

  useLayoutEffect(() => {
    if (!linkPanelOpen) {
      setLinkPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchor = linkButtonRef.current?.querySelector("button");
      const panel = linkPanelRef.current;
      if (!anchor || !panel) return;
      const anchorRect = anchor.getBoundingClientRect();
      const availableWidth = Math.max(0, window.innerWidth - markdownLinkViewportMargin * 2);
      const panelWidth = Math.min(markdownLinkPanelWidth, availableWidth);
      const panelHeight = panel.offsetHeight;
      const centeredLeft = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
      const maxLeft = window.innerWidth - markdownLinkViewportMargin - panelWidth;
      const left = clampNumber(centeredLeft, markdownLinkViewportMargin, Math.max(markdownLinkViewportMargin, maxLeft));
      const belowTop = anchorRect.bottom + markdownLinkAnchorGap;
      const aboveTop = anchorRect.top - markdownLinkAnchorGap - panelHeight;
      const maxTop = window.innerHeight - markdownLinkViewportMargin - panelHeight;
      const top =
        belowTop + panelHeight <= window.innerHeight - markdownLinkViewportMargin || aboveTop < markdownLinkViewportMargin
          ? clampNumber(belowTop, markdownLinkViewportMargin, Math.max(markdownLinkViewportMargin, maxTop))
          : clampNumber(aboveTop, markdownLinkViewportMargin, Math.max(markdownLinkViewportMargin, maxTop));
      setLinkPosition((current) =>
        current && current.left === left && current.top === top && current.width === panelWidth
          ? current
          : { left, top, width: panelWidth },
      );
    };
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [linkPanelOpen]);

  useEffect(() => {
    if (!linkPanelOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (linkButtonRef.current?.contains(event.target as Node) || linkPanelRef.current?.contains(event.target as Node)) return;
      setLinkPanelOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [linkPanelOpen]);

  const requestImageFileSelection = () => {
    if (toolbarContext.readOnly) return;
    const input = imageFileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const openMarkdownLinkPanel = () => {
    if (toolbarContext.readOnly) return;
    let selectedText = "";
    activeEditor?.getEditorState().read(() => {
      const selection = lexical.$getSelection();
      if (lexical.$isRangeSelection(selection)) selectedText = selection.getTextContent();
    });
    setLinkDraft({ text: selectedText, href: "https://" });
    setLinkPanelOpen((current) => !current);
  };

  const applyMarkdownLink = () => {
    if (toolbarContext.readOnly) return;
    const href = normalizeMarkdownLinkUrl(linkDraft.href);
    if (!href) return;
    insertMarkdown(markdownLinkText(linkDraft.text, href));
    setLinkPanelOpen(false);
  };

  const setSelectedImageAlignment = (alignment: MarkdownImageAlignment) => {
    if (toolbarContext.readOnly) return;
    if (!selectedImage) return;
    toolbarContext.runProgrammaticChange(() => setMarkdownImageAlignmentByNodeKey(activeEditor, selectedImage.nodeKey, alignment));
  };

  const linkPanelStyle: CSSProperties = linkPosition ? { left: linkPosition.left, top: linkPosition.top, width: linkPosition.width } : { visibility: "hidden" };
  const linkPanel =
    linkPanelOpen && typeof document !== "undefined"
      ? createPortal(
          <form
            ref={linkPanelRef}
            className="fixed z-50 grid w-[300px] max-w-[calc(100vw-16px)] gap-1.5 rounded-[16px] border border-[#B8A07C]/55 bg-[#F4EFE6] p-2 shadow-[0_18px_46px_rgba(0,0,0,0.16)]"
            style={linkPanelStyle}
            onSubmit={(event) => {
              event.preventDefault();
              applyMarkdownLink();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setLinkPanelOpen(false);
              }
            }}
          >
            <input
              className="h-7 w-full rounded-[10px] border border-[#B8A07C]/50 bg-[#E6DDCD]/55 px-2 text-[11px] font-medium text-[#2A2620] outline-none placeholder:text-[#8B8275]"
              value={linkDraft.text}
              onChange={(event) => {
                const text = event.currentTarget.value;
                setLinkDraft((current) => ({ ...current, text }));
              }}
              placeholder="Text"
              aria-label="Link text"
            />
            <div className="flex min-w-0 items-center gap-1">
              <input
                className="h-7 min-w-0 flex-1 rounded-[10px] border border-[#B8A07C]/50 bg-[#E6DDCD]/55 px-2 text-[11px] font-medium text-[#2A2620] outline-none placeholder:text-[#8B8275]"
                value={linkDraft.href}
                onChange={(event) => {
                  const href = event.currentTarget.value;
                  setLinkDraft((current) => ({ ...current, href }));
                }}
                placeholder="https://"
                aria-label="Link URL"
              />
              <button className="h-7 rounded-[10px] bg-[#2A2620] px-2.5 text-[10px] font-semibold text-[#F4EFE6]" type="submit">
                Apply
              </button>
            </div>
          </form>,
          document.body,
        )
      : null;

  const handleImageFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (toolbarContext.readOnly) return;
    if (!file || !file.type.startsWith("image/")) return;
    const src = await uploadMarkdownImageAsset(toolbarContext.projectId, file);
    const altText = imageAltFromFileName(file.name);
    const replaced = toolbarContext.runProgrammaticChange(() => replaceSelectedImage(activeEditor, src, altText));
    if (replaced) return;
    toolbarContext.runProgrammaticChange(() => insertImage({ src, altText }));
  };

  return (
    <>
    <Toolbar className="relative -translate-y-1.5 overflow-visible" display={{ maxWidth: 1500, width: "content" }} onPointerDownCapture={toolbarContext.onToolbarInteractionStart}>
      <input ref={imageFileInputRef} className="hidden" type="file" accept="image/*" onChange={handleImageFileInputChange} />
      <ToolbarRow wrap className="gap-y-1.5">
        <ToolbarGroup>
          <IconButtonLight disabled={!toolbarContext.canUndo} title="Undo" onClick={toolbarContext.onUndo}><Undo2 size={18} /></IconButtonLight>
          <IconButtonLight disabled={!toolbarContext.canRedo} title="Redo" onClick={toolbarContext.onRedo}><Redo2 size={18} /></IconButtonLight>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup className="[column-gap:4px]">
          <ToolbarSelect disabled={toolbarDisabled} title="Block style" value={blockType} onChange={(value) => applyBlockChange(value as MarkdownBlockKind)}>
            <option value="p">Normal Text</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
            <option value="blockquote">Quote</option>
          </ToolbarSelect>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <IconButtonLight active={Boolean(currentFormat & IS_BOLD)} disabled={toolbarDisabled} title="Bold" onClick={() => applyFormat("bold")}><Bold size={19} /></IconButtonLight>
          <IconButtonLight active={Boolean(currentFormat & IS_ITALIC)} disabled={toolbarDisabled} title="Italic" onClick={() => applyFormat("italic")}><Italic size={19} /></IconButtonLight>
          <IconButtonLight active={Boolean(currentFormat & IS_STRIKETHROUGH)} disabled={toolbarDisabled} title="Strikethrough" onClick={() => applyFormat("strikethrough")}><Strikethrough size={19} /></IconButtonLight>
          <IconButtonLight active={Boolean(currentFormat & IS_CODE)} disabled={toolbarDisabled} title="Inline code" onClick={() => applyFormat("code")}><Code2 size={18} /></IconButtonLight>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <IconButtonLight active={listType === "number"} disabled={toolbarDisabled} title="Numbered list" onClick={() => applyListType(listType === "number" ? "" : "number")}><ListOrdered size={19} /></IconButtonLight>
          <IconButtonLight active={listType === "bullet"} disabled={toolbarDisabled} title="Bulleted list" onClick={() => applyListType(listType === "bullet" ? "" : "bullet")}><List size={19} /></IconButtonLight>
          <IconButtonLight active={listType === "check"} disabled={toolbarDisabled} title="Checklist" onClick={() => applyListType(listType === "check" ? "" : "check")}><ListTodo size={19} /></IconButtonLight>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <IconButtonLight disabled={toolbarDisabled} title="Image" onClick={requestImageFileSelection}><Image size={18} /></IconButtonLight>
          <div ref={linkButtonRef} className="relative inline-grid">
            <IconButtonLight active={linkActive || linkPanelOpen} disabled={toolbarDisabled} title="Create link" onClick={linkActive ? removeLink : openMarkdownLinkPanel}><Link2 size={18} /></IconButtonLight>
          </div>
          <IconButtonLight disabled={toolbarDisabled} title="Insert table" onClick={() => insertTable({ rows: 3, columns: 3 })}><Table2 size={18} /></IconButtonLight>
        </ToolbarGroup>
        {selectedImage ? (
          <>
            <ToolbarDivider />
            <ToolbarGroup>
              <IconButtonLight active={selectedImage.alignment === "left"} disabled={toolbarDisabled} title="Align image left" onClick={() => setSelectedImageAlignment("left")}><AlignLeft size={19} /></IconButtonLight>
              <IconButtonLight active={selectedImage.alignment === "center"} disabled={toolbarDisabled} title="Center image" onClick={() => setSelectedImageAlignment("center")}><AlignCenter size={19} /></IconButtonLight>
              <IconButtonLight active={selectedImage.alignment === "right"} disabled={toolbarDisabled} title="Align image right" onClick={() => setSelectedImageAlignment("right")}><AlignRight size={19} /></IconButtonLight>
            </ToolbarGroup>
          </>
        ) : null}
        <ToolbarDivider />
        <ToolbarGroup>
          <IconButtonLight active={blockType === "blockquote"} disabled={toolbarDisabled} title="Quote" onClick={() => applyBlockChange("blockquote")}><Quote size={18} /></IconButtonLight>
          <IconButtonLight disabled={toolbarDisabled} title="Thematic break" onClick={insertThematicBreak}><Minus size={18} /></IconButtonLight>
          <IconButtonLight disabled={toolbarDisabled} title="Code block" onClick={() => insertCodeBlock({})}><Code2 size={18} /></IconButtonLight>
        </ToolbarGroup>
      </ToolbarRow>
    </Toolbar>
    {linkPanel}
    </>
  );
}

function MarkdownImageReplaceToolbar(props: { nodeKey: string; alt: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeEditor = useCellValue(activeEditor$);
  const toolbarContext = useContext(MarkdownToolbarContext);

  const requestImageFileSelection = () => {
    if (toolbarContext.readOnly) return;
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const handleImageFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (toolbarContext.readOnly) return;
    if (!file || !file.type.startsWith("image/")) return;
    const src = await uploadMarkdownImageAsset(toolbarContext.projectId, file);
    const altText = props.alt.trim() || imageAltFromFileName(file.name);
    toolbarContext.runProgrammaticChange(() => replaceImageByNodeKey(activeEditor, props.nodeKey, src, altText));
  };

  return (
    <div className="ai-markdown-image-replace-toolbar">
      <input ref={inputRef} className="hidden" type="file" accept="image/*" onChange={(event) => void handleImageFileInputChange(event)} />
      <button type="button" title="Replace image" aria-label="Replace image" disabled={toolbarContext.readOnly} onMouseDown={(event) => event.preventDefault()} onClick={requestImageFileSelection}>
        <Replace size={18} />
      </button>
    </div>
  );
}

function markdownBlockTypeFromEditor(blockType: string): MarkdownBlockKind {
  if (blockType === "quote") return "blockquote";
  if (blockType === "h1" || blockType === "h2" || blockType === "h3" || blockType === "h4") return blockType;
  return "p";
}

function markdownListTypeFromEditor(listType: string) {
  if (listType === "number" || listType === "bullet" || listType === "check") return listType;
  return "";
}

function replaceSelectedImage(editor: { update: (fn: () => void) => void } | null, src: string, altText: string) {
  let replaced = false;
  editor?.update(() => {
    const selection = lexical.$getSelection();
    if (!lexical.$isNodeSelection(selection)) return;
    const imageNode = selection.getNodes().find((node) => $isImageNode(node));
    if (!imageNode) return;
    imageNode.setSrc(src);
    if (!imageNode.getAltText().trim()) imageNode.setAltText(altText);
    replaced = true;
  });
  return replaced;
}

function focusMarkdownTableCellEditor(event: MouseEvent<HTMLDivElement>) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest("button")) return;
  const cell = target.closest("td:not([data-tool-cell]), th:not([data-tool-cell])");
  const nestedEditor = cell?.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]');
  nestedEditor?.focus();
}

function replaceImageByNodeKey(editor: { update: (fn: () => void) => void } | null, nodeKey: string, src: string, altText: string) {
  editor?.update(() => {
    const node = lexical.$getNodeByKey(nodeKey);
    if (!$isImageNode(node)) return;
    node.setSrc(src);
    node.setAltText(altText);
  });
}

function selectedMarkdownImageStateFromSelection(): MarkdownSelectedImageState | null {
  const selection = lexical.$getSelection();
  if (!lexical.$isNodeSelection(selection)) return null;
  const imageNode = selection.getNodes().find((node) => $isImageNode(node));
  if (!imageNode) return null;
  return {
    alignment: markdownImageAlignment(imageNode),
    nodeKey: imageNode.getKey(),
  };
}

function setMarkdownImageAlignmentByNodeKey(editor: { update: (fn: () => void) => void } | null, nodeKey: string, alignment: MarkdownImageAlignment) {
  editor?.update(() => {
    const imageNode = lexical.$getNodeByKey(nodeKey);
    if (!imageNode) return;
    if (!$isImageNode(imageNode)) return;
    imageNode.setTitle(markdownImageTitleWithAlignment(imageNode.getTitle(), alignment));
  });
}

function markdownImageAlignment(node: ImageNode): MarkdownImageAlignment {
  const title = node.getTitle();
  if (markdownImageTitleHasToken(title, markdownImageRightTitleToken)) return "right";
  if (markdownImageTitleHasToken(title, markdownImageCenterTitleToken)) return "center";
  return "left";
}

function markdownImageTitleHasToken(title: string | undefined, token: string) {
  return markdownImageTitleTokens(title).includes(token);
}

function markdownImageTitleWithAlignment(title: string | undefined, alignment: MarkdownImageAlignment) {
  const tokens = markdownImageTitleTokens(title).filter((token) => token !== markdownImageCenterTitleToken && token !== markdownImageRightTitleToken);
  if (alignment === "center") tokens.push(markdownImageCenterTitleToken);
  if (alignment === "right") tokens.push(markdownImageRightTitleToken);
  return tokens.length ? tokens.join(" ") : undefined;
}

function markdownImageTitleTokens(title: string | undefined) {
  return (title ?? "").split(/\s+/).filter(Boolean);
}

function PlainMarkdownCodeBlockEditor(props: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext();
  const toolbarContext = useContext(MarkdownToolbarContext);
  const codeCompositionActiveRef = useRef(false);
  const [draftCode, setDraftCode] = useState(props.code);

  useEffect(() => {
    if (!codeCompositionActiveRef.current) setDraftCode(props.code);
  }, [props.code]);

  return (
    <figure className="ai-markdown-code-block-frame">
      <figcaption className="ai-markdown-code-block-header">
        <span className="ai-markdown-code-block-title">
          <span aria-hidden="true" className="ai-markdown-code-block-mark">
            &lt;/&gt;
          </span>
          <span>Code block</span>
        </span>
        <span aria-hidden="true" className="ai-markdown-code-block-dots">
          <span />
          <span />
          <span />
        </span>
      </figcaption>
      <textarea
        aria-label="Code block"
        className="ai-markdown-code-block-editor"
        readOnly={toolbarContext.readOnly}
        value={draftCode}
        spellCheck={false}
        onCompositionStart={() => {
          codeCompositionActiveRef.current = true;
        }}
        onCompositionEnd={(event) => {
          codeCompositionActiveRef.current = false;
          const nextCode = event.currentTarget.value;
          setDraftCode(nextCode);
          if (!toolbarContext.readOnly) setCode(nextCode);
        }}
        onChange={(event) => {
          const nextCode = event.target.value;
          setDraftCode(nextCode);
          if (!codeCompositionActiveRef.current && !toolbarContext.readOnly) setCode(nextCode);
        }}
      />
    </figure>
  );
}

function selectionFromEditor(editor: MDXEditorMethods | null, markdown: string, fallback: MarkdownSelection | null = null): MarkdownSelection {
  const selectedTextFromDocument = markdownSelectedTextFromDocument();
  if (selectedTextFromDocument) return selectionFromSelectedText(markdown, selectedTextFromDocument);
  const selectedText = editor?.getSelectionMarkdown() || "";
  if (selectedText) return selectionFromSelectedText(markdown, selectedText);
  if (fallback) return clampMarkdownSelection(markdown, fallback);
  if (!selectedText) {
    return {
      start: markdown.length,
      end: markdown.length,
      selectedText: "",
    };
  }
  return selectionFromSelectedText(markdown, selectedText);
}

function selectionFromSelectedText(markdown: string, selectedText: string): MarkdownSelection {
  if (!selectedText) return selectionFromOffsets(markdown, markdown.length, markdown.length);
  const start = markdown.indexOf(selectedText);
  const safeStart = start >= 0 ? start : 0;
  return {
    start: safeStart,
    end: safeStart + selectedText.length,
    selectedText,
  };
}

function clampMarkdownSelection(markdown: string, selection: MarkdownSelection) {
  return selectionFromOffsets(markdown, selection.start, selection.end);
}

function markdownSelectedTextFromDocument() {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return "";
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  if (!ancestor?.closest(".markdown-preview")) return "";
  return selection.toString();
}

function selectionFromOffsets(markdown: string, start: number, end: number): MarkdownSelection {
  const safeStart = clampNumber(start, 0, markdown.length);
  const safeEnd = clampNumber(end, safeStart, markdown.length);
  return {
    start: safeStart,
    end: safeEnd,
    selectedText: markdown.slice(safeStart, safeEnd),
  };
}

function applyMarkdownLineIndent(markdown: string, selection: MarkdownSelection, outdent: boolean) {
  const lines = markdown.split("\n");
  const targetIndex = markdownLineIndexForSelection(markdown, lines, selection);
  if (targetIndex < 0) return markdown;
  const line = lines[targetIndex] ?? "";
  if (!line.trim()) return markdown;
  if (outdent) {
    lines[targetIndex] = line.replace(/^ {1,2}/, "");
  } else {
    lines[targetIndex] = `  ${line}`;
  }
  return lines.join("\n");
}

function markdownLineIndexForSelection(markdown: string, lines: string[], selection: MarkdownSelection) {
  if (selection.selectedText) {
    const offset = Math.max(0, markdown.indexOf(selection.selectedText));
    if (offset >= 0) return lineIndexAtOffset(markdown, offset);
  }
  if (selection.start >= 0 && selection.start < markdown.length) return lineIndexAtOffset(markdown, selection.start);
  const firstContentLine = lines.findIndex((line) => line.trim());
  return firstContentLine >= 0 ? firstContentLine : 0;
}

function lineIndexAtOffset(markdown: string, offset: number) {
  return markdown.slice(0, offset).split("\n").length - 1;
}

function normalizeMarkdownEditorOutput(markdown: string) {
  return markdown
    .replace(/(^|\n)\\(#{1,6}\s+)/g, "$1$2")
    .replace(/^(\s*)([-*+]|\d+\.)\s+(.+?)(?:&#x9;|\t)$/gm, "$1  $2 $3");
}

async function uploadMarkdownImageAsset(projectId: string | null, file: File) {
  if (!projectId) throw new Error("Project is not ready for image upload");
  const asset = await uploadProjectAsset(projectId, file);
  return asset.path;
}

function markdownImagePreviewUrl(projectId: string | null, imageSource: string) {
  const assetName = markdownProjectAssetName(imageSource);
  if (!projectId || !assetName) return imageSource;
  return `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetName)}`;
}

function markdownProjectAssetName(imageSource: string) {
  const trimmed = imageSource.trim();
  if (trimmed.startsWith("./assets/")) return trimmed.slice("./assets/".length);
  if (trimmed.startsWith("assets/")) return trimmed.slice("assets/".length);
  return "";
}

function imageAltFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "image";
}

function markdownLinkText(text: string, href: string) {
  return `[${escapeMarkdownLinkLabel(text.trim() || href)}](${escapeMarkdownLinkDestination(href)})`;
}

function normalizeMarkdownLinkUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed || trimmed === "https://") return "";
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
  if (!/^[a-z][a-z\d+.-]*:/i.test(trimmed) && /^[^\s@]+\.[^\s]+$/.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function escapeMarkdownLinkLabel(value: string) {
  return value.replace(/([\\\]])/g, "\\$1");
}

function escapeMarkdownLinkDestination(value: string) {
  return value.replace(/[\\\s()]/g, (match) => `\\${match}`);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
