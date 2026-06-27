import { useContext, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FC, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  $isImageNode,
  activeEditor$,
  addTopAreaChild$,
  createActiveEditorSubscription$,
  editorInTable$,
  applyFormat$,
  applyListType$,
  type CodeBlockEditorProps,
  currentBlockType$,
  currentFormat$,
  currentListType$,
  convertSelectionToNode$,
  insertCodeBlock$,
  insertImage$,
  insertMarkdown$,
  insertTable$,
  insertThematicBreak$,
  lexical,
  linkDialogState$,
  realmPlugin,
  removeLink$,
  useCellValue,
  useCellValues,
  useCodeBlockEditorContext,
  usePublisher,
  type ImageNode,
} from "@mdxeditor/editor";
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from "@lexical/rich-text";
import { AlignCenter, AlignLeft, AlignRight, Bold, Code2, Image, Italic, Link2, List, ListOrdered, ListTodo, Minus, Quote, Replace, Strikethrough, Table2 } from "lucide-react";
import { IconButtonLight, Toolbar, ToolbarDivider, ToolbarGroup, ToolbarRow, ToolbarSelect, editorToolbarClass } from "@ai-app/ui/toolbar";
import { uploadProjectAsset } from "../api/projects";
import { MarkdownToolbarContext, type MarkdownEditorStateSnapshot, type MarkdownTableCellEditor } from "./markdownEditorContext";
import { clampNumber } from "./markdownEditorState";

type MarkdownLinkDraft = {
  text: string;
  href: string;
};

type MarkdownLinkPosition = {
  left: number;
  top: number;
  width: number;
};

type MarkdownBlockKind = "p" | "h1" | "h2" | "h3" | "h4" | "blockquote";
type MarkdownImageAlignment = "left" | "center" | "right";
type MarkdownSelectedImageState = {
  alignment: MarkdownImageAlignment;
  nodeKey: string;
};

const markdownLinkPanelWidth = 260;
const markdownLinkViewportMargin = 8;
const markdownLinkAnchorGap = 8;
const markdownImageCenterTitleToken = "ai-md-align-center";
const markdownImageRightTitleToken = "ai-md-align-right";

export function markdownToolbarPlugin() {
  return realmPlugin({
    init(realm) {
      realm.pub(addTopAreaChild$, MarkdownToolbarAdapter);
    },
  })();
}

