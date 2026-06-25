import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { NodeViewRendererProps } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TiptapImage from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import {
  renderHtmlProjectFragmentAssetReferences,
  restoreHtmlProjectFragmentAssetReferences,
} from "../artifact/runtime/projectAssets";
import type { LinkDraft, ToolbarState } from "./runtimeWorkbenchTypes";
import type { HtmlEditorScreenProps } from "./HtmlEditorScreen";
import {
  AiBlockStyle,
  AiFontSize,
  AiHtmlAttributes,
  AiHtmlBlockElement,
  AiHtmlContainerDiv,
  AiHtmlIcon,
  AiHtmlInput,
  AiHtmlLeafBlockElement,
  AiHtmlLeafDiv,
  AiHtmlSmall,
  AiHtmlSpan,
  AiHtmlBlockSvg,
  AiHtmlSvgCircle,
  AiHtmlSvgGroup,
  AiHtmlInlineSvg,
  AiHtmlSvgLine,
  AiHtmlSvgPath,
  selectionStateFromTiptap,
  toolbarStateFromTiptap,
} from "./htmlTiptapEditor";
import { htmlDocumentBodyClassName, htmlDocumentFrameWidthPx, iframeHtmlDocumentShell } from "./htmlDocumentRender";

type StoredSelectionBookmark = ReturnType<Editor["state"]["selection"]["getBookmark"]>;

const imageReplaceEventName = "ai-doc-html-replace-image";

const ResizableImage = TiptapImage.extend({
  addNodeView() {
    return createHtmlImageNodeView;
  },
});

