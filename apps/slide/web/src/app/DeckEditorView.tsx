import { AlignCenter, AlignLeft, AlignRight, Bold, Crosshair, Image, Italic, PaintBucket, Redo2, Strikethrough, Underline, Undo2 } from "lucide-react";
import { scrollbarClass } from "@ai-app/ui/app-shell";
import { ArtifactAgentProcessingOverlay } from "@ai-app/ui/editor-frame";
import { FontSizeControl, Toolbar, ToolbarColorInput, ToolbarDivider, ToolbarGroup, ToolbarIconButton, ToolbarRow, ToolbarSelect, editorToolbarClass, editorToolbarStripClass } from "@ai-app/ui/toolbar";
import type { PointerEvent } from "react";
import type { InlineFormatTag, RichTextStyle } from "@ai-app/ui/rich-text";
import { deckSlideDisplayName } from "@ai-slide/shared";
import { DeckInteractionLayer } from "../artifact/deckInteractionLayerView";
import type { DeckObjectAlignment, DeckObjectElement, DeckObjectGeometry, DeckObjectGeometryPatch, DeckSnapGuide } from "../artifact/deckInteractionLayer";
import { EditorInfoPanel } from "./EditorInfoPanel";
import { SlideFilmstrip } from "./SlideFilmstrip";
import { projectAssetUrl } from "./deckAssetUrls";
import { editingShieldRects } from "./deckEditorGeometry";
import { deckFontOptions, type ActiveDeckObject, type ActiveDeckSelectionBox, type DeckSelectionMode, type DeckToolbarState, type ResizeHandle } from "./deckEditorTypes";
import { fontFamilyLabel, normalizeCssSize } from "./deckEditorDom";
import type { useDeckEditorModel } from "./useDeckEditorModel";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const slideFilmstripClass = "min-h-32 min-w-0 shrink-0 border-t border-[#B8A07C]/30 bg-[#EEE8DC] px-5 pb-4 pt-3.5";

