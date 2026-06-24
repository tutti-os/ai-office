import { useCallback, useEffect, useMemo, useRef, useState, type CompositionEvent as ReactCompositionEvent, type FC, type KeyboardEvent, type MouseEvent } from "react";
import {
  MDXEditor,
  NESTED_EDITOR_UPDATED_COMMAND,
  codeBlockPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { scrollbarClass } from "@ai-app/ui/app-shell";
import type { MarkdownRuntimeState, MarkdownSelection } from "../artifact/markdownArtifactAdapter";
import { MarkdownToolbarContext, type MarkdownTableCellEditor } from "./markdownEditorContext";
import {
  applyMarkdownLineIndent,
  blockMarkdownReadOnlyMutation,
  blockMarkdownReadOnlyTableChromeEvent,
  clearMarkdownPersistentSelectionHighlight,
  focusMarkdownTableCellEditor,
  isMarkdownComposingKeyEvent,
  isMarkdownEditingKey,
  isMarkdownEditorFocusInside,
  isMarkdownNestedTextInput,
  markdownHistoryShortcutOffset,
  markdownSelectionRangeFromDocument,
  normalizeMarkdownEditorOutput,
  preventMarkdownLinkNavigation,
  selectionFromEditor,
  selectionFromOffsets,
  setMarkdownPersistentSelectionHighlight,
} from "./markdownEditorState";
import {
  MarkdownImageReplaceToolbar,
  PlainMarkdownCodeBlockEditor,
  markdownImagePreviewUrl,
  markdownTableCellPendingPlugin,
  markdownToolbarPlugin,
  uploadMarkdownImageAsset,
} from "./markdownEditorToolbar";

type MarkdownEditorProps = {
  runtime: MarkdownRuntimeState;
  projectId: string | null;
  readOnly: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onChange: (content: string, selection: MarkdownSelection) => void;
  onPendingTableCellEditChange: (pending: boolean) => void;
  onSelectionChange: (selection: MarkdownSelection) => void;
  onTableCellCommitterChange: (committer: (() => boolean) | null) => void;
};

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
    </section>
  );
}