function createHtmlImageNodeView(props: NodeViewRendererProps) {
  let node = props.node;
  let selected = false;
  const dom = document.createElement("span");
  const image = document.createElement("img");
  const replaceButton = document.createElement("button");
  const resizeHandle = document.createElement("button");

  dom.className = "ai-html-image-node-view";
  dom.contentEditable = "false";
  dom.style.display = "inline-block";
  dom.style.maxWidth = "100%";
  dom.style.width = "fit-content";

  image.draggable = false;
  replaceButton.type = "button";
  replaceButton.className = "ai-html-image-replace-button";
  replaceButton.title = "Replace image";
  replaceButton.setAttribute("aria-label", "Replace image");
  replaceButton.innerHTML = replaceIconSvg;

  resizeHandle.type = "button";
  resizeHandle.className = "ai-html-image-resize-handle";
  resizeHandle.title = "Resize image";
  resizeHandle.setAttribute("aria-label", "Resize image");

  dom.append(image, replaceButton, resizeHandle);

  const currentPosition = () => {
    const position = typeof props.getPos === "function" ? props.getPos() : null;
    return typeof position === "number" ? position : null;
  };

  const updateImageAttributes = (nextAttributes: Record<string, unknown>) => {
    const position = currentPosition();
    if (position == null) return;
    props.view.dispatch(props.view.state.tr.setNodeMarkup(position, undefined, nextAttributes));
  };

  const render = () => {
    const attrs = node.attrs as Record<string, unknown>;
    const src = typeof attrs.src === "string" ? attrs.src : "";
    const alt = typeof attrs.alt === "string" ? attrs.alt : "";
    const title = typeof attrs.title === "string" ? attrs.title : null;
    const className = typeof attrs.class === "string" ? attrs.class : null;
    const id = typeof attrs.id === "string" ? attrs.id : null;
    const width = typeof attrs.width === "string" ? attrs.width : null;
    const height = typeof attrs.height === "string" ? attrs.height : null;
    const style = typeof attrs.style === "string" ? attrs.style : "";
    const wrapperWidth = cssLengthFromDimension(stylePropertyValue(style, "width") || width || undefined);

    dom.classList.toggle("is-selected", selected);
    dom.style.width = wrapperWidth ?? "fit-content";
    setOptionalAttribute(image, "src", src);
    setOptionalAttribute(image, "alt", alt);
    setOptionalAttribute(image, "title", title);
    setOptionalAttribute(image, "class", className);
    setOptionalAttribute(image, "id", id);
    setOptionalAttribute(image, "width", width);
    setOptionalAttribute(image, "height", height);
    setOptionalAttribute(image, "style", style || null);
  };

  const requestReplace = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const position = currentPosition();
    if (position == null) return;
    props.view.dom.ownerDocument.dispatchEvent(new CustomEvent(imageReplaceEventName, { detail: { position } }));
  };

  const startResize = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = image.getBoundingClientRect();
    const startWidth = Math.max(1, rect.width);
    const startHeight = Math.max(1, rect.height);
    const ownerDocument = image.ownerDocument;
    const ownerWindow = ownerDocument.defaultView ?? window;
    try {
      resizeHandle.setPointerCapture(event.pointerId);
    } catch {
      // Some iframe/browser combinations do not allow pointer capture here.
    }

    const updateSize = (clientX: number, clientY: number) => {
      const attrs = node.attrs as Record<string, unknown>;
      const nextWidth = Math.max(32, Math.round(startWidth + clientX - startX));
      const nextHeight = Math.max(32, Math.round(startHeight + clientY - startY));
      const nextStyle = setStyleProperties(typeof attrs.style === "string" ? attrs.style : "", {
        width: `${nextWidth}px`,
        height: `${nextHeight}px`,
      });
      updateImageAttributes({
        ...attrs,
        width: String(nextWidth),
        height: String(nextHeight),
        style: nextStyle,
      });
    };
    const onPointerMove = (moveEvent: PointerEvent) => updateSize(moveEvent.clientX, moveEvent.clientY);
    const onPointerEnd = () => {
      ownerWindow.removeEventListener("pointermove", onPointerMove);
      ownerWindow.removeEventListener("pointerup", onPointerEnd);
      ownerWindow.removeEventListener("pointercancel", onPointerEnd);
      props.view.focus();
    };
    ownerWindow.addEventListener("pointermove", onPointerMove);
    ownerWindow.addEventListener("pointerup", onPointerEnd);
    ownerWindow.addEventListener("pointercancel", onPointerEnd);
  };

  replaceButton.addEventListener("click", requestReplace);
  resizeHandle.addEventListener("pointerdown", startResize);
  render();

  return {
    dom,
    selectNode() {
      selected = true;
      render();
    },
    deselectNode() {
      selected = false;
      render();
    },
    update(nextNode: typeof node) {
      if (nextNode.type !== node.type) return false;
      node = nextNode;
      render();
      return true;
    },
    stopEvent(event: Event) {
      return event.target instanceof HTMLElement && Boolean(event.target.closest(".ai-html-image-replace-button, .ai-html-image-resize-handle"));
    },
    ignoreMutation() {
      return true;
    },
    destroy() {
      replaceButton.removeEventListener("click", requestReplace);
      resizeHandle.removeEventListener("pointerdown", startResize);
    },
  };
}

function cssLengthFromDimension(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

function setOptionalAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value == null || value === "") element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function stylePropertyValue(cssText: string, propertyName: string) {
  const property = propertyName.toLowerCase();
  for (const declaration of cssText.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex <= 0) continue;
    if (declaration.slice(0, separatorIndex).trim().toLowerCase() === property) return declaration.slice(separatorIndex + 1).trim();
  }
  return "";
}

const replaceIconSvg = `<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="m20 4-6.5 6.5"/><path d="M10 20H4v-6"/><path d="m4 20 6.5-6.5"/></svg>`;

function removeStyleProperties(cssText: string, properties: string[]) {
  const blocked = new Set(properties.map((property) => property.toLowerCase()));
  return cssText
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const separatorIndex = declaration.indexOf(":");
      if (separatorIndex <= 0) return false;
      return !blocked.has(declaration.slice(0, separatorIndex).trim().toLowerCase());
    })
    .join("; ");
}

function setStyleProperties(cssText: string, declarations: Record<string, string>) {
  const base = removeStyleProperties(cssText, Object.keys(declarations));
  const additions = Object.entries(declarations)
    .filter(([, value]) => value)
    .map(([property, value]) => `${property}: ${value}`);
  return [...(base ? [base] : []), ...additions].join("; ");
}

