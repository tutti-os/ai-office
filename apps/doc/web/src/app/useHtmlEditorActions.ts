import type { ChangeEvent, RefObject } from "react";
import { htmlProjectAssetRuntimeUrl } from "../artifact/runtime/projectAssets";
import type { RuntimeState, SelectionState } from "../artifact/runtime/types";
import { captureSelectionState } from "../artifact/runtime/selection";
import { uploadProjectAsset } from "../api/projects";
import {
  applyInlineFormat,
  appendToElement,
  createLink,
  deleteSelectedElement,
  duplicateElement,
  editTable,
  insertAtPosition,
  insertHtml,
  insertTable,
  insertText,
  moveCursorToEnd,
  moveCursorToStart,
  moveSelectionCursorToEnd,
  moveSelectionCursorToStart,
  removeLink,
  replaceSelection,
  setAlignment,
  setBackColor,
  setElementAttributes,
  setElementStyle,
  setForeColor,
  setFontFamily,
  setFontSize,
  setHeading,
  toggleList,
  wrapSelection,
  type AdjacentInsertPosition,
  type Alignment,
  type ElementStyleAttributes,
  type HeadingTag,
  type ImageAttributes,
  type InlineFormatTag,
  type ListKind,
} from "../artifact/runtime/operations";
import {
  currentSelectionElement,
  imageAltFromFileName,
  imageFromNode,
  isContentBoundOperation,
  isOperationPanelMode,
  isPositionBoundOperation,
  isTableEditAction,
  parseCustomAttributes,
  positionImageSelectionOverlay,
  readCurrentAttributes,
  readCurrentImageAttributes,
  readCurrentLinkHref,
  readCurrentLinkText,
  readCurrentStyles,
  removeImageSelectionOverlay,
  removeSelectedImageObject,
  resolveEditorTarget,
  resizedImageSizeForHandle,
  selectElementInDocument,
  tableActionTitle,
  upsertSelectedImageObject,
} from "./htmlRuntimeDom";
import { renderImageSelectionOverlay } from "./htmlImageSelectionOverlay";
import type { HtmlEditorController } from "./HtmlEditorController";
import {
  operationPanelTitle,
  type AttributeDraft,
  type ImageObjectElement,
  type LinkDraft,
  type OperationPanelMode,
  type ResizeHandle,
  type ToolbarState,
} from "./runtimeWorkbenchTypes";

type Ref<T> = { current: T };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type HtmlEditorActionsInput = {
  activeImageRef: Ref<ImageObjectElement | null>;
  artifactReadOnlyRef: Ref<boolean>;
  attributeDraft: AttributeDraft;
  currentProjectId: string | null;
  htmlEditorController: HtmlEditorController;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  imageDraft: ImageAttributes;
  imageFileInputRef: RefObject<HTMLInputElement | null>;
  lastEditorTargetRef: Ref<Node | null>;
  lastResolvedTargetRef: Ref<Element | null>;
  lastSelectionRef: Ref<SelectionState | null>;
  operationDraft: string;
  operationIsHtml: boolean;
  operationPanelMode: OperationPanelMode;
  operationPosition: AdjacentInsertPosition;
  operationWrapperTag: string;
  pendingImageTargetRef: Ref<ImageObjectElement | null>;
  runtime: RuntimeState | null;
  setAttributeDraft: StateSetter<AttributeDraft>;
  setError: (value: string) => void;
  setImageDraft: StateSetter<ImageAttributes>;
  setLinkDraft: StateSetter<LinkDraft>;
  setLinkEditorOpen: StateSetter<boolean>;
  setOperationDraft: StateSetter<string>;
  setOperationIsHtml: StateSetter<boolean>;
  setOperationPanelMode: StateSetter<OperationPanelMode>;
  setOperationPosition: StateSetter<AdjacentInsertPosition>;
  setStyleDraft: StateSetter<ElementStyleAttributes>;
  setTableDraft: StateSetter<{ rows: string; columns: string }>;
  styleDraft: ElementStyleAttributes;
  tableDraft: { rows: string; columns: string };
  toolbarState: ToolbarState;
};

