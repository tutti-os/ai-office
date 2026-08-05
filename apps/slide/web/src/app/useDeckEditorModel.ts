import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import { captureRichTextSelection, restoreRichTextSelection, selectionBelongsToElement } from "@ai-app/ui/rich-text";
import { isArtifactReadOnly, type ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import { deckSlideDisplayName, type DeckManifestSlide, type ProjectDetailResponse, type SlideArtifactSelection } from "@ai-slide/shared";
import { isMovableDeckObject, readDeckObjectGeometry, type DeckObjectElement, type DeckObjectGeometry, type DeckSnapGuide } from "../artifact/deckInteractionLayer";
import type { DeckAgentRuntimeProvider } from "../artifact/deckArtifactAdapter";
import {
  applySlideHtmlSnapshot,
  deckObjectSelectionPath,
  deckTextSelectionPath,
  ensureTextTargetId,
  findTextTargetById,
  fontFamilyLabel,
  hitTestDeckObject,
  hitTestDeckObjectFromElementPoint,
  isElement,
  isHtmlElement,
  isInsideKeyboardInput,
  nearestElement,
  normalizeCssSize,
  placeCaretInElement,
  prepareSlideEditorDocument,
  queueTextEditCaretPlacement,
  readActualDeckToolbarState,
  readDeckToolbarState,
  readSelectionBox,
  selectElementText,
  serializeDeckObjectForAgent,
  serializeSlideDocument,
  textTargetForObject,
  textTargetForObjectAtPoint,
} from "./deckEditorDom";
import { editingShieldRects } from "./deckEditorGeometry";
import { useDeckObjectPointerActions } from "./useDeckObjectPointerActions";
import { useDeckObjectMutations } from "./useDeckObjectMutations";
import { attachDeckFrameEventHandlers } from "./deckFrameEvents";
import { defaultDeckToolbarState, type ActiveDeckObject, type ActiveDeckSelectionBox, type ActiveTextEdit, type ActiveTextSelection, type DeckSelectionMode, type DeckToolbarState, type SlideNavigationKeyboardEvent, type TextEditEntryOptions } from "./deckEditorTypes";
import { DeckEditorController } from "./DeckEditorController";
import { fitScale, nextSlideIndex, scaledHeight, scaledWidth, slideDirectionFromKey, thumbnailMetrics, useElementSize } from "./slideView";

export function useDeckEditorModel(props: {
  detail: ProjectDetailResponse;
  interaction: ArtifactInteractionPolicy;
  projectId: string;
  onAgentRuntimeProviderChange: (provider: DeckAgentRuntimeProvider | null) => void;
  onAgentSelectionPreviewChange: (preview: { label: string; text: string; visible: boolean }) => void;
  onSaveStateChange: (state: ArtifactSaveState) => void;
  selectedBlockLabel: string; selectedTextLabel: string;
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
  const lastExternalRevisionRef = useRef(props.detail.artifact.revision);
  const deckController = useMemo(
    () =>
      new DeckEditorController({
        artifactRevision: props.detail.artifact.revision,
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
  const availableFrameHeight = Math.max(0, hostHeight - 72);
  const scale = fitScale({ availableHeight: availableFrameHeight, availableWidth: availableFrameWidth, height: canvas.height, minScale: 0.4, width: canvas.width });
  const frameWidth = scaledWidth({ scale, width: canvas.width });
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
    lastExternalRevisionRef.current = props.detail.artifact.revision;
    deckController.setArtifactRevision(props.detail.artifact.revision);
  }, [deckController, props.detail.artifact.fileRef, props.projectId]);

  useEffect(() => {
    // Agent owns the deck while running; human cannot edit. Drop any pending
    // human autosave so a stale iframe cannot overwrite agent writes.
    deckController.setSavesAllowed(!readOnly);
  }, [deckController, readOnly]);

  useEffect(() => {
    const nextRevision = props.detail.artifact.revision;
    if (nextRevision === lastExternalRevisionRef.current) return;
    lastExternalRevisionRef.current = nextRevision;
    deckController.setArtifactRevision(nextRevision);
    deckController.discardPendingSaves();
    // External revision bumps remount iframes via asset URLs; clear local undo
    // so it cannot re-apply pre-agent HTML after the reload.
    deckController.clearHistories();
  }, [deckController, props.detail.artifact.revision]);

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
        text: deckSlideDisplayName(slide, activeSlideIndex),
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
    if (!selection || selection.type === "slide" || selection.type === "write" || selection.type === "none") {
      props.onAgentSelectionPreviewChange({ label: props.selectedTextLabel, text: "", visible: false });
      return;
    }
    if (activeObject && !activeTextEdit) {
      props.onAgentSelectionPreviewChange({ label: props.selectedBlockLabel, text: "", visible: true });
      return;
    }
    props.onAgentSelectionPreviewChange({ label: props.selectedTextLabel, text: selection.text, visible: Boolean(selection.text.trim()) });
  }, [activeObject, activeSlideId, activeTextEdit, agentSelectionVersion, props.detail.artifact.revision, props.onAgentSelectionPreviewChange, props.selectedBlockLabel, props.selectedTextLabel]);

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

  const preserveActiveTextSelection = () => {
    if (!activeTextEdit) return;
    const object = findActiveObject();
    if (!object) return;
    const textTarget = findActiveTextTarget(object);
    if (!isHtmlElement(textTarget)) return;
    const selection = captureRichTextSelection(textTarget.ownerDocument, textTarget);
    if (!selection) return;
    activeTextSelectionRef.current = { ...activeTextEdit, selection };
    setAgentSelectionVersion((version) => version + 1);
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
    const direction = slideDirectionFromKey(event.key, "all");
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
    attachDeckFrameEventHandlers({
      slide,
      doc,
      directTextEditModeRef,
      readOnlyRef,
      clearActiveSelection,
      enterTextEditMode,
      handleHistoryShortcut,
      handleSlideNavigationKeyboardEvent,
      recordSlideHistory,
      rememberTextSelection,
      scheduleSlideSave,
      selectObject,
      setActiveSlideId,
    });
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
    else clearActiveSelection();
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

  const { beginDragObject, beginResizeObject, beginRotateObject } = useDeckObjectPointerActions({
    activeObject,
    activeSelectionBox,
    canvas,
    findActiveObject,
    readOnlyRef,
    scale,
    recordSlideHistory,
    scheduleSlideSave,
    setActiveObjectGeometry,
    setActiveSelectionBox,
    setSnapGuides,
  });

  const { alignActiveObjectGeometry, deleteActiveObject, duplicateActiveObject, replaceActiveImageFromFile, requestImageReplacement, toggleInlineFormat, updateActiveObjectGeometry, updateObjectStyle, updateTextAlignment, updateTextColor, updateTextStyle } = useDeckObjectMutations({
    activeObject,
    activeTextEdit,
    activeTextSelectionRef,
    canvas,
    fileRef: props.detail.artifact.fileRef,
    findActiveObject,
    findActiveTextTarget,
    imageFileInputRef,
    projectId: props.projectId,
    readOnlyRef,
    restoreActiveTextSelection,
    scale,
    recordSlideHistory,
    scheduleSlideSave,
    setActiveObject,
    setActiveObjectGeometry,
    setActiveSelectionBox,
    setActiveTextEdit,
    setSaveState,
    setSelectionMode,
    setToolbarState,
  });

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
    frameWidth,
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
    preserveActiveTextSelection,
    toolbarState,
    toggleInlineFormat,
    updateActiveObjectGeometry,
    updateObjectStyle,
    updateTextAlignment,
    updateTextColor,
    updateTextStyle,
  };
}