export function useHtmlTiptapEditor(input: {
  props: HtmlEditorScreenProps;
  toolbarDisabled: boolean;
  onRequestLinkEditor: (draft: LinkDraft) => void;
  onRequestImageFile: () => void;
}) {
  const { props } = input;
  const selectionBookmarkRef = useRef<StoredSelectionBookmark | null>(null);
  const pendingImageReplacePositionRef = useRef<number | null>(null);
  const runtimeId = props.runtime?.id;
  const tiptapExtensions = useMemo(
    () => [
      AiHtmlAttributes,
      AiHtmlSpan,
      AiHtmlSmall,
      AiHtmlContainerDiv,
      AiHtmlLeafDiv,
      AiHtmlBlockElement,
      AiHtmlLeafBlockElement,
      AiHtmlInput,
      AiHtmlIcon,
      AiHtmlInlineSvg,
      AiHtmlBlockSvg,
      AiHtmlSvgGroup,
      AiHtmlSvgPath,
      AiHtmlSvgLine,
      AiHtmlSvgCircle,
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      TextStyle,
      Color,
      FontFamily,
      AiFontSize,
      AiBlockStyle,
      TextAlign.configure({
        types: ["heading", "paragraph", "blockquote", "listItem", "taskItem"],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Underline,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    [],
  );
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: tiptapExtensions,
      content: editorBodyHtml(props.runtime?.document.bodyInnerHTML || "<p></p>", props.projectId),
      editable: !props.readOnly,
      editorProps: {
        attributes: {
          class: htmlDocumentBodyClassName,
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        rememberSelectionBookmark(currentEditor, selectionBookmarkRef);
        const selection = safeSelectionStateFromTiptap(currentEditor);
        const currentHTML = safeTiptapHTML(currentEditor);
        if (currentHTML) props.onTiptapBodyChange(restoreHtmlProjectFragmentAssetReferences(cleanTiptapHtmlForRuntime(currentHTML)), selection);
        props.onTiptapSelectionChange(selection, safeToolbarStateFromTiptap(currentEditor, props.toolbarState));
      },
      onSelectionUpdate: ({ editor: currentEditor }) => {
        rememberSelectionBookmark(currentEditor, selectionBookmarkRef);
        const selection = safeSelectionStateFromTiptap(currentEditor);
        props.onTiptapSelectionChange(selection, safeToolbarStateFromTiptap(currentEditor, props.toolbarState));
      },
      onTransaction: ({ editor: currentEditor }) => {
        rememberSelectionBookmark(currentEditor, selectionBookmarkRef);
        props.onTiptapSelectionChange(safeSelectionStateFromTiptap(currentEditor), safeToolbarStateFromTiptap(currentEditor, props.toolbarState));
      },
    },
    [runtimeId, props.projectId],
  );

  useEffect(() => {
    selectionBookmarkRef.current = null;
  }, [runtimeId]);

  useEffect(() => {
    editor?.setEditable(!props.readOnly);
  }, [editor, props.readOnly]);

  useEffect(() => {
    if (!editor) return;
    let cleanup: (() => void) | null = null;
    let frame = 0;
    const install = () => {
      const view = mountedEditorView(editor);
      if (!view) {
        frame = requestAnimationFrame(install);
        return;
      }
      const doc = view.dom.ownerDocument;
      const onReplaceImage = (event: Event) => {
        if (!(event instanceof CustomEvent)) return;
        const position = (event.detail as { position?: unknown } | null)?.position;
        if (typeof position !== "number") return;
        pendingImageReplacePositionRef.current = position;
        input.onRequestImageFile();
      };
      doc.addEventListener(imageReplaceEventName, onReplaceImage);
      cleanup = () => doc.removeEventListener(imageReplaceEventName, onReplaceImage);
    };
    install();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      cleanup?.();
    };
  }, [editor, input.onRequestImageFile]);

  const runtimeBodyInnerHTML = props.runtime?.document.bodyInnerHTML;
  useEffect(() => {
    if (!editor || !props.runtime) return;
    const nextContent = editorBodyHtml(props.runtime.document.bodyInnerHTML || "<p></p>", props.projectId);
    const currentHTML = safeTiptapHTML(editor);
    if (!currentHTML) return;
    if (normalizeTaskListsForTiptap(currentHTML) === nextContent) return;
    editor.commands.setContent(nextContent, { emitUpdate: false });
    props.onTiptapSelectionChange(safeSelectionStateFromTiptap(editor), safeToolbarStateFromTiptap(editor, props.toolbarState));
  }, [editor, props.projectId, runtimeId, props.runtime?.revision, runtimeBodyInnerHTML]);

  useEffect(() => {
    if (!editor) return;
    props.onTiptapSelectionChange(safeSelectionStateFromTiptap(editor), safeToolbarStateFromTiptap(editor, props.toolbarState));
  }, [editor, props.readOnly, runtimeId]);

  const toolbarState = editor ? safeToolbarStateFromTiptap(editor, props.toolbarState) : props.toolbarState;
  const toolbarProps = editor
    ? createTiptapToolbarProps(
        props,
        editor,
        toolbarState,
        input.onRequestLinkEditor,
        input.onRequestImageFile,
        selectionBookmarkRef,
        pendingImageReplacePositionRef,
      )
    : props;
  return {
    editor,
    toolbarProps,
    toolbarState,
    insertImage: (attributes: { src: string; alt?: string }) => {
      if (!editor) return false;
      const replacePosition = pendingImageReplacePositionRef.current;
      pendingImageReplacePositionRef.current = null;
      if (replaceImageAtPosition(editor, replacePosition, attributes)) return true;
      if (editor.isActive("image")) return toolbarChain(editor, selectionBookmarkRef).updateAttributes("image", attributes).run();
      return toolbarChain(editor, selectionBookmarkRef).setImage(attributes).run();
    },
    canCreateLink: !input.toolbarDisabled && Boolean(editor && (toolbarState.rangeSelection || toolbarState.link || toolbarState.contentElement)),
    canUndo: editor ? safeCanRunEditorCommand(editor, "undo") : Boolean(props.runtime && props.runtime.history.currentIndex > 0),
    canRedo: editor ? safeCanRunEditorCommand(editor, "redo") : Boolean(props.runtime && props.runtime.history.currentIndex < props.runtime.history.snapshots.length - 1),
  };
}

function mountedEditorView(editor: Editor | null) {
  if (!editor || editor.isDestroyed) return null;
  try {
    return editor.view;
  } catch {
    return null;
  }
}

function safeTiptapHTML(editor: Editor) {
  try {
    return editor.getHTML();
  } catch (error) {
    console.warn("Unable to serialize Tiptap HTML", error);
    return null;
  }
}

function safeSelectionStateFromTiptap(editor: Editor) {
  try {
    return selectionStateFromTiptap(editor);
  } catch (error) {
    console.warn("Unable to read Tiptap selection state", error);
    return null;
  }
}

function safeToolbarStateFromTiptap(editor: Editor, fallback: ToolbarState) {
  try {
    return toolbarStateFromTiptap(editor, fallback);
  } catch (error) {
    console.warn("Unable to read Tiptap toolbar state", error);
    return fallback;
  }
}

function safeCanRunEditorCommand(editor: Editor, commandName: "undo" | "redo") {
  try {
    return Boolean(editor.can()[commandName]());
  } catch {
    return false;
  }
}

function rememberSelectionBookmark(editor: Editor, selectionBookmarkRef: MutableRefObject<StoredSelectionBookmark | null>) {
  if (editor.state.selection.empty) {
    selectionBookmarkRef.current = null;
    return;
  }
  selectionBookmarkRef.current = editor.state.selection.getBookmark();
}

function restoreSelectionBeforeToolbarCommand(editor: Editor, selectionBookmarkRef: MutableRefObject<StoredSelectionBookmark | null>) {
  syncDomSelectionBeforeToolbarCommand(editor, selectionBookmarkRef);
  const bookmark = selectionBookmarkRef.current;
  if (!bookmark || !editor.state.selection.empty) return;
  const view = mountedEditorView(editor);
  if (!view) return;
  try {
    const selection = bookmark.resolve(editor.state.doc);
    view.dispatch(editor.state.tr.setSelection(selection));
  } catch {
    selectionBookmarkRef.current = null;
  }
}

function syncDomSelectionBeforeToolbarCommand(editor: Editor, selectionBookmarkRef: MutableRefObject<StoredSelectionBookmark | null>) {
  const view = mountedEditorView(editor);
  if (!view) return;
  const root = view.dom;
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode || !root.contains(anchorNode) || !root.contains(focusNode)) return;
  try {
    const anchor = view.posAtDOM(anchorNode, selection.anchorOffset);
    const head = view.posAtDOM(focusNode, selection.focusOffset);
    editor.commands.setTextSelection({ from: Math.min(anchor, head), to: Math.max(anchor, head) });
    selectionBookmarkRef.current = editor.state.selection.getBookmark();
  } catch {
    // Some node selections cannot be represented as a text selection; keep the
    // last ProseMirror bookmark in that case.
  }
}