export function DeckEditorView(input: { agentProcessing: boolean; model: ReturnType<typeof useDeckEditorModel> }) {
  const {
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
    canRedo,
    canUndo,
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
  } = input.model;
  if (!manifest || slides.length === 0) {
    return <EditorInfoPanel detail="Deck manifest is empty or unavailable." title={props.detail.project.title} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#EEE8DC]">
      <div className={editorToolbarStripClass}>
        <DeckToolbar
          activeObject={activeObject}
          directTextEditMode={directTextEditMode}
          readOnly={readOnly}
          saveState={saveState}
          selectionMode={selectionMode}
          state={toolbarState}
          onAlign={updateTextAlignment}
          onFillColor={(color) => updateObjectStyle({ backgroundColor: color })}
          onFontFamily={(fontFamily) => updateTextStyle({ fontFamily })}
          onFontSize={(fontSize) => updateTextStyle({ fontSize: normalizeCssSize(fontSize) })}
          onImage={requestImageReplacement}
          onTextColor={updateTextColor}
          onToolbarInteractionStart={preserveActiveTextSelection}
          onToggleBold={() => toggleInlineFormat("strong")}
          onToggleItalic={() => toggleInlineFormat("em")}
          onToggleStrikethrough={() => toggleInlineFormat("s")}
          onToggleDirectTextEditMode={() => setDirectTextEditMode((current) => !current)}
          onToggleUnderline={() => toggleInlineFormat("u")}
        />
      </div>
      <input ref={imageFileInputRef} className="hidden" type="file" accept="image/*" onChange={replaceActiveImageFromFile} />
      <div
        ref={hostRef}
        className={cn("relative flex min-h-0 flex-1 !cursor-default items-center justify-center overflow-auto px-3 pb-5 pt-2.5 outline-none md:px-8 md:pb-7 md:pt-3", scrollbarClass)}
        tabIndex={0}
        onKeyDown={handleSlideNavigationKey}
        onPointerDown={(event) => {
          if (!activeTextEdit) event.currentTarget.focus();
        }}
      >
        <DeckHistoryControls
          canRedo={canRedo}
          canUndo={canUndo}
          readOnly={readOnly}
          onInteractionStart={preserveActiveTextSelection}
          onRedo={() => applyHistoryOffset(1)}
          onUndo={() => applyHistoryOffset(-1)}
        />
        {activeSlide ? (
          (() => {
            const slide = activeSlide;
            const slideTitle = deckSlideDisplayName(slide, activeSlideIndex);
            const isTextEditingSlide = activeTextEdit?.slideId === slide.id && activeSelectionBox?.slideId === slide.id;
            const shieldRects = isTextEditingSlide
              ? editingShieldRects(activeSelectionBox, Math.round(canvas.width * scale), frameHeight)
              : [];
            return (
              <article className="min-w-0 shrink-0" key={slide.id} style={{ width: frameWidth || undefined }}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="inline-flex h-6 items-center rounded-md bg-[#5C6B50] px-[7px] font-mono text-[13px] font-black text-[#F4EFE6]">{String(activeSlideIndex + 1).padStart(2, "0")}</span>
                  <strong className="min-w-0 truncate text-[13px] font-semibold text-[#2A2620]/78">{slideTitle}</strong>
                </div>
                <div
                  className={cn("relative overflow-hidden rounded-[2px] border border-[#B8A07C]/30 bg-white ", selectionMode === "object" && activeObject?.slideId === slide.id ? "border-[#B8A07C]/30" : "")}
                  style={{ width: frameWidth || undefined, height: frameHeight || undefined }}
                >
                  <iframe
                    className={cn("absolute left-0 top-0 block origin-top-left border-0 transition-opacity duration-200", input.agentProcessing ? "opacity-50" : "opacity-100")}
                    height={canvas.height}
                    ref={(iframe) => {
                      if (iframe) initializeFrame(slide, iframe);
                    }}
                    src={projectAssetUrl(props.projectId, props.detail.artifact.fileRef, slide.file, props.detail.artifact.revision)}
                    width={canvas.width}
                    style={{
                      width: canvas.width,
                      height: canvas.height,
                      transform: `scale(${scale})`,
                    }}
                    title={slideTitle}
                    onLoad={(event) => initializeFrame(slide, event.currentTarget)}
                  />
                  <ArtifactAgentProcessingOverlay active={input.agentProcessing} />
                  <DeckInteractionLayer
                    activeObject={activeObject?.slideId === slide.id ? activeObject : null}
                    activeGeometry={activeObject?.slideId === slide.id ? activeObjectGeometry : null}
                    scale={scale}
                    selectionBox={activeSelectionBox?.slideId === slide.id && activeTextEdit?.slideId !== slide.id ? activeSelectionBox : null}
                    snapGuides={snapGuides}
                    readOnly={readOnly}
                    onAlignObject={alignActiveObjectGeometry}
                    onBeginDragObject={beginDragObject}
                    onBeginRotateObject={beginRotateObject}
                    onBeginResizeObject={beginResizeObject}
                    onDeleteObject={deleteActiveObject}
                    onDuplicateObject={duplicateActiveObject}
                    onDoubleClickSelection={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (readOnly) return;
                      enterTextEditFromFramePoint(slide, event.clientX, event.clientY);
                    }}
                    onUpdateObjectGeometry={updateActiveObjectGeometry}
                  />
                  {isTextEditingSlide ? (
                    shieldRects.map((shield, shieldIndex) => (
                      <div
                        className="absolute z-[2] cursor-default bg-transparent"
                        key={shieldIndex}
                        role="presentation"
                        style={shield}
                        onPointerDown={(event) => selectObjectFromFramePoint(slide, event.clientX, event.clientY)}
                        onDoubleClick={(event) => {
                          if (!readOnly) enterTextEditFromFramePoint(slide, event.clientX, event.clientY);
                        }}
                      />
                    ))
                  ) : directTextEditMode ? null : (
                    <div
                      className="absolute inset-0 z-[2] cursor-default bg-transparent"
                      role="presentation"
                      onPointerDown={(event) => selectObjectFromFramePoint(slide, event.clientX, event.clientY)}
                      onDoubleClick={(event) => {
                        if (!readOnly) enterTextEditFromFramePoint(slide, event.clientX, event.clientY);
                      }}
                    />
                  )}
                </div>
              </article>
            );
          })()
        ) : null}
      </div>
      <SlideFilmstrip
        activeId={activeSlide?.id ?? null}
        ariaLabel="Slides"
        className={slideFilmstripClass}
        frameHeight={deckThumbnail.height}
        frameWidth={deckThumbnail.width}
        items={slides.map((slide, index) => ({
          id: slide.id,
          label: String(index + 1).padStart(2, "0"),
          title: deckSlideDisplayName(slide, index),
        }))}
        renderPreview={(item, index) => {
          const slide = slides.find((candidate) => candidate.id === item.id);
          if (!slide) return null;
          return (
            <iframe
              height={canvas.height}
              src={projectAssetUrl(props.projectId, props.detail.artifact.fileRef, slide.file, props.detail.artifact.revision)}
              width={canvas.width}
              style={{
                width: canvas.width,
                height: canvas.height,
                transform: `scale(${deckThumbnail.scale})`,
              }}
              tabIndex={-1}
              title={`${deckSlideDisplayName(slide, index)} thumbnail`}
            />
          );
        }}
        onSelect={activateSlide}
      />
    </div>
  );
}