export function createHtmlEditorActions(input: HtmlEditorActionsInput) {
  const applyFormat = (tagName: InlineFormatTag) => {
    input.htmlEditorController.executeOperation(input.runtime, {
      operationType: `set_${tagName}`,
      description: `Apply ${tagName} formatting`,
      refocus: false,
      mutate: (doc, target) => applyInlineFormat(doc, tagName, target),
    });
  };

  const applyHeading = (tagName: HeadingTag) => {
    input.htmlEditorController.executeOperation(input.runtime, {
      operationType: "setHeading",
      description: `Set block to ${tagName}`,
      mutate: (doc, target) => setHeading(doc, tagName, target),
    });
  };

  const openLinkEditor = () => {
    const doc = input.iframeRef.current?.contentDocument ?? null;
    const liveTarget = doc ? currentSelectionElement(doc) ?? input.lastResolvedTargetRef.current : null;
    const liveSelection = doc ? captureSelectionState(doc, liveTarget ?? input.lastEditorTargetRef.current) : null;
    const currentHref = readCurrentLinkHref(doc, liveTarget ?? input.lastEditorTargetRef.current);
    const currentText = readCurrentLinkText(doc, liveTarget ?? input.lastEditorTargetRef.current);
    const selectedText = liveSelection?.selectedText || input.runtime?.activeSelection?.selectedText || "";
    const hasLinkableSelection = Boolean(liveSelection && liveSelection.selectionType !== "write");
    const hasStoredLinkableSelection = Boolean(input.runtime?.activeSelection && input.runtime.activeSelection.selectionType !== "write");
    const hasInsertionTarget = Boolean(liveTarget ?? input.lastEditorTargetRef.current);
    if (!currentHref && !hasLinkableSelection && !hasStoredLinkableSelection && !input.toolbarState.table && !hasInsertionTarget) return;
    input.setLinkDraft({
      text: currentHref ? currentText : selectedText,
      href: currentHref || "https://",
    });
    input.setOperationPanelMode(null);
    input.setLinkEditorOpen((current) => !current);
  };

  const applyLink = (draft: LinkDraft) => {
    if (!draft.href.trim() || draft.href.trim() === "https://") return;
    const applied = input.htmlEditorController.executeOperation(input.runtime, {
      operationType: "createLink",
      description: "Create link",
      mutate: (doc, target) => createLink(doc, draft.href, target, draft.text),
    });
    if (!applied) return;
    input.setLinkEditorOpen(false);
    input.htmlEditorController.refocusFrame();
  };

  const applyRemoveLink = () => {
    if (!input.toolbarState.link) return;
    const applied = input.htmlEditorController.executeOperation(input.runtime, {
      operationType: "removeLink",
      description: "Remove link",
      mutate: (doc, target) => removeLink(doc, target),
    });
    if (!applied) return;
    input.setLinkEditorOpen(false);
    input.htmlEditorController.refocusFrame();
  };

  const applyFontFamily = (fontFamily: string) => {
    input.htmlEditorController.executeOperation(input.runtime, {
      operationType: "setFontFamily",
      description: `Set font family ${fontFamily}`,
      preferTypingSelection: true,
      refocus: false,
      mutate: (doc, target) => setFontFamily(doc, fontFamily, target),
    });
  };

  const applyFontSize = (fontSize: string) => {
    input.htmlEditorController.executeOperation(input.runtime, {
      operationType: "setFontSize",
      description: `Set font size ${fontSize}`,
      preferTypingSelection: true,
      refocus: false,
      mutate: (doc, target) => setFontSize(doc, fontSize, target),
    });
  };

  const applyForeColor = (color: string) => {
    input.htmlEditorController.executeOperation(input.runtime, {
      operationType: "setForeColor",
      description: `Set text color ${color}`,
      preferTypingSelection: true,
      refocus: false,
      mutate: (doc, target) => setForeColor(doc, color, target),
    });
  };

  const applyBackColor = (color: string) => {
    input.htmlEditorController.executeOperation(input.runtime, {
      operationType: "setBackColor",
      description: `Set fill color ${color}`,
      preferTypingSelection: true,
      refocus: false,
      mutate: (doc, target) => setBackColor(doc, color, target),
    });
  };

  const applyAlignment = (alignment: Alignment) => {
    input.htmlEditorController.executeOperation(input.runtime, {
      operationType: "setAlignment",
      description: `Set alignment ${alignment}`,
      mutate: (doc, target) => setAlignment(doc, alignment, target),
    });
  };

  const requestImageFileSelection = (image?: ImageObjectElement | null) => {
    if (input.artifactReadOnlyRef.current) return;
    const doc = input.iframeRef.current?.contentDocument ?? null;
    const currentImage =
      image ??
      (doc
        ? imageFromNode(input.lastEditorTargetRef.current, doc) ??
          imageFromNode(currentSelectionElement(doc), doc) ??
          imageFromNode(input.lastResolvedTargetRef.current, doc)
        : null);
    input.pendingImageTargetRef.current = currentImage && currentImage.ownerDocument === doc && doc.body.contains(currentImage) ? currentImage : null;
    input.setLinkEditorOpen(false);
    input.setOperationPanelMode(null);
    const fileInput = input.imageFileInputRef.current;
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.click();
  };

  const beginResizeImage = (handle: ResizeHandle, image: ImageObjectElement, overlay: HTMLElement, event: globalThis.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (input.artifactReadOnlyRef.current) return;
    if (!image.ownerDocument.body.contains(image)) return;
    const initial = image.getBoundingClientRect();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const target = event.currentTarget;
    if (target instanceof Element && "setPointerCapture" in target) target.setPointerCapture(event.pointerId);
    const ownerWindow = image.ownerDocument.defaultView ?? window;

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;
      const next = resizedImageSizeForHandle(handle, initial.width, initial.height, deltaX, deltaY);
      image.style.width = `${Math.round(next.width)}px`;
      if (next.height !== null) image.style.height = `${Math.round(next.height)}px`;
      positionImageSelectionOverlay(image, overlay);
    };

    const onPointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault();
      ownerWindow.removeEventListener("pointermove", onPointerMove);
      ownerWindow.removeEventListener("pointerup", onPointerEnd);
      ownerWindow.removeEventListener("pointercancel", onPointerEnd);
      input.activeImageRef.current = image;
      input.lastEditorTargetRef.current = image;
      input.lastResolvedTargetRef.current = image;
      selectElementInDocument(image.ownerDocument, image);
      positionImageSelectionOverlay(image, overlay);
      input.htmlEditorController.syncMutation("resizeImage", "Resize image");
    };

    ownerWindow.addEventListener("pointermove", onPointerMove);
    ownerWindow.addEventListener("pointerup", onPointerEnd);
    ownerWindow.addEventListener("pointercancel", onPointerEnd);
  };

  const selectImageObject = (doc: Document, image: ImageObjectElement) => {
    if (!doc.body.contains(image)) return;
    input.activeImageRef.current = image;
    input.lastEditorTargetRef.current = image;
    input.lastResolvedTargetRef.current = image;
    input.setLinkEditorOpen(false);
    selectElementInDocument(doc, image);
    input.htmlEditorController.syncSelection(image);
    renderImageSelectionOverlay({
      doc,
      image,
      onReplace: requestImageFileSelection,
      onResizeStart: beginResizeImage,
    });
  };

  const clearImageObjectSelection = (doc: Document) => {
    input.activeImageRef.current = null;
    removeImageSelectionOverlay(doc);
  };

  const applyList = (kind: ListKind) => {
    input.htmlEditorController.executeOperation(input.runtime, {
      operationType: `toggle_${kind}_list`,
      description: `Toggle ${kind} list`,
      mutate: (doc, target) => toggleList(doc, kind, target),
    });
  };

  const handleImageFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0] ?? null;
    fileInput.value = "";
    if (input.artifactReadOnlyRef.current) return;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      input.setError("Please choose an image file.");
      return;
    }
    let src = "";
    try {
      if (!input.currentProjectId) throw new Error("Project is not open.");
      const asset = await uploadProjectAsset(input.currentProjectId, file);
      src = htmlProjectAssetRuntimeUrl(input.currentProjectId, asset.fileName);
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
      input.pendingImageTargetRef.current = null;
      return;
    }
    const pendingImage = input.pendingImageTargetRef.current;
    input.pendingImageTargetRef.current = null;
    const doc = input.iframeRef.current?.contentDocument ?? null;
    const existingAttributes =
      pendingImage && doc && pendingImage.ownerDocument === doc && doc.body.contains(pendingImage)
        ? readCurrentImageAttributes(doc, pendingImage)
        : { src: "", alt: "", width: "", height: "" };
    const attributes: ImageAttributes = {
      ...existingAttributes,
      src,
      alt: existingAttributes.alt?.trim() || imageAltFromFileName(file.name),
    };
    input.htmlEditorController.executeOperation(input.runtime, {
      operationType: pendingImage ? "replaceImage" : "insertImage",
      description: pendingImage ? "Replace image" : "Insert image",
      mutate: (operationDoc, target) => {
        const activeImage =
          pendingImage && pendingImage.ownerDocument === operationDoc && operationDoc.body.contains(pendingImage)
            ? pendingImage
            : null;
        return upsertSelectedImageObject(operationDoc, attributes, target, activeImage);
      },
    });
  };

  const applyToolbarMoreAction = (action: string) => {
    if (!action) return;
    if (action === "image") {
      requestImageFileSelection();
      return;
    }
    if (isOperationPanelMode(action)) {
      if (action === "setAttributes" && !input.toolbarState.attributeElement) return;
      if (isContentBoundOperation(action) && !input.toolbarState.contentElement) return;
      if (isPositionBoundOperation(action) && !input.toolbarState.mutableElement) return;
      input.setLinkEditorOpen(false);
      input.setOperationPanelMode(action);
      input.setOperationDraft(action === "insertHtml" || action === "appendHtml" || action === "insertAtPosition" ? "<p></p>" : "");
      input.setOperationIsHtml(action === "insertHtml" || action === "appendHtml" || action === "insertAtPosition");
      if (action === "image") {
        input.setImageDraft(readCurrentImageAttributes(input.iframeRef.current?.contentDocument ?? null, input.lastEditorTargetRef.current));
      }
      if (action === "style") {
        input.setStyleDraft(readCurrentStyles(input.iframeRef.current?.contentDocument ?? null, input.lastEditorTargetRef.current));
      }
      if (action === "setAttributes") {
        input.setAttributeDraft(readCurrentAttributes(input.iframeRef.current?.contentDocument ?? null, input.lastEditorTargetRef.current));
      }
      if (action === "wrapSelection") {
        input.setAttributeDraft({ id: "", className: "", title: "", custom: "" });
      }
      if (action === "table") {
        input.setTableDraft({ rows: "3", columns: "3" });
      }
      if (action === "insertAtPosition") input.setOperationPosition("afterend");
    } else if (action === "insertTable") {
      input.setLinkEditorOpen(false);
      input.setOperationPanelMode("table");
      input.setTableDraft({ rows: "3", columns: "3" });
    } else if (isTableEditAction(action)) {
      if (!input.toolbarState.tableActions[action]) return;
      input.htmlEditorController.executeOperation(input.runtime, {
        operationType: action,
        description: tableActionTitle(action, input.toolbarState.tableHeaderState),
        mutate: (doc, target) => {
          const latestTarget = resolveEditorTarget(
            doc,
            input.lastEditorTargetRef.current,
            input.lastSelectionRef.current?.commonAncestorPath ?? input.runtime?.activeSelection?.commonAncestorPath ?? "",
          );
          const applied = editTable(doc, action, latestTarget ?? target);
          return applied ? currentSelectionElement(doc) ?? latestTarget ?? target ?? true : false;
        },
      });
    } else if (action === "removeImage") {
      if (!input.toolbarState.image) return;
      input.htmlEditorController.executeOperation(input.runtime, {
        operationType: "removeImage",
        description: "Remove image",
        mutate: (doc, target) => removeSelectedImageObject(doc, target, input.activeImageRef.current),
      });
    } else if (action === "duplicateElement") {
      if (!input.toolbarState.mutableElement) return;
      input.htmlEditorController.executeOperation(input.runtime, {
        operationType: "duplicateElement",
        description: "Duplicate selected element",
        mutate: (doc, target) => duplicateElement(doc, target),
      });
    } else if (action === "deleteElement") {
      if (!input.toolbarState.mutableElement) return;
      input.htmlEditorController.executeOperation(input.runtime, {
        operationType: "deleteElement",
        description: "Delete selected element",
        mutate: (doc, target) => deleteSelectedElement(doc, target),
      });
    } else if (action === "cursorStart") {
      if (!input.toolbarState.contentElement && !input.toolbarState.rangeSelection) return;
      input.htmlEditorController.executeOperation(input.runtime, {
        operationType: "moveCursorToStart",
        description: "Move cursor to start",
        mutate: (doc, target) => (input.toolbarState.rangeSelection ? moveSelectionCursorToStart(doc) : target ? moveCursorToStart(doc, target) : false),
      });
    } else if (action === "cursorEnd") {
      if (!input.toolbarState.contentElement && !input.toolbarState.rangeSelection) return;
      input.htmlEditorController.executeOperation(input.runtime, {
        operationType: "moveCursorToEnd",
        description: "Move cursor to end",
        mutate: (doc, target) => (input.toolbarState.rangeSelection ? moveSelectionCursorToEnd(doc) : target ? moveCursorToEnd(doc, target) : false),
      });
    }
  };

  const applyOperationPanel = () => {
    if (!input.operationPanelMode) return;
    const content = input.operationDraft;
    const hasContent = content.length > 0;
    const attributes = {
      id: input.attributeDraft.id.trim() || null,
      class: input.attributeDraft.className.trim() || null,
      title: input.attributeDraft.title.trim() || null,
      ...parseCustomAttributes(input.attributeDraft.custom),
    };
    const applied = input.htmlEditorController.executeOperation(input.runtime, {
      operationType: input.operationPanelMode,
      description: operationPanelTitle[input.operationPanelMode],
      requiresSelection: input.operationPanelMode === "wrapSelection" || input.operationPanelMode === "replaceSelection",
      ...(input.operationPanelMode === "style" ? { refocus: false } : {}),
      mutate: (doc, target) => {
        if (input.operationPanelMode === "insertText") return hasContent ? insertText(doc, content, target) : false;
        if (input.operationPanelMode === "insertHtml") return hasContent ? insertHtml(doc, content, target) : false;
        if (input.operationPanelMode === "replaceSelection") return replaceSelection(doc, content, input.operationIsHtml, target);
        if (input.operationPanelMode === "appendText") return Boolean(target && hasContent && appendToElement(doc, target, content, false));
        if (input.operationPanelMode === "appendHtml") return Boolean(target && hasContent && appendToElement(doc, target, content, true));
        if (input.operationPanelMode === "insertAtPosition") return Boolean(target && hasContent && insertAtPosition(doc, target, content, input.operationPosition, input.operationIsHtml));
        if (input.operationPanelMode === "setAttributes") return setElementAttributes(doc, target, attributes);
        if (input.operationPanelMode === "wrapSelection") return wrapSelection(doc, input.operationWrapperTag, attributes, target);
        if (input.operationPanelMode === "image") return upsertSelectedImageObject(doc, input.imageDraft, target, input.activeImageRef.current);
        if (input.operationPanelMode === "style") return setElementStyle(doc, target, input.styleDraft);
        if (input.operationPanelMode === "table") {
          const rows = Number.parseInt(input.tableDraft.rows, 10);
          const columns = Number.parseInt(input.tableDraft.columns, 10);
          return insertTable(doc, target, Number.isFinite(rows) ? rows : 3, Number.isFinite(columns) ? columns : 3);
        }
        return false;
      },
    });
    if (!applied) return;
    input.setOperationPanelMode(null);
    input.setOperationDraft("");
    if (input.operationPanelMode !== "style") input.htmlEditorController.refocusFrame();
  };

  return {
    applyAlignment,
    applyBackColor,
    applyFontFamily,
    applyFontSize,
    applyForeColor,
    applyFormat,
    applyHeading,
    applyLink,
    applyList,
    applyOperationPanel,
    applyRemoveLink,
    applyToolbarMoreAction,
    clearImageObjectSelection,
    handleImageFileInputChange,
    openLinkEditor,
    requestImageFileSelection,
    selectImageObject,
  };
}
