import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Crosshair, Image, Italic, PaintBucket, Redo2, Strikethrough, Underline, Undo2 } from "lucide-react";
import { type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import { applyInlineFormat, applyPresentationStyle, captureRichTextSelection, restoreRichTextSelection, selectionBelongsToElement, type InlineFormatTag, type RichTextSelectionState, type RichTextStyle } from "@ai-app/ui/rich-text";
import { Toolbar, ToolbarColorInput, ToolbarDivider, ToolbarGroup, ToolbarIconButton, ToolbarNumberInput, ToolbarRow, ToolbarSelect } from "@ai-app/ui/toolbar";
import { isArtifactReadOnly, type ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import type { DeckManifestSlide, ProjectDetailResponse, SlideArtifactSelection } from "@ai-slide/shared";
import { DeckInteractionLayer } from "../artifact/deckInteractionLayerView";
import { alignedDeckObjectRect, applyDeckObjectRect, applyDeckObjectRotation, collectDeckSnapTargets, isMovableDeckObject, movedDeckRectForDelta, readDeckObjectGeometry, readDeckObjectRect, resizedDeckRectForHandle, snappedDeckDragRect, type DeckObjectAlignment, type DeckObjectElement, type DeckObjectGeometry, type DeckObjectGeometryPatch, type DeckResizeHandle, type DeckSnapGuide } from "../artifact/deckInteractionLayer";
import type { DeckAgentRuntimeProvider } from "../artifact/deckArtifactAdapter";
import { EditorInfoPanel } from "./EditorInfoPanel";
import { SlideFilmstrip } from "./SlideFilmstrip";
import {
  angleDelta,
  applySlideHtmlSnapshot,
  applyTextAlignmentToObject,
  applyTextColorToObject,
  deckObjectSelectionPath,
  deckTextSelectionPath,
  editingShieldRects,
  enableTextResizeWrapping,
  ensureTextTargetId,
  findTextTargetById,
  fontFamilyLabel,
  hitTestDeckObject,
  hitTestDeckObjectFromElementPoint,
  isElement,
  isHtmlElement,
  isInsideEditable,
  isInsideKeyboardInput,
  nearestElement,
  normalizeCssSize,
  offsetPx,
  placeCaretInElement,
  pointerAngle,
  prepareSlideEditorDocument,
  projectAssetUrl,
  queueTextEditCaretPlacement,
  readActualDeckToolbarState,
  readDeckToolbarState,
  readSelectionBox,
  replaceDeckImageObjectSource,
  selectElementText,
  serializeDeckObjectForAgent,
  serializeSlideDocument,
  snapRotation,
  textTargetForObject,
  textTargetForObjectAtPoint,
} from "./deckEditorDom";
import { DeckEditorController } from "./DeckEditorController";
import { fitScale, nextSlideIndex, scaledHeight, slideDirectionFromKey, thumbnailMetrics, useElementSize } from "./slideView";
import { uploadDeckAsset } from "../api/projects";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const scrollbarHidden = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const slideFilmstripClass = cn("flex min-h-32 min-w-0 shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden border-t border-white/8 bg-[#242424] px-5 pb-4 pt-3.5", scrollbarHidden);

type ActiveDeckObject = {
  slideId: string;
  objectId: string;
  objectType: string;
  label: string;
  movable: boolean;
};

type ActiveDeckSelectionBox = {
  slideId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
};

type ActiveTextEdit = {
  slideId: string;
  objectId: string;
  textTargetId: string;
};

type ActiveTextSelection = ActiveTextEdit & {
  selection: RichTextSelectionState;
};

type TextEditEntryOptions = {
  caretPoint?: { x: number; y: number };
  deferToNativeSelection?: boolean;
  selectContents?: boolean;
  useObjectTextRoot?: boolean;
};

type DeckSelectionMode = "idle" | "object" | "text";

type ResizeHandle = DeckResizeHandle;

type SlideNavigationKeyboardEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
};

type DeckToolbarState = {
  block: "normal" | "heading" | "shape" | "image";
  fontFamily: string;
  fontSize: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  textColor: string;
  fillColor: string;
  align: "left" | "center" | "right" | "";
};

const defaultDeckToolbarState: DeckToolbarState = {
  block: "normal",
  fontFamily: "'PingFang SC', sans-serif",
  fontSize: "16",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textColor: "#1f2937",
  fillColor: "#ffffff",
  align: "",
};

const selectedDeckObjectToolbarState: DeckToolbarState = {
  block: "normal",
  fontFamily: "Inter, sans-serif",
  fontSize: "16",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textColor: "#000000",
  fillColor: "#ffffff",
  align: "",
};

const deckFontOptions = [
  { value: "'PingFang SC', sans-serif", label: "PingFang SC" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "'IBM Plex Sans', sans-serif", label: "IBM Plex Sans" },
  { value: "'IBM Plex Mono', monospace", label: "IBM Plex Mono" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'STIX Two Text', serif", label: "STIX Two Text" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', serif", label: "Times" },
];

export function useDeckEditorModel(props: {
  detail: ProjectDetailResponse;
  interaction: ArtifactInteractionPolicy;
  projectId: string;
  onAgentRuntimeProviderChange: (provider: DeckAgentRuntimeProvider | null) => void;
  onAgentSelectionTextChange: (text: string) => void;
  onSaveStateChange: (state: ArtifactSaveState) => void;
}) {
  const { onSaveStateChange } = props;
  const { ref: hostRef, width: hostWidth, height: hostHeight } = useElementSize<HTMLDivElement>();
  const activeTextSelectionRef = useRef<ActiveTextSelection | null>(null);
  const directTextEditModeRef = useRef(false);
  const readOnlyRef = useRef(false);
  const agentRuntimeSnapshotRef = useRef<DeckAgentRuntimeProvider>(() => null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const activeObjectRef = useRef<ActiveDeckObject | null>(null);
  const activeTextEditRef = useRef<ActiveTextEdit | null>(null);
  const selectionModeRef = useRef<DeckSelectionMode>("idle");
  const [activeObject, setActiveObject] = useState<ActiveDeckObject | null>(null);
  const [activeObjectGeometry, setActiveObjectGeometry] = useState<DeckObjectGeometry | null>(null);
  const [activeSelectionBox, setActiveSelectionBox] = useState<ActiveDeckSelectionBox | null>(null);
  const [activeTextEdit, setActiveTextEdit] = useState<ActiveTextEdit | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<DeckSelectionMode>("idle");
  const [toolbarState, setToolbarState] = useState<DeckToolbarState>(defaultDeckToolbarState);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [historyVersion, setHistoryVersion] = useState(0);
  const [directTextEditMode, setDirectTextEditMode] = useState(false);
  const [snapGuides, setSnapGuides] = useState<DeckSnapGuide[]>([]);
  const [agentSelectionVersion, setAgentSelectionVersion] = useState(0);
  const deckController = useMemo(
    () =>
      new DeckEditorController({
        fileRef: props.detail.artifact.fileRef,
        projectId: props.projectId,
        onHistoryChange: () => setHistoryVersion((version) => version + 1),
        onSaveStateChange: setSaveState,
      }),
    [props.detail.artifact.fileRef, props.projectId],
  );
  const manifest = props.detail.deckManifest;
  const canvas = manifest?.canvas ?? { width: 1920, height: 1080 };
  const slides = manifest?.slides ?? [];
  const activeSlide = slides.find((slide) => slide.id === activeSlideId) ?? slides[0] ?? null;
  const activeSlideIndex = activeSlide ? slides.findIndex((slide) => slide.id === activeSlide.id) : -1;
  const availableFrameWidth = Math.max(0, hostWidth - 64);
  const availableFrameHeight = Math.max(0, hostHeight - 92);
  const scale = fitScale({ availableHeight: availableFrameHeight, availableWidth: availableFrameWidth, height: canvas.height, minScale: 0.4, width: canvas.width });
  const frameHeight = scaledHeight({ height: canvas.height, scale });
  const deckThumbnail = thumbnailMetrics({ height: canvas.height, width: canvas.width });
  const activeHistory = useMemo(() => deckController.getHistory(activeSlideId), [activeSlideId, deckController, historyVersion]);
  const canUndo = Boolean(activeHistory && activeHistory.currentIndex > 0);
  const canRedo = Boolean(activeHistory && activeHistory.currentIndex < activeHistory.entries.length - 1);
  const readOnly = isArtifactReadOnly(props.interaction);

  activeObjectRef.current = activeObject;
  activeTextEditRef.current = activeTextEdit;
  selectionModeRef.current = selectionMode;
  readOnlyRef.current = readOnly;

  useEffect(() => {
    directTextEditModeRef.current = directTextEditMode;
  }, [directTextEditMode]);

  useEffect(() => {
    if (!readOnly) return;
    exitTextEditMode();
    setDirectTextEditMode(false);
    setSnapGuides([]);
  }, [readOnly]);

  useEffect(() => {
    onSaveStateChange(saveState);
  }, [onSaveStateChange, saveState]);

  useEffect(() => {
    return () => deckController.dispose();
  }, [deckController]);

  useEffect(() => {
    if (!activeSlideId && slides[0]?.id) setActiveSlideId(slides[0].id);
  }, [activeSlideId, slides]);

  useEffect(() => {
    if (!activeObject) return;
    const object = findActiveObject();
    if (object) setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
  }, [activeObject, scale]);

  const clearSelections = () => {
    for (const doc of deckController.getDocuments()) {
      doc.querySelectorAll("[data-ai-slide-selected]").forEach((element) => element.removeAttribute("data-ai-slide-selected"));
    }
  };

  const exitTextEditMode = () => {
    activeTextSelectionRef.current = null;
    for (const doc of deckController.getDocuments()) {
      doc.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach((element) => {
        element.removeAttribute("contenteditable");
        element.removeAttribute("spellcheck");
      });
      doc.defaultView?.getSelection()?.removeAllRanges();
    }
  };

  const findActiveObject = () => {
    if (!activeObject) return null;
    const doc = deckController.getDocument(activeObject.slideId);
    return doc?.querySelector<DeckObjectElement>(`[data-ai-slide-object-id="${CSS.escape(activeObject.objectId)}"]`) ?? null;
  };

  const findActiveTextTarget = (object: DeckObjectElement) => {
    if (!activeTextEdit) return textTargetForObject(object);
    return findTextTargetById(object, activeTextEdit.textTargetId) ?? textTargetForObject(object);
  };

  const readAgentSelection = (slide: DeckManifestSlide | null, doc: Document | null, currentSlideHtml: string): SlideArtifactSelection | null => {
    if (!slide) return null;
    const object = findActiveObject();
    if (activeTextEdit && object) {
      const textTarget = findActiveTextTarget(object);
      const saved = activeTextSelectionRef.current;
      const selectionState =
        saved &&
        saved.slideId === activeTextEdit.slideId &&
        saved.objectId === activeTextEdit.objectId &&
        saved.textTargetId === activeTextEdit.textTargetId
          ? saved.selection
          : isHtmlElement(textTarget)
            ? captureRichTextSelection(textTarget.ownerDocument, textTarget)
            : null;
      if (selectionState) {
        const type = selectionState.selectionType === "element" ? "element" : selectionState.selectionType === "text" ? "text" : "write";
        return {
          type,
          text: selectionState.selectedText,
          html: selectionState.selectedHtml,
          path: deckTextSelectionPath(slide.id, object, textTarget, selectionState),
          slideId: slide.id,
          range: {
            startPath: selectionState.startPath,
            startOffset: selectionState.startOffset,
            endPath: selectionState.endPath,
            endOffset: selectionState.endOffset,
          },
        };
      }
    }
    if (activeObject && object) {
      return {
        type: "element",
        text: object.textContent?.replace(/\s+/g, " ").trim() ?? "",
        html: serializeDeckObjectForAgent(object),
        path: deckObjectSelectionPath(slide.id, object),
        slideId: slide.id,
      };
    }
    if (doc) {
      return {
        type: "slide",
        text: slide.title,
        html: currentSlideHtml,
        path: `deck:${slide.id}`,
        slideId: slide.id,
      };
    }
    return {
      type: "none",
      text: "",
      html: "",
      path: "",
      slideId: slide.id,
    };
  };

  const createDeckAgentRuntimeSnapshot = () => {
    const slide = activeSlide;
    const doc = slide ? deckController.getDocument(slide.id) : null;
    const currentSlideHtml = doc?.documentElement ? serializeSlideDocument(doc) : "";
    return {
      title: props.detail.project.title,
      artifactId: props.detail.artifact.id,
      fileRef: props.detail.artifact.fileRef,
      revision: props.detail.artifact.revision,
      activeSlide: slide,
      activeSlideIndex,
      currentSlideHtml,
      selection: readAgentSelection(slide, doc, currentSlideHtml),
    };
  };

  agentRuntimeSnapshotRef.current = createDeckAgentRuntimeSnapshot;

  useEffect(() => {
    const provider = () => agentRuntimeSnapshotRef.current();
    props.onAgentRuntimeProviderChange(provider);
    return () => props.onAgentRuntimeProviderChange(null);
  }, [props.onAgentRuntimeProviderChange]);

  useEffect(() => {
    const selection = createDeckAgentRuntimeSnapshot().selection;
    props.onAgentSelectionTextChange(selection && selection.type !== "slide" && selection.type !== "write" ? selection.text : "");
  }, [activeObject, activeSlideId, activeTextEdit, agentSelectionVersion, props.detail.artifact.revision, props.onAgentSelectionTextChange]);

  const rememberTextSelection = (slideId: string, doc: Document) => {
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const anchor = nearestElement(range.commonAncestorContainer);
    const textTarget = anchor?.closest<HTMLElement>('[contenteditable="true"][data-ai-slide-text-edit-id]');
    const object = textTarget?.closest<HTMLElement>('[data-object="true"][data-ai-slide-object-id]');
    const objectId = object?.getAttribute("data-ai-slide-object-id") ?? "";
    const textTargetId = textTarget?.getAttribute("data-ai-slide-text-edit-id") ?? "";
    if (!textTarget || !objectId || !textTargetId) return;
    const state = captureRichTextSelection(doc, textTarget);
    if (!state) return;
    activeTextSelectionRef.current = { slideId, objectId, textTargetId, selection: state };
    setAgentSelectionVersion((version) => version + 1);
  };

  const restoreActiveTextSelection = (textTarget: HTMLElement) => {
    const saved = activeTextSelectionRef.current;
    if (!activeObject || !activeTextEdit || !saved) return;
    if (saved.slideId !== activeObject.slideId || saved.objectId !== activeObject.objectId || saved.textTargetId !== activeTextEdit.textTargetId) return;
    if (selectionBelongsToElement(textTarget.ownerDocument, textTarget)) return;
    restoreRichTextSelection(textTarget.ownerDocument, saved.selection);
  };

  const selectObject = (slideId: string, object: DeckObjectElement, mode: "object" | "text" = "object", textTarget?: DeckObjectElement) => {
    const objectId = object.getAttribute("data-ai-slide-object-id");
    if (!objectId) return;
    setActiveSlideId(slideId);
    if (mode !== "text") exitTextEditMode();
    clearSelections();
    if (mode === "object") object.setAttribute("data-ai-slide-selected", "true");
    const activeTextTarget = mode === "text" ? ensureTextTargetId(textTarget ?? textTargetForObject(object)) : null;
    const nextActiveObject = {
      slideId,
      objectId,
      objectType: object.getAttribute("data-object-type") ?? "object",
      label: object.getAttribute("data-screen-label") || object.textContent?.trim().slice(0, 64) || "Object",
      movable: isMovableDeckObject(object),
    };
    setActiveObject(nextActiveObject);
    setActiveObjectGeometry(readDeckObjectGeometry(object));
    setActiveSelectionBox(readSelectionBox(slideId, object, scale));
    setActiveTextEdit(activeTextTarget ? { slideId, objectId, textTargetId: activeTextTarget.getAttribute("data-ai-slide-text-edit-id") ?? "" } : null);
    setSelectionMode(mode);
    setToolbarState(activeTextTarget ? readActualDeckToolbarState(object, activeTextTarget) : readDeckToolbarState(object));
  };

  const clearActiveSelection = (options: { preserveToolbar?: boolean } = {}) => {
    exitTextEditMode();
    clearSelections();
    setSnapGuides([]);
    setActiveObject(null);
    setActiveObjectGeometry(null);
    setActiveSelectionBox(null);
    setActiveTextEdit(null);
    setSelectionMode("idle");
    if (!options.preserveToolbar) setToolbarState(defaultDeckToolbarState);
  };

  const activateSlide = (slideId: string) => {
    if (slideId === activeSlideId) return;
    clearActiveSelection();
    setActiveSlideId(slideId);
  };

  const navigateSlide = (direction: -1 | 1, fromSlideId = activeSlideId) => {
    if (!slides.length) return;
    const sourceIndex = fromSlideId ? slides.findIndex((slide) => slide.id === fromSlideId) : -1;
    const currentIndex = sourceIndex >= 0 ? sourceIndex : activeSlideIndex >= 0 ? activeSlideIndex : 0;
    const nextIndex = nextSlideIndex({ count: slides.length, currentIndex, direction });
    const nextSlide = slides[nextIndex];
    if (!nextSlide || nextIndex === currentIndex) return;
    activateSlide(nextSlide.id);
  };

  const recordSlideHistory = (slideId: string, doc: Document) => {
    deckController.recordHistory(slideId, doc);
  };

  const ensureInitialSlideHistory = (slideId: string, doc: Document) => {
    deckController.ensureInitialHistory(slideId, doc);
  };

  const scheduleSlideSave = (slideId: string) => {
    deckController.scheduleSave(slideId);
  };

  const applyHistoryOffset = (offset: -1 | 1, requestedSlideId = activeSlideId) => {
    if (readOnlyRef.current) return;
    const applied = deckController.applyHistoryOffset(requestedSlideId, offset);
    if (!applied) return;
    clearActiveSelection();
    setActiveSlideId(applied.slideId);
  };

  const handleHistoryShortcut = (event: KeyboardEvent, slideId = activeSlideId) => {
    if (readOnlyRef.current) return;
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "y" || (key === "z" && event.shiftKey)) applyHistoryOffset(1, slideId);
    else applyHistoryOffset(-1, slideId);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleSlideNavigationKeyboardEvent(event);
      handleHistoryShortcut(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handleSlideNavigationKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handleSlideNavigationKeyboardEvent(event);
  };

  const handleSlideNavigationKeyboardEvent = (event: SlideNavigationKeyboardEvent, fromSlideId = activeSlideId) => {
    if (shouldIgnoreDeckSlideNavigationEvent(event)) return;
    const direction = slideDirectionFromKey(event.key, "vertical");
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    navigateSlide(direction, fromSlideId);
  };

  const shouldIgnoreDeckSlideNavigationEvent = (event: SlideNavigationKeyboardEvent) => {
    return (
      selectionModeRef.current !== "idle" ||
      Boolean(activeObjectRef.current) ||
      Boolean(activeTextEditRef.current) ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      isInsideKeyboardInput(event.target)
    );
  };

  const initializeFrame = (slide: DeckManifestSlide, iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    deckController.registerFrame(slide.id, iframe);
    const doc = iframe.contentDocument;
    if (!doc || !doc.head || !doc.body || deckController.isFrameInitialized(doc)) return;
    deckController.markFrameInitialized(doc);
    prepareSlideEditorDocument(doc, { fileRef: props.detail.artifact.fileRef, projectId: props.projectId });
    if (doc.location.href !== "about:blank") ensureInitialSlideHistory(slide.id, doc);
    doc.addEventListener(
      "mousedown",
      (event) => {
        if (!directTextEditModeRef.current || event.button !== 0 || isInsideEditable(event.target)) return;
        if (readOnlyRef.current) return;
        const target = isElement(event.target) ? event.target.closest<DeckObjectElement>('[data-object="true"]') : null;
        if (!target || target.getAttribute("data-object-type") !== "textbox") return;
        setActiveSlideId(slide.id);
        // Enable the whole textbox before the browser's default mousedown selection runs.
        enterTextEditMode(slide.id, target, target, {
          deferToNativeSelection: true,
          selectContents: false,
          useObjectTextRoot: true,
        });
      },
      true,
    );
    doc.addEventListener(
      "click",
      (event) => {
        setActiveSlideId(slide.id);
        const target = isElement(event.target) ? event.target.closest<DeckObjectElement>('[data-object="true"]') : null;
        if (!target) {
          clearActiveSelection({ preserveToolbar: true });
          return;
        }
        if (isInsideEditable(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        if (!readOnlyRef.current && target.getAttribute("data-object-type") === "textbox" && directTextEditModeRef.current) {
          enterTextEditMode(slide.id, target, target, {
            caretPoint: event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : undefined,
            selectContents: false,
            useObjectTextRoot: true,
          });
        } else {
          selectObject(slide.id, target);
        }
      },
      true,
    );
    doc.addEventListener(
      "dblclick",
      (event) => {
        setActiveSlideId(slide.id);
        const target = isElement(event.target) ? event.target.closest<DeckObjectElement>('[data-object="true"]') : null;
        if (!target) return;
        if (!readOnlyRef.current && target.getAttribute("data-object-type") === "textbox") enterTextEditMode(slide.id, target, isElement(event.target) ? event.target : undefined);
        else selectObject(slide.id, target);
      },
      true,
    );
    doc.addEventListener(
      "input",
      () => {
        if (readOnlyRef.current) return;
        rememberTextSelection(slide.id, doc);
        recordSlideHistory(slide.id, doc);
        scheduleSlideSave(slide.id);
      },
      true,
    );
    doc.addEventListener("selectionchange", () => rememberTextSelection(slide.id, doc));
    doc.addEventListener("keyup", () => rememberTextSelection(slide.id, doc), true);
    doc.addEventListener("mouseup", () => rememberTextSelection(slide.id, doc), true);
    doc.addEventListener(
      "keydown",
      (event) => {
        handleSlideNavigationKeyboardEvent(event, slide.id);
        handleHistoryShortcut(event, slide.id);
      },
      true,
    );
  };

  const selectObjectFromFramePoint = (slide: DeckManifestSlide, clientX: number, clientY: number) => {
    const iframe = deckController.getIframe(slide.id);
    const doc = deckController.getDocument(slide.id);
    if (!iframe || !doc) return;
    setActiveSlideId(slide.id);
    initializeFrame(slide, iframe);
    const rect = iframe.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const target = hitTestDeckObject(doc, x, y) ?? hitTestDeckObjectFromElementPoint(doc, x, y);
    if (!readOnlyRef.current && target?.getAttribute("data-object-type") === "textbox" && directTextEditModeRef.current) {
      enterTextEditMode(slide.id, target, target, {
        caretPoint: { x, y },
        selectContents: false,
        useObjectTextRoot: true,
      });
    }
    else if (target) selectObject(slide.id, target);
    else if (activeTextEdit?.slideId === slide.id) clearActiveSelection({ preserveToolbar: true });
  };

  const enterTextEditFromFramePoint = (slide: DeckManifestSlide, clientX: number, clientY: number) => {
    if (readOnlyRef.current) return;
    const iframe = deckController.getIframe(slide.id);
    const doc = deckController.getDocument(slide.id);
    if (!iframe || !doc) return;
    setActiveSlideId(slide.id);
    initializeFrame(slide, iframe);
    const rect = iframe.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const target = hitTestDeckObject(doc, x, y) ?? hitTestDeckObjectFromElementPoint(doc, x, y);
    if (!target) return;
    if (target.getAttribute("data-object-type") === "textbox") enterTextEditMode(slide.id, target, textTargetForObjectAtPoint(target, x, y));
    else selectObject(slide.id, target);
  };

  const enterTextEditMode = (slideId: string, object: DeckObjectElement, preferredTarget?: Element, options: TextEditEntryOptions = {}) => {
    if (readOnlyRef.current) return;
    setActiveSlideId(slideId);
    if (!isHtmlElement(object)) {
      selectObject(slideId, object);
      return;
    }
    const textTarget = options.useObjectTextRoot ? object : textTargetForObject(object, preferredTarget);
    if (!isHtmlElement(textTarget)) {
      selectObject(slideId, object);
      return;
    }
    exitTextEditMode();
    selectObject(slideId, object, "text", textTarget);
    textTarget.contentEditable = "true";
    textTarget.spellcheck = true;
    textTarget.focus();
    const rememberCurrentSelection = () => {
      const selection = captureRichTextSelection(textTarget.ownerDocument, textTarget);
      if (!selection) return;
      activeTextSelectionRef.current = {
        slideId,
        objectId: object.getAttribute("data-ai-slide-object-id") ?? "",
        textTargetId: textTarget.getAttribute("data-ai-slide-text-edit-id") ?? "",
        selection,
      };
    };
    if (options.deferToNativeSelection) {
      return;
    }
    if (options.selectContents === false) {
      placeCaretInElement(textTarget, options.caretPoint);
      queueTextEditCaretPlacement(textTarget, options.caretPoint, rememberCurrentSelection);
    } else {
      selectElementText(textTarget);
    }
    rememberCurrentSelection();
  };

  const beginResizeObject = (handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (readOnlyRef.current) return;
    const object = findActiveObject();
    if (!object || !activeObject || !activeSelectionBox || scale <= 0) return;
    const initialRect = readDeckObjectRect(object);
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - startClientX) / scale;
      const deltaY = (moveEvent.clientY - startClientY) / scale;
      const nextRect = resizedDeckRectForHandle(handle, initialRect, deltaX, deltaY, canvas.width, canvas.height);
      applyDeckObjectRect(object, nextRect, { onTextboxResize: enableTextResizeWrapping });
      setActiveObjectGeometry(readDeckObjectGeometry(object));
      setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
    };

    const onPointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
      setActiveObjectGeometry(readDeckObjectGeometry(object));
      recordSlideHistory(activeObject.slideId, object.ownerDocument);
      scheduleSlideSave(activeObject.slideId);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  };

  const beginDragObject = (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (readOnlyRef.current) return;
    const object = findActiveObject();
    if (!object || !activeObject || scale <= 0 || !isMovableDeckObject(object)) return;
    const initialRect = readDeckObjectRect(object);
    const snapTargets = collectDeckSnapTargets(object, canvas.width, canvas.height);
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let didMove = false;
    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - startClientX) / scale;
      const deltaY = (moveEvent.clientY - startClientY) / scale;
      if (!didMove && Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY) < 2) return;
      didMove = true;
      const rawRect = movedDeckRectForDelta(initialRect, deltaX, deltaY, canvas.width, canvas.height);
      const snapped = snappedDeckDragRect(rawRect, snapTargets, 8 / scale, canvas.width, canvas.height);
      applyDeckObjectRect(object, snapped.rect, { onTextboxResize: enableTextResizeWrapping, preserveSize: true });
      setActiveObjectGeometry(readDeckObjectGeometry(object));
      setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
      setSnapGuides(snapped.guides);
    };

    const onPointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      setSnapGuides([]);
      setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
      setActiveObjectGeometry(readDeckObjectGeometry(object));
      if (!didMove) return;
      recordSlideHistory(activeObject.slideId, object.ownerDocument);
      scheduleSlideSave(activeObject.slideId);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  };

  const beginRotateObject = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (readOnlyRef.current) return;
    const object = findActiveObject();
    if (!object || !activeObject || !activeSelectionBox || scale <= 0) return;
    const selectionElement = event.currentTarget.parentElement;
    const stage = selectionElement?.offsetParent instanceof HTMLElement ? selectionElement.offsetParent : null;
    const stageRect = stage?.getBoundingClientRect();
    if (!stageRect) return;
    const initialGeometry = readDeckObjectGeometry(object);
    const centerClientX = stageRect.left + activeSelectionBox.left + activeSelectionBox.width / 2;
    const centerClientY = stageRect.top + activeSelectionBox.top + activeSelectionBox.height / 2;
    let previousAngle = pointerAngle(event.clientX, event.clientY, centerClientX, centerClientY);
    let rawRotation = initialGeometry.rotation;
    let totalDelta = 0;
    let didRotate = false;
    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const nextAngle = pointerAngle(moveEvent.clientX, moveEvent.clientY, centerClientX, centerClientY);
      const delta = angleDelta(previousAngle, nextAngle);
      previousAngle = nextAngle;
      rawRotation += delta;
      totalDelta += delta;
      if (!didRotate && Math.abs(totalDelta) < 0.5) return;
      didRotate = true;
      const rotation = moveEvent.shiftKey ? snapRotation(rawRotation, 15) : rawRotation;
      applyDeckObjectRotation(object, rotation);
      setActiveObjectGeometry(readDeckObjectGeometry(object));
      setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
    };

    const onPointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      setActiveObjectGeometry(readDeckObjectGeometry(object));
      setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
      if (!didRotate) return;
      recordSlideHistory(activeObject.slideId, object.ownerDocument);
      scheduleSlideSave(activeObject.slideId);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  };

  const mutateActiveObject = (mutate: (object: DeckObjectElement, textTarget: DeckObjectElement) => void) => {
    if (readOnlyRef.current) return;
    const object = findActiveObject();
    if (!object || !activeObject) return;
    const textTarget = findActiveTextTarget(object);
    mutate(object, textTarget);
    if (!activeTextEdit) object.setAttribute("data-ai-slide-selected", "true");
    setActiveObjectGeometry(readDeckObjectGeometry(object));
    setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
    setToolbarState(activeTextEdit ? readActualDeckToolbarState(object, textTarget) : readDeckToolbarState(object));
    recordSlideHistory(activeObject.slideId, object.ownerDocument);
    scheduleSlideSave(activeObject.slideId);
  };

  const applyActiveTextOperation = (operation: (doc: Document, textTarget: HTMLElement) => boolean) => {
    if (!activeTextEdit) return;
    mutateActiveObject((_object, textTarget) => {
      if (!isHtmlElement(textTarget)) return;
      restoreActiveTextSelection(textTarget);
      operation(textTarget.ownerDocument, textTarget);
      const selection = captureRichTextSelection(textTarget.ownerDocument, textTarget);
      if (selection) activeTextSelectionRef.current = { ...activeTextEdit, selection };
    });
  };

  const updateTextStyle = (style: RichTextStyle) => {
    applyActiveTextOperation((doc, textTarget) => applyPresentationStyle(doc, style, textTarget));
  };

  const updateTextAlignment = (align: "left" | "center" | "right") => {
    if (activeTextEdit) {
      updateTextStyle({ textAlign: align });
      return;
    }
    mutateActiveObject((object) => {
      applyTextAlignmentToObject(object, align);
    });
  };

  const updateTextColor = (color: string) => {
    if (activeTextEdit) {
      updateTextStyle({ color });
      return;
    }
    mutateActiveObject((object) => {
      applyTextColorToObject(object, color);
    });
  };

  const toggleInlineFormat = (tagName: InlineFormatTag) => {
    applyActiveTextOperation((doc, textTarget) => applyInlineFormat(doc, tagName, textTarget));
  };

  const updateObjectStyle = (style: Partial<CSSStyleDeclaration>) => {
    mutateActiveObject((object) => {
      Object.assign(object.style, style);
    });
  };

  const requestImageReplacement = () => {
    if (readOnlyRef.current) return;
    if (activeObject?.objectType !== "image") return;
    const input = imageFileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const replaceActiveImageFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (readOnlyRef.current) return;
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const asset = await uploadDeckAsset(props.projectId, file);
      const src = projectAssetUrl(props.projectId, props.detail.artifact.fileRef, `assets/${asset.fileName}`);
      mutateActiveObject((object) => {
        replaceDeckImageObjectSource(object, src);
      });
    } catch {
      setSaveState("error");
    }
  };

  const updateActiveObjectGeometry = (patch: DeckObjectGeometryPatch) => {
    mutateActiveObject((object) => {
      const current = readDeckObjectGeometry(object);
      const nextRect = {
        left: patch.left ?? current.left,
        top: patch.top ?? current.top,
        width: patch.width ?? current.width,
        height: patch.height ?? current.height,
      };
      const rectChanged =
        nextRect.left !== current.left ||
        nextRect.top !== current.top ||
        nextRect.width !== current.width ||
        nextRect.height !== current.height;
      if (rectChanged) {
        const sizeChanged = patch.width !== undefined || patch.height !== undefined;
        applyDeckObjectRect(object, nextRect, { onTextboxResize: enableTextResizeWrapping, preserveSize: !sizeChanged });
      }
      if (patch.rotation !== undefined) applyDeckObjectRotation(object, patch.rotation);
    });
  };

  const alignActiveObjectGeometry = (alignment: DeckObjectAlignment) => {
    mutateActiveObject((object) => {
      const current = readDeckObjectGeometry(object);
      const nextRect = alignedDeckObjectRect(current, alignment, canvas.width, canvas.height);
      applyDeckObjectRect(object, nextRect, { onTextboxResize: enableTextResizeWrapping, preserveSize: true });
    });
  };

  const duplicateActiveObject = () => {
    mutateActiveObject((object) => {
      const clone = object.cloneNode(true) as DeckObjectElement;
      clone.removeAttribute("data-ai-slide-selected");
      clone.removeAttribute("contenteditable");
      clone.querySelectorAll?.("[contenteditable], [data-ai-slide-text-edit-id]").forEach((element) => {
        element.removeAttribute("contenteditable");
        element.removeAttribute("spellcheck");
        element.removeAttribute("data-ai-slide-text-edit-id");
      });
      clone.setAttribute("data-ai-slide-object-id", `object-${Date.now().toString(36)}`);
      clone.style.left = offsetPx(clone.style.left, 24);
      clone.style.top = offsetPx(clone.style.top, 24);
      object.after(clone);
    });
  };

  const deleteActiveObject = () => {
    if (readOnlyRef.current) return;
    const object = findActiveObject();
    if (!object || !activeObject) return;
    object.remove();
    setActiveObject(null);
    setActiveObjectGeometry(null);
    setActiveSelectionBox(null);
    setActiveTextEdit(null);
    setSelectionMode("idle");
    recordSlideHistory(activeObject.slideId, object.ownerDocument);
    scheduleSlideSave(activeObject.slideId);
  };

  return {
    activeObject,
    activeObjectGeometry,
    activeSelectionBox,
    activeSlide,
    activeSlideIndex,
    activeTextEdit,
    activateSlide,
    alignActiveObjectGeometry,
    applyHistoryOffset,
    beginDragObject,
    beginResizeObject,
    beginRotateObject,
    canRedo: !readOnly && canRedo,
    canUndo: !readOnly && canUndo,
    canvas,
    deckThumbnail,
    deleteActiveObject,
    directTextEditMode,
    duplicateActiveObject,
    enterTextEditFromFramePoint,
    frameHeight,
    handleSlideNavigationKey,
    hostRef,
    imageFileInputRef,
    initializeFrame,
    manifest,
    props,
    readOnly,
    replaceActiveImageFromFile,
    requestImageReplacement,
    saveState,
    scale,
    selectObjectFromFramePoint,
    selectionMode,
    setDirectTextEditMode,
    slides,
    snapGuides,
    toolbarState,
    toggleInlineFormat,
    updateActiveObjectGeometry,
    updateObjectStyle,
    updateTextAlignment,
    updateTextColor,
    updateTextStyle,
  };
}