function toolbarChain(editor: Editor, selectionBookmarkRef: MutableRefObject<StoredSelectionBookmark | null>, options: { focus?: boolean } = {}) {
  restoreSelectionBeforeToolbarCommand(editor, selectionBookmarkRef);
  const chain = editor.chain();
  return options.focus === false ? chain : chain.focus();
}

export function HtmlTiptapEditorSurface(props: { editor: Editor | null; projectId: string | null; runtime: HtmlEditorScreenProps["runtime"] }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const portalMountTokenRef = useRef(0);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [portalVersion, setPortalVersion] = useState(0);
  const [frameHeight, setFrameHeight] = useState(860);
  const frameShell = useMemo(
    () => (props.runtime ? iframeHtmlDocumentShell(props.runtime.document, props.projectId) : ""),
    [props.projectId, props.runtime?.document.bodyAttributes.style, props.runtime?.document.headHTML, props.runtime?.document.htmlAttributes],
  );
  const frameWidth = useMemo(
    () => (props.runtime ? htmlDocumentFrameWidthPx(props.runtime.document) : null),
    [props.runtime?.document.bodyAttributes.style, props.runtime?.document.headHTML],
  );

  useEffect(() => {
    syncEditorBodyClasses(props.editor, props.runtime?.document.bodyAttributes.class || "");
  }, [props.editor, props.runtime?.document.bodyAttributes.class]);

  useEffect(() => {
    portalMountTokenRef.current += 1;
    setPortalRoot(null);
    setFrameHeight(860);
  }, [frameShell]);

  useEffect(() => {
    return () => {
      portalMountTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const doc = portalRoot?.ownerDocument;
    if (!doc) return;
    const updateFrameHeight = () => {
      const body = doc.body;
      const documentElement = doc.documentElement;
      const nextHeight = Math.ceil(Math.max(860, body.scrollHeight, documentElement.scrollHeight, body.getBoundingClientRect().height)) + 2;
      setFrameHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    updateFrameHeight();
    const observer = new MutationObserver(updateFrameHeight);
    observer.observe(doc.documentElement, { attributes: true, childList: true, characterData: true, subtree: true });
    doc.defaultView?.addEventListener("resize", updateFrameHeight);
    return () => {
      observer.disconnect();
      doc.defaultView?.removeEventListener("resize", updateFrameHeight);
    };
  }, [portalRoot, props.runtime?.revision]);

  return (
    <>
      <iframe
        ref={frameRef}
        className="mx-auto block min-h-[860px] max-w-full overflow-clip rounded-[2px] border border-[#B8A07C]/55 bg-white shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)]"
        style={{ height: frameHeight, maxWidth: frameWidth ? "100%" : "980px", width: frameWidth ? `${frameWidth}px` : "100%" }}
        title={props.runtime?.title ?? "HTML document"}
        sandbox="allow-scripts allow-same-origin"
        scrolling="no"
        srcDoc={frameShell}
        onLoad={() => {
          const iframe = frameRef.current;
          const doc = iframe?.contentDocument;
          const root = doc?.getElementById("ai-html-tiptap-root") ?? null;
          if (!doc || !root) {
            setPortalRoot(null);
            return;
          }
          const token = portalMountTokenRef.current + 1;
          portalMountTokenRef.current = token;
          setPortalRoot(null);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (portalMountTokenRef.current !== token) return;
              if (frameRef.current?.contentDocument !== doc) return;
              setPortalRoot(root);
              setPortalVersion((version) => version + 1);
            });
          });
        }}
      />
      {portalRoot
        ? createPortal(
            <EditorContent
              key={`${props.runtime?.id ?? "html"}-${portalVersion}`}
              editor={props.editor}
              className="ai-html-tiptap-editor"
            />,
            portalRoot,
          )
        : null}
    </>
  );
}

