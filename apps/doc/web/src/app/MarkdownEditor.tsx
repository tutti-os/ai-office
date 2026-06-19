import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type FC, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
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
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { Bold, Code2, Image, Italic, Link2, List, ListOrdered, ListTodo, Minus, Quote, Redo2, Replace, Strikethrough, Table2, Undo2 } from "lucide-react";
import { ArtifactWorkspaceHeader } from "@ai-app/ui/editor-frame";
import type { ArtifactSaveState } from "@ai-app/ui/editor-frame";
import { IconButtonLight, Toolbar, ToolbarDivider, ToolbarGroup, ToolbarRow, ToolbarSelect } from "@ai-app/ui/toolbar";
import type { MarkdownRuntimeState, MarkdownSelection } from "../artifact/markdownArtifactAdapter";
import { markdownParagraphCount, markdownWordCount } from "./documentWorkbenchContent";

type MarkdownEditorProps = {
  runtime: MarkdownRuntimeState;
  dirty: boolean;
  saveState: ArtifactSaveState;
  loading: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onChange: (content: string, selection: MarkdownSelection) => void;
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
type MarkdownEditorStateSnapshot = {
  toJSON: () => { root: unknown };
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
  onBlockChange: (kind: MarkdownBlockKind) => void;
  onRedo: () => void;
  onUndo: () => void;
}>({
  active: false,
  canRedo: false,
  canUndo: false,
  onBlockChange: () => undefined,
  onRedo: () => undefined,
  onUndo: () => undefined,
});

export function MarkdownEditor(props: MarkdownEditorProps) {
  const editorRef = useRef<MDXEditorMethods | null>(null);
  const markdownRef = useRef(props.runtime.content);
  const activeTableCellEditorRef = useRef<MarkdownTableCellEditor | null>(null);
  const pendingTableCellEditRef = useRef(false);
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
      imagePlugin({ imageUploadHandler: fileToDataUrl, EditImageToolbar: MarkdownImageReplaceToolbar as unknown as FC<{}> }),
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
    [setPendingTableCellEdit],
  );

  useEffect(() => {
    props.onTableCellCommitterChange(commitPendingTableCellEdit);
    return () => props.onTableCellCommitterChange(null);
  }, [commitPendingTableCellEdit, props.onTableCellCommitterChange]);

  useEffect(() => {
    markdownRef.current = props.runtime.content;
    const editor = editorRef.current;
    if (!editor || editor.getMarkdown() === props.runtime.content) return;
    editor.setMarkdown(props.runtime.content);
  }, [props.runtime.content, props.runtime.revision]);

  const syncSelection = useCallback(() => {
    const editor = editorRef.current;
    const markdown = editor?.getMarkdown() ?? markdownRef.current;
    props.onSelectionChange(selectionFromEditor(editor, markdown));
  }, [props]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      const anchorNode = selection?.anchorNode ?? null;
      if (!anchorNode) return;
      const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
      if (!anchorElement?.closest(".markdown-preview")) return;
      syncSelection();
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [syncSelection]);

  const activateToolbar = useCallback(() => setToolbarActive(true), []);
  const handleEditorKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    activateToolbar();
    if (event.key !== "Tab") return;
    event.preventDefault();
    const markdown = editorRef.current?.getMarkdown() ?? markdownRef.current;
    const selection = selectionFromEditor(editorRef.current, markdown);
    const nextMarkdown = applyMarkdownLineIndent(markdown, selection, event.shiftKey);
    if (nextMarkdown === markdown) return;
    markdownRef.current = nextMarkdown;
    editorRef.current?.setMarkdown(nextMarkdown);
    props.onChange(nextMarkdown, selectionFromOffsets(nextMarkdown, selection.start, selection.end));
  }, [activateToolbar, props]);
  const handleEditorClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    focusMarkdownTableCellEditor(event);
  }, []);

  const handleChange = useCallback(
    (markdown: string, initialMarkdownNormalize: boolean) => {
      const normalizedMarkdown = normalizeMarkdownEditorOutput(markdown);
      markdownRef.current = normalizedMarkdown;
      const selection = selectionFromEditor(editorRef.current, normalizedMarkdown);
      props.onSelectionChange(selection);
      if (!initialMarkdownNormalize) {
        setPendingTableCellEdit(false);
        props.onChange(normalizedMarkdown, selection);
      }
    },
    [props, setPendingTableCellEdit],
  );

  const applyBlockChange = useCallback(
    (kind: MarkdownBlockKind) => {
      const markdown = editorRef.current?.getMarkdown() ?? markdownRef.current;
      const selection = selectionFromEditor(editorRef.current, markdown);
      const nextMarkdown = applyMarkdownBlockToContent(markdown, selection, kind);
      if (nextMarkdown === markdown) return;
      markdownRef.current = nextMarkdown;
      editorRef.current?.setMarkdown(nextMarkdown);
      props.onChange(nextMarkdown, selectionFromOffsets(nextMarkdown, selection.start, selection.end));
    },
    [props],
  );

  return (
    <section className="relative flex min-h-0 flex-col bg-[#1f1f1f]">
      <ArtifactWorkspaceHeader
        title={props.runtime.title || "Untitled Markdown"}
        saveState={props.saveState}
        stats={[
          `${markdownWordCount(props.runtime.content)} words`,
          `${markdownParagraphCount(props.runtime.content)} blocks`,
        ]}
        exportItems={[
          {
            label: "HTML",
            onSelect: () => downloadTextFile(`${safeFileName(props.runtime.title || "doc")}.html`, editorHtml(editorRef.current), "text/html"),
          },
          { label: "PDF", disabled: true, onSelect: () => undefined },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#2a2a2a] px-3 py-5 md:px-6 md:py-7">
        <div
          className="mx-auto min-h-[760px] w-full max-w-[1120px]"
          onBlurCapture={syncSelection}
          onClickCapture={handleEditorClick}
          onFocusCapture={activateToolbar}
          onKeyDownCapture={handleEditorKeyDown}
          onKeyUpCapture={syncSelection}
          onMouseDownCapture={activateToolbar}
          onMouseUpCapture={syncSelection}
        >
          <MarkdownToolbarContext.Provider
            value={{
              active: toolbarActive,
              canRedo: props.runtime.history.currentIndex < props.runtime.history.entries.length - 1,
              canUndo: props.runtime.history.currentIndex > 0,
              onBlockChange: applyBlockChange,
              onRedo: props.onRedo,
              onUndo: props.onUndo,
            }}
          >
            <MDXEditor
              ref={editorRef}
              markdown={props.runtime.content}
              className="flex min-h-[760px] flex-col bg-transparent text-[#202124]"
              contentEditableClassName="markdown-preview ai-markdown-content mx-auto min-h-[780px] w-full max-w-[980px] flex-1 overflow-visible rounded border border-black/20 bg-white !px-12 !py-9 text-[#202124] shadow-[0_30px_90px_rgba(0,0,0,0.45)] outline-none max-[760px]:!px-7 max-[760px]:!py-7 md:!px-18 md:!py-10"
              onChange={handleChange}
              plugins={plugins}
              spellCheck
            />
          </MarkdownToolbarContext.Provider>
        </div>
      </div>
    </section>
  );
}

type MarkdownBlockKind = "p" | "h1" | "h2" | "h3" | "h4" | "blockquote";

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
  const toolbarDisabled = !toolbarContext.active;
  const activeEditor = useCellValue(activeEditor$);
  const [currentFormat, currentListType, currentBlockType] = useCellValues(currentFormat$, currentListType$, currentBlockType$);
  const applyFormat = usePublisher(applyFormat$);
  const applyListType = usePublisher(applyListType$);
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

  const blockType = markdownBlockTypeFromEditor(currentBlockType);
  const listType = markdownListTypeFromEditor(currentListType);
  const linkActive = linkDialogState.type !== "inactive";

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
    const input = imageFileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const openMarkdownLinkPanel = () => {
    let selectedText = "";
    activeEditor?.getEditorState().read(() => {
      const selection = lexical.$getSelection();
      if (lexical.$isRangeSelection(selection)) selectedText = selection.getTextContent();
    });
    setLinkDraft({ text: selectedText, href: "https://" });
    setLinkPanelOpen((current) => !current);
  };

  const applyMarkdownLink = () => {
    const href = normalizeMarkdownLinkUrl(linkDraft.href);
    if (!href) return;
    insertMarkdown(markdownLinkText(linkDraft.text, href));
    setLinkPanelOpen(false);
  };

  const linkPanelStyle: CSSProperties = linkPosition ? { left: linkPosition.left, top: linkPosition.top, width: linkPosition.width } : { visibility: "hidden" };
  const linkPanel =
    linkPanelOpen && typeof document !== "undefined"
      ? createPortal(
          <form
            ref={linkPanelRef}
            className="fixed z-50 grid w-[300px] max-w-[calc(100vw-16px)] gap-1.5 rounded-lg border border-black/10 bg-white p-2 shadow-[0_12px_28px_rgba(0,0,0,0.14)]"
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
              className="h-7 w-full rounded-md border border-black/10 bg-white px-2 text-[11px] font-medium text-[#333] outline-none"
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
                className="h-7 min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 text-[11px] font-medium text-[#333] outline-none"
                value={linkDraft.href}
                onChange={(event) => {
                  const href = event.currentTarget.value;
                  setLinkDraft((current) => ({ ...current, href }));
                }}
                placeholder="https://"
                aria-label="Link URL"
              />
              <button className="h-7 rounded-md bg-black px-2.5 text-[10px] font-semibold text-white" type="submit">
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
    if (!file || !file.type.startsWith("image/")) return;
    const src = await fileToDataUrl(file);
    const altText = imageAltFromFileName(file.name);
    if (replaceSelectedImage(activeEditor, src, altText)) return;
    insertImage({ src, altText });
  };

  return (
    <>
    <Toolbar className="relative -translate-y-1.5 overflow-visible" display={{ maxWidth: 1500, width: "content" }}>
      <input ref={imageFileInputRef} className="hidden" type="file" accept="image/*" onChange={handleImageFileInputChange} />
      <ToolbarRow wrap className="gap-y-1.5">
        <ToolbarGroup>
          <IconButtonLight disabled={!toolbarContext.canUndo} title="Undo" onClick={toolbarContext.onUndo}><Undo2 size={18} /></IconButtonLight>
          <IconButtonLight disabled={!toolbarContext.canRedo} title="Redo" onClick={toolbarContext.onRedo}><Redo2 size={18} /></IconButtonLight>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup className="[column-gap:4px]">
          <ToolbarSelect disabled={toolbarDisabled} title="Block style" value={blockType} onChange={(value) => toolbarContext.onBlockChange(value as MarkdownBlockKind)}>
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
        <ToolbarDivider />
        <ToolbarGroup>
          <IconButtonLight active={blockType === "blockquote"} disabled={toolbarDisabled} title="Quote" onClick={() => toolbarContext.onBlockChange("blockquote")}><Quote size={18} /></IconButtonLight>
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

  const requestImageFileSelection = () => {
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const handleImageFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const src = await fileToDataUrl(file);
    const altText = props.alt.trim() || imageAltFromFileName(file.name);
    replaceImageByNodeKey(activeEditor, props.nodeKey, src, altText);
  };

  return (
    <div className="ai-markdown-image-replace-toolbar">
      <input ref={inputRef} className="hidden" type="file" accept="image/*" onChange={(event) => void handleImageFileInputChange(event)} />
      <button type="button" title="Replace image" aria-label="Replace image" onMouseDown={(event) => event.preventDefault()} onClick={requestImageFileSelection}>
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

function PlainMarkdownCodeBlockEditor(props: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext();
  return (
    <textarea
      aria-label="Code block"
      className="min-h-24 w-full resize-y rounded-lg border-0 bg-[#171717] p-3.5 font-mono text-[13px] leading-[1.55] text-[#f7f7f7] outline-none focus:shadow-[0_0_0_2px_rgba(26,115,232,0.32)]"
      value={props.code}
      spellCheck={false}
      onChange={(event) => setCode(event.target.value)}
    />
  );
}

function selectionFromEditor(editor: MDXEditorMethods | null, markdown: string): MarkdownSelection {
  const selectedText = editor?.getSelectionMarkdown() || document.getSelection()?.toString() || "";
  if (!selectedText) {
    return {
      start: markdown.length,
      end: markdown.length,
      selectedText: "",
    };
  }
  const start = markdown.indexOf(selectedText);
  const safeStart = start >= 0 ? start : 0;
  return {
    start: safeStart,
    end: safeStart + selectedText.length,
    selectedText,
  };
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

function applyMarkdownBlockToContent(markdown: string, selection: MarkdownSelection, kind: MarkdownBlockKind) {
  const lines = markdown.split("\n");
  const targetIndex = markdownLineIndexForSelection(markdown, lines, selection);
  if (targetIndex < 0) return markdown;
  const line = lines[targetIndex] ?? "";
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const body = line
    .slice(indent.length)
    .replace(/^(#{1,6})\s+/, "")
    .replace(/^>\s?/, "");
  if (kind === "p") {
    lines[targetIndex] = `${indent}${body}`;
  } else if (kind === "blockquote") {
    lines[targetIndex] = `${indent}> ${body || "Quote"}`;
  } else {
    lines[targetIndex] = `${indent}${"#".repeat(Number(kind.slice(1)))} ${body || "Heading"}`;
  }
  return lines.join("\n");
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

function editorHtml(editor: MDXEditorMethods | null) {
  return editor?.getContentEditableHTML() ?? "";
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
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

function downloadTextFile(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  return value.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "doc";
}