export function markdownTableCellPendingPlugin(params: {
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
  const setLinkDialogState = usePublisher(linkDialogState$);
  const linkDialogState = useCellValue(linkDialogState$);
  const [rawLinkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<MarkdownLinkDraft>({ text: "", href: "https://" });
  const [linkPosition, setLinkPosition] = useState<MarkdownLinkPosition | null>(null);
  const [selectedImage, setSelectedImage] = useState<MarkdownSelectedImageState | null>(null);

  const blockType = markdownBlockTypeFromEditor(currentBlockType);
  const listType = markdownListTypeFromEditor(currentListType);
  const linkActive = linkDialogState.type !== "inactive";
  const imageSelected = Boolean(selectedImage);
  const linkPanelOpen = rawLinkPanelOpen && !imageSelected;
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
  const toggleQuote = () => {
    applyBlockChange(blockType === "blockquote" ? "p" : "blockquote");
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
        if (nextSelectedImage) {
          setLinkPanelOpen(false);
          setLinkDialogState({ type: "inactive" });
        }
        return nextSelectedImage;
      });
    });
  }, [activeEditor, setLinkDialogState]);

  useEffect(() => {
    if (imageSelected && linkDialogState.type !== "inactive") setLinkDialogState({ type: "inactive" });
  }, [imageSelected, linkDialogState.type, setLinkDialogState]);

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
            className="ai-markdown-link-panel fixed z-50 grid w-[260px] max-w-[calc(100vw-16px)] gap-1.5 rounded-[8px] border border-[#B8A07C]/30 bg-[#EEE8DC] p-2 "
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
              className="h-7 w-full rounded-[8px] border border-[#B8A07C]/30 bg-[#F9F4EC] px-2 text-[11px] font-medium text-[#2A2620] outline-none placeholder:text-[#8B8275]"
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
                className="h-7 min-w-0 flex-1 rounded-[8px] border border-[#B8A07C]/30 bg-[#F9F4EC] px-2 text-[11px] font-medium text-[#2A2620] outline-none placeholder:text-[#8B8275]"
                value={linkDraft.href}
                onChange={(event) => {
                  const href = event.currentTarget.value;
                  setLinkDraft((current) => ({ ...current, href }));
                }}
                placeholder="https://"
                aria-label="Link URL"
              />
              <button className="h-7 rounded-[8px] bg-[#2A2620] px-2.5 text-[11px] font-semibold text-[#F4EFE6]" type="submit">
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

  const toolbar = (
      <div className="flex items-center justify-center">
        <Toolbar className={editorToolbarClass} display={{ maxWidth: 1500, width: "full" }} onPointerDownCapture={toolbarContext.onToolbarInteractionStart}>
          <input ref={imageFileInputRef} className="hidden" type="file" accept="image/*" onChange={handleImageFileInputChange} />
          <ToolbarRow wrap className="gap-y-1.5">
            {!imageSelected ? (
              <>
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
              </>
            ) : null}
            {!imageSelected ? <ToolbarDivider /> : null}
            <ToolbarGroup>
              <IconButtonLight disabled={toolbarDisabled} title="Image" onClick={requestImageFileSelection}><Image size={18} /></IconButtonLight>
              <IconButtonLight disabled={toolbarDisabled} title="Insert table" onClick={() => insertTable({ rows: 3, columns: 3 })}><Table2 size={18} /></IconButtonLight>
            </ToolbarGroup>
            <ToolbarDivider />
            <ToolbarGroup>
              <div ref={linkButtonRef} className="relative inline-grid">
                <IconButtonLight active={!imageSelected && (linkActive || linkPanelOpen)} disabled={toolbarDisabled || imageSelected} title="Create link" onClick={linkActive ? removeLink : openMarkdownLinkPanel}><Link2 size={18} /></IconButtonLight>
              </div>
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
            {!imageSelected ? (
              <>
                <ToolbarDivider />
                <ToolbarGroup>
                  <IconButtonLight active={blockType === "blockquote"} disabled={toolbarDisabled} title="Quote" onClick={toggleQuote}><Quote size={18} /></IconButtonLight>
                  <IconButtonLight disabled={toolbarDisabled} title="Thematic break" onClick={insertThematicBreak}><Minus size={18} /></IconButtonLight>
                  <IconButtonLight disabled={toolbarDisabled} title="Code block" onClick={() => insertCodeBlock({})}><Code2 size={18} /></IconButtonLight>
                </ToolbarGroup>
              </>
            ) : null}
          </ToolbarRow>
        </Toolbar>
      </div>
  );

  return (
    <>
      {toolbarContext.toolbarHost ? createPortal(toolbar, toolbarContext.toolbarHost) : toolbar}
      {linkPanel}
    </>
  );
}

export function MarkdownImageReplaceToolbar(props: { nodeKey: string; alt: string }) {
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

export function PlainMarkdownCodeBlockEditor(props: CodeBlockEditorProps) {
  const { parentEditor, setCode } = useCodeBlockEditorContext();
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
        onFocus={() => {
          parentEditor.update(() => {
            lexical.$setSelection(null);
          });
        }}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
        onBeforeInput={(event) => event.stopPropagation()}
        onInput={(event) => event.stopPropagation()}
        onPaste={(event) => event.stopPropagation()}
        onCut={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onMouseUp={(event) => event.stopPropagation()}
        onCompositionStart={() => {
          codeCompositionActiveRef.current = true;
        }}
        onCompositionEnd={(event) => {
          codeCompositionActiveRef.current = false;
          const nextCode = event.currentTarget.value;
          setDraftCode(nextCode);
          if (!toolbarContext.readOnly) toolbarContext.runProgrammaticChange(() => setCode(nextCode));
        }}
        onChange={(event) => {
          const nextCode = event.target.value;
          setDraftCode(nextCode);
          if (!codeCompositionActiveRef.current && !toolbarContext.readOnly) toolbarContext.runProgrammaticChange(() => setCode(nextCode));
        }}
      />
    </figure>
  );
}

export async function uploadMarkdownImageAsset(projectId: string | null, file: File) {
  if (!projectId) throw new Error("Project is not ready for image upload");
  const asset = await uploadProjectAsset(projectId, file);
  return asset.path;
}

export function markdownImagePreviewUrl(projectId: string | null, imageSource: string) {
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