function editorBodyHtml(bodyInnerHTML: string, projectId: string | null) {
  return renderHtmlProjectFragmentAssetReferences(normalizeTaskListsForTiptap(bodyInnerHTML || "<p></p>"), projectId);
}

function normalizeTaskListsForTiptap(html: string) {
  const parsed = new DOMParser().parseFromString(`<body>${html || "<p></p>"}</body>`, "text/html");
  parsed.body.querySelectorAll('li[data-type="taskItem"]').forEach((item) => {
    const checkbox = item.querySelector(':scope > label input[type="checkbox"]');
    const contentContainer = Array.from(item.children).find((child) => child.tagName.toLowerCase() === "div");
    if (!checkbox && !contentContainer) return;
    const checked = item.getAttribute("data-checked") ?? (checkbox instanceof HTMLInputElement && checkbox.checked ? "true" : "false");
    const contentNodes = contentContainer ? Array.from(contentContainer.childNodes).map((node) => node.cloneNode(true)) : [];
    item.replaceChildren(...contentNodes);
    item.setAttribute("data-type", "taskItem");
    item.setAttribute("data-checked", checked === "" || checked === "true" ? "true" : "false");
    if (!item.textContent?.trim() && !item.querySelector("p")) item.append(parsed.createElement("p"));
  });
  return parsed.body.innerHTML;
}