function DeckHistoryControls(props: {
  canRedo: boolean;
  canUndo: boolean;
  readOnly: boolean;
  onInteractionStart: () => void;
  onRedo: () => void;
  onUndo: () => void;
}) {
  return (
    <div
      className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-[12px] border border-[#B8A07C]/30 bg-[#F9F4EC]/92 p-1 "
      onPointerDownCapture={props.onInteractionStart}
    >
      <ToolbarIconButton disabled={props.readOnly || !props.canUndo} title="Undo" onClick={props.onUndo}>
        <Undo2 size={16} />
      </ToolbarIconButton>
      <ToolbarIconButton disabled={props.readOnly || !props.canRedo} title="Redo" onClick={props.onRedo}>
        <Redo2 size={16} />
      </ToolbarIconButton>
    </div>
  );
}

function DeckToolbar(props: {
  activeObject: ActiveDeckObject | null;
  directTextEditMode: boolean;
  readOnly: boolean;
  saveState: "saved" | "saving" | "error";
  selectionMode: DeckSelectionMode;
  state: DeckToolbarState;
  onAlign: (align: "left" | "center" | "right") => void;
  onFillColor: (color: string) => void;
  onFontFamily: (fontFamily: string) => void;
  onFontSize: (fontSize: string) => void;
  onImage: () => void;
  onTextColor: (color: string) => void;
  onToolbarInteractionStart: () => void;
  onToggleBold: () => void;
  onToggleDirectTextEditMode: () => void;
  onToggleItalic: () => void;
  onToggleStrikethrough: () => void;
  onToggleUnderline: () => void;
}) {
  const disabled = props.readOnly || !props.activeObject;
  const textControlDisabled = disabled || props.selectionMode !== "text";
  const textboxControlDisabled = disabled || props.activeObject?.objectType !== "textbox";
  const imageControlDisabled = props.activeObject?.objectType !== "image";
  const hasCurrentFontOption = deckFontOptions.some((option) => option.value === props.state.fontFamily);
  return (
    <Toolbar
      className={editorToolbarClass}
      display={{ maxWidth: 1500, width: "full" }}
      onPointerDownCapture={props.onToolbarInteractionStart}
    >
      <ToolbarRow wrap className="gap-y-1.5">
        <ToolbarGroup className="[column-gap:4px]">
          <ToolbarSelect compact disabled={textControlDisabled} title="Block style" value={props.state.block} onChange={() => {}}>
            <option value="normal">Normal Text</option>
            <option value="heading">Heading</option>
            <option value="shape">Shape</option>
            <option value="image">Image</option>
          </ToolbarSelect>
          <ToolbarSelect disabled={textControlDisabled} title="Font family" value={props.state.fontFamily} onChange={props.onFontFamily}>
            {hasCurrentFontOption ? null : <option value={props.state.fontFamily}>{fontFamilyLabel(props.state.fontFamily)}</option>}
            {deckFontOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ToolbarSelect>
          <FontSizeControl commitOnInput disabled={textControlDisabled} value={props.state.fontSize} onChange={props.onFontSize} />
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarIconButton active={props.state.bold} disabled={textControlDisabled} title="Bold" onClick={props.onToggleBold}>
            <Bold size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.italic} disabled={textControlDisabled} title="Italic" onClick={props.onToggleItalic}>
            <Italic size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.underline} disabled={textControlDisabled} title="Underline" onClick={props.onToggleUnderline}>
            <Underline size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.strikethrough} disabled={textControlDisabled} title="Strikethrough" onClick={props.onToggleStrikethrough}>
            <Strikethrough size={16} />
          </ToolbarIconButton>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarIconButton active={props.state.align === "left"} disabled={textboxControlDisabled} title="Align left" onClick={() => props.onAlign("left")}>
            <AlignLeft size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.align === "center"} disabled={textboxControlDisabled} title="Align center" onClick={() => props.onAlign("center")}>
            <AlignCenter size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.align === "right"} disabled={textboxControlDisabled} title="Align right" onClick={() => props.onAlign("right")}>
            <AlignRight size={16} />
          </ToolbarIconButton>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarIconButton active={props.directTextEditMode} disabled={props.readOnly} title="Single-click text edit" onClick={props.onToggleDirectTextEditMode}>
            <Crosshair size={16} />
          </ToolbarIconButton>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarColorInput disabled={textboxControlDisabled} title="Text color" color={props.state.textColor} onChange={props.onTextColor} />
          <ToolbarColorInput disabled={disabled} title="Fill color" color={props.state.fillColor} icon={<PaintBucket size={15} />} onChange={props.onFillColor} />
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarIconButton disabled={imageControlDisabled} title="Replace image" onClick={props.onImage}>
            <Image size={16} />
          </ToolbarIconButton>
        </ToolbarGroup>
      </ToolbarRow>
    </Toolbar>
  );
}