function syncEditorBodyClasses(editor: Editor | null, className: string) {
  const element = mountedEditorView(editor)?.dom;
  if (!element) return;
  const previousClasses = classListFromString(element.getAttribute("data-ai-html-body-classes") || "");
  previousClasses.forEach((token) => element.classList.remove(token));
  const nextClasses = classListFromString(className);
  nextClasses.forEach((token) => element.classList.add(token));
  element.setAttribute("data-ai-html-body-classes", nextClasses.join(" "));
}

function classListFromString(className: string) {
  return className.split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

function cleanTiptapHtmlForRuntime(html: string) {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  parsed.body.querySelectorAll("br.ProseMirror-trailingBreak").forEach((node) => node.remove());
  parsed.body.querySelectorAll("svg[data-ai-raw-svg]").forEach((node) => {
    const rawSVG = node.getAttribute("data-ai-raw-svg");
    if (!rawSVG) return;
    const svg = new DOMParser().parseFromString(rawSVG, "image/svg+xml").documentElement;
    if (svg?.tagName.toLowerCase() === "svg") node.replaceWith(parsed.importNode(svg, true));
  });
  return parsed.body.innerHTML;
}

function createTiptapToolbarProps(
  props: HtmlEditorScreenProps,
  editor: Editor,
  toolbarState: ToolbarState,
  onRequestLinkEditor: (draft: LinkDraft) => void,
  onRequestImageFile: () => void,
  selectionBookmarkRef: MutableRefObject<StoredSelectionBookmark | null>,
  pendingImageReplacePositionRef: MutableRefObject<number | null>,
): HtmlEditorScreenProps {
  return {
    ...props,
    toolbarState,
    onHeading: (tagName) => {
      const chain = toolbarChain(editor, selectionBookmarkRef);
      if (tagName === "p") chain.setParagraph().run();
      else if (tagName === "blockquote") chain.toggleBlockquote().run();
      else chain.toggleHeading({ level: Number(tagName.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
    },
    onFormat: (tagName) => {
      const chain = toolbarChain(editor, selectionBookmarkRef);
      if (tagName === "strong") chain.toggleBold().run();
      if (tagName === "em") chain.toggleItalic().run();
      if (tagName === "u") chain.toggleUnderline().run();
      if (tagName === "s") chain.toggleStrike().run();
    },
    onFontFamily: (fontFamily) => {
      toolbarChain(editor, selectionBookmarkRef).setFontFamily(fontFamily).run();
    },
    onFontSize: (fontSize) => {
      toolbarChain(editor, selectionBookmarkRef).setFontSize(fontSize).run();
    },
    onForeColor: (color) => {
      toolbarChain(editor, selectionBookmarkRef).setColor(color).run();
    },
    onBackColor: (color) => {
      toolbarChain(editor, selectionBookmarkRef).setHighlight({ color }).run();
    },
    onToolbarInteractionStart: () => {
      syncDomSelectionBeforeToolbarCommand(editor, selectionBookmarkRef);
    },
    onAlignment: (alignment) => {
      toolbarChain(editor, selectionBookmarkRef).setTextAlign(alignment).run();
    },
    onLineHeight: (lineHeight) => {
      updateCurrentBlockAttributes(editor, { lineHeight: lineHeight || null }, selectionBookmarkRef, { focus: false });
    },
    onLetterSpacing: (letterSpacing) => {
      updateCurrentBlockAttributes(editor, { letterSpacing: letterSpacing || null }, selectionBookmarkRef, { focus: false });
    },
    onLayoutChange: (attributes) => {
      updateCurrentBlockAttributes(editor, nullifyEmptyAttributes(attributes), selectionBookmarkRef);
    },
    onList: (kind) => {
      if (kind === "ordered") toolbarChain(editor, selectionBookmarkRef).toggleOrderedList().run();
      else toolbarChain(editor, selectionBookmarkRef).toggleBulletList().run();
    },
    onChecklist: () => {
      toolbarChain(editor, selectionBookmarkRef).toggleTaskList().run();
    },
    onPickImage: () => {
      pendingImageReplacePositionRef.current = editor.isActive("image") ? editor.state.selection.from : null;
      onRequestImageFile();
    },
    onIndent: () => {
      applyIndentChange(editor, selectionBookmarkRef, 1);
    },
    onOutdent: () => {
      applyIndentChange(editor, selectionBookmarkRef, -1);
    },
    onMoreAction: (action) => {
      const handled = applyTiptapTableAction(editor, action, selectionBookmarkRef);
      if (!handled && !editor.isActive("table")) props.onMoreAction(action);
    },
    onCreateLink: () => {
      const href = editor.getAttributes("link").href;
      onRequestLinkEditor({
        text: selectedText(editor),
        href: typeof href === "string" && href ? href : "https://",
      });
    },
    onApplyLink: (draft) => {
      if (!applyLinkDraft(editor, draft, selectionBookmarkRef)) return;
      props.onCloseLinkEditor();
    },
    onRemoveLink: () => {
      toolbarChain(editor, selectionBookmarkRef).unsetLink().run();
      props.onCloseLinkEditor();
    },
    onUndo: () => {
      toolbarChain(editor, selectionBookmarkRef).undo().run();
    },
    onRedo: () => {
      toolbarChain(editor, selectionBookmarkRef).redo().run();
    },
  };
}

function applyTiptapTableAction(editor: Editor, action: string, selectionBookmarkRef: MutableRefObject<StoredSelectionBookmark | null>) {
  switch (action) {
    case "insertTable":
      return toolbarChain(editor, selectionBookmarkRef).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    case "addRowBefore":
      return toolbarChain(editor, selectionBookmarkRef).addRowBefore().run();
    case "addRowAfter":
      return toolbarChain(editor, selectionBookmarkRef).addRowAfter().run();
    case "addColumnBefore":
      return toolbarChain(editor, selectionBookmarkRef).addColumnBefore().run();
    case "addColumnAfter":
      return toolbarChain(editor, selectionBookmarkRef).addColumnAfter().run();
    case "toggleHeaderRow":
      return toolbarChain(editor, selectionBookmarkRef).toggleHeaderRow().run();
    case "toggleHeaderColumn":
      return toolbarChain(editor, selectionBookmarkRef).toggleHeaderColumn().run();
    case "deleteRow":
      return toolbarChain(editor, selectionBookmarkRef).deleteRow().run();
    case "deleteColumn":
      return toolbarChain(editor, selectionBookmarkRef).deleteColumn().run();
    case "deleteTable":
      return toolbarChain(editor, selectionBookmarkRef).deleteTable().run();
    case "splitCell":
      return toolbarChain(editor, selectionBookmarkRef).splitCell().run();
    default:
      return false;
  }
}

function applyLinkDraft(editor: Editor, draft: LinkDraft, selectionBookmarkRef: MutableRefObject<StoredSelectionBookmark | null>) {
  const href = draft.href.trim();
  if (!href || href === "https://") return false;
  restoreSelectionBeforeToolbarCommand(editor, selectionBookmarkRef);
  const text = draft.text.trim();
  const currentSelectedText = selectedText(editor);
  if (text && (editor.state.selection.empty || text !== currentSelectedText)) {
    return toolbarChain(editor, selectionBookmarkRef).insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href } }] }).run();
  }
  return toolbarChain(editor, selectionBookmarkRef).extendMarkRange("link").setLink({ href }).run();
}

function replaceImageAtPosition(editor: Editor, position: number | null, attributes: { src: string; alt?: string }) {
  if (typeof position !== "number") return false;
  const view = mountedEditorView(editor);
  if (!view) return false;
  const node = editor.state.doc.nodeAt(position);
  if (!node || node.type.name !== "image") return false;
  const nextAttrs = {
    ...node.attrs,
    src: attributes.src,
    alt: attributes.alt || node.attrs.alt || "",
  };
  view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, nextAttrs));
  return true;
}

function selectedText(editor: Editor) {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, "\n");
}

function updateCurrentBlockAttributes(
  editor: Editor,
  attributes: Record<string, string | null>,
  selectionBookmarkRef: MutableRefObject<StoredSelectionBookmark | null>,
  options: { focus?: boolean } = {},
) {
  const chain = toolbarChain(editor, selectionBookmarkRef, options);
  if (editor.isActive("heading")) chain.updateAttributes("heading", attributes);
  else if (editor.isActive("blockquote")) chain.updateAttributes("blockquote", attributes);
  else if (editor.isActive("taskItem")) chain.updateAttributes("taskItem", attributes);
  else if (editor.isActive("listItem")) chain.updateAttributes("listItem", attributes);
  else chain.updateAttributes("paragraph", attributes);
  chain.run();
}

function applyIndentChange(editor: Editor, selectionBookmarkRef: MutableRefObject<StoredSelectionBookmark | null>, direction: 1 | -1) {
  if (editor.isActive("taskItem")) {
    const currentMarginLeft = readCurrentMarginLeft(editor, "taskItem");
    updateCurrentBlockAttributes(editor, { marginLeft: nextIndentMarginLeft(currentMarginLeft, direction) }, selectionBookmarkRef);
    return;
  }
  if (editor.isActive("listItem")) {
    const command = direction > 0 ? toolbarChain(editor, selectionBookmarkRef).sinkListItem("listItem") : toolbarChain(editor, selectionBookmarkRef).liftListItem("listItem");
    if (command.run()) return;
  }
  const blockType = currentIndentBlockType(editor);
  const currentMarginLeft = blockType ? readCurrentMarginLeft(editor, blockType) : "";
  const nextMarginLeft = nextIndentMarginLeft(currentMarginLeft, direction);
  updateCurrentBlockAttributes(editor, { marginLeft: nextMarginLeft }, selectionBookmarkRef);
}

function currentIndentBlockType(editor: Editor) {
  if (editor.isActive("heading")) return "heading";
  if (editor.isActive("blockquote")) return "blockquote";
  if (editor.isActive("taskItem")) return "taskItem";
  if (editor.isActive("listItem")) return "listItem";
  return "paragraph";
}

function readCurrentMarginLeft(editor: Editor, blockType: string) {
  const marginLeft = editor.getAttributes(blockType).marginLeft;
  return typeof marginLeft === "string" ? marginLeft : "";
}

function nextIndentMarginLeft(value: string, direction: 1 | -1) {
  const current = cssLengthPx(value);
  const next = Math.max(0, current + direction * 24);
  return next > 0 ? `${next}px` : null;
}

function cssLengthPx(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 0;
  const match = normalized.match(/^(-?\d*\.?\d+)(px)?$/);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1] || "");
  return Number.isFinite(amount) ? amount : 0;
}

function nullifyEmptyAttributes(attributes: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, value || null]));
}
