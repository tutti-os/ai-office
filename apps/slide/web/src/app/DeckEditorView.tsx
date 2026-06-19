import { AlignCenter, AlignLeft, AlignRight, Bold, Crosshair, Image, Italic, PaintBucket, Redo2, Strikethrough, Underline, Undo2 } from "lucide-react";
import { Toolbar, ToolbarColorInput, ToolbarDivider, ToolbarGroup, ToolbarIconButton, ToolbarNumberInput, ToolbarRow, ToolbarSelect } from "@ai-app/ui/toolbar";
import type { PointerEvent } from "react";
import type { InlineFormatTag, RichTextStyle } from "@ai-app/ui/rich-text";
import { DeckInteractionLayer } from "../artifact/deckInteractionLayerView";
import type { DeckObjectAlignment, DeckObjectElement, DeckObjectGeometry, DeckObjectGeometryPatch, DeckResizeHandle, DeckSnapGuide } from "../artifact/deckInteractionLayer";
import { EditorInfoPanel } from "./EditorInfoPanel";
import { SlideFilmstrip } from "./SlideFilmstrip";
import { editingShieldRects, fontFamilyLabel, normalizeCssSize, projectAssetUrl } from "./deckEditorDom";
import type { useDeckEditorModel } from "./useDeckEditorModel";

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

type DeckSelectionMode = "idle" | "object" | "text";

type ResizeHandle = DeckResizeHandle;

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

export function DeckEditorView(input: { model: ReturnType<typeof useDeckEditorModel> }) {
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
    handleSlideNavigationKey,
    hostRef,
    imageFileInputRef,
    initializeFrame,
    manifest,
    props,
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
  } = input.model;
  if (!manifest || slides.length === 0) {
    return <EditorInfoPanel detail="Deck manifest is empty or unavailable." title={props.detail.project.title} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#2a2a2a] px-3 py-3.5 md:px-6 md:pb-6 md:pt-5">
      <DeckToolbar
        activeObject={activeObject}
        directTextEditMode={directTextEditMode}
        saveState={saveState}
        selectionMode={selectionMode}
        state={toolbarState}
        canRedo={canRedo}
        canUndo={canUndo}
        onAlign={updateTextAlignment}
        onFillColor={(color) => updateObjectStyle({ backgroundColor: color })}
        onFontFamily={(fontFamily) => updateTextStyle({ fontFamily })}
        onFontSize={(fontSize) => updateTextStyle({ fontSize: normalizeCssSize(fontSize) })}
        onImage={requestImageReplacement}
        onRedo={() => applyHistoryOffset(1)}
        onTextColor={updateTextColor}
        onToggleBold={() => toggleInlineFormat("strong")}
        onToggleItalic={() => toggleInlineFormat("em")}
        onToggleStrikethrough={() => toggleInlineFormat("s")}
        onToggleDirectTextEditMode={() => setDirectTextEditMode((current) => !current)}
        onToggleUnderline={() => toggleInlineFormat("u")}
        onUndo={() => applyHistoryOffset(-1)}
      />
      <input ref={imageFileInputRef} className="hidden" type="file" accept="image/*" onChange={replaceActiveImageFromFile} />
      <div
        ref={hostRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-0 pb-5 pt-2.5 outline-none md:px-2 md:pb-7 md:pt-3"
        tabIndex={0}
        onKeyDown={handleSlideNavigationKey}
        onPointerDown={(event) => {
          if (!activeTextEdit) event.currentTarget.focus();
        }}
      >
        {activeSlide ? (
          (() => {
            const slide = activeSlide;
            const isTextEditingSlide = activeTextEdit?.slideId === slide.id && activeSelectionBox?.slideId === slide.id;
            const shieldRects = isTextEditingSlide
              ? editingShieldRects(activeSelectionBox, Math.round(canvas.width * scale), frameHeight)
              : [];
            return (
              <article className="w-[min(100%,1100px)] min-w-0 shrink-0" key={slide.id}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="inline-flex h-6 items-center rounded-md bg-white/10 px-[7px] font-mono text-[12px] font-black text-white/72">{String(activeSlideIndex + 1).padStart(2, "0")}</span>
                  <strong className="min-w-0 truncate text-[12px] font-extrabold text-white/78">{slide.title}</strong>
                </div>
                <div className={cn("relative overflow-hidden rounded-[2px] border border-black/30 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.55)]", selectionMode === "object" && activeObject?.slideId === slide.id ? "border-blue-500/75" : "")} style={{ height: frameHeight || undefined }}>
                  <iframe
                    className="absolute left-0 top-0 block origin-top-left border-0"
                    ref={(iframe) => {
                      if (iframe) initializeFrame(slide, iframe);
                    }}
                    src={projectAssetUrl(props.projectId, props.detail.artifact.fileRef, slide.file, props.detail.artifact.revision)}
                    style={{
                      width: canvas.width,
                      height: canvas.height,
                      transform: `scale(${scale})`,
                    }}
                    title={slide.title}
                    onLoad={(event) => initializeFrame(slide, event.currentTarget)}
                  />
                  <DeckInteractionLayer
                    activeObject={activeObject?.slideId === slide.id ? activeObject : null}
                    activeGeometry={activeObject?.slideId === slide.id ? activeObjectGeometry : null}
                    scale={scale}
                    selectionBox={activeSelectionBox?.slideId === slide.id && activeTextEdit?.slideId !== slide.id ? activeSelectionBox : null}
                    snapGuides={snapGuides}
                    onAlignObject={alignActiveObjectGeometry}
                    onBeginDragObject={beginDragObject}
                    onBeginRotateObject={beginRotateObject}
                    onBeginResizeObject={beginResizeObject}
                    onDeleteObject={deleteActiveObject}
                    onDuplicateObject={duplicateActiveObject}
                    onDoubleClickSelection={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
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
                        onDoubleClick={(event) => enterTextEditFromFramePoint(slide, event.clientX, event.clientY)}
                      />
                    ))
                  ) : directTextEditMode ? null : (
                    <div
                      className="absolute inset-0 z-[2] cursor-default bg-transparent"
                      role="presentation"
                      onPointerDown={(event) => selectObjectFromFramePoint(slide, event.clientX, event.clientY)}
                      onDoubleClick={(event) => enterTextEditFromFramePoint(slide, event.clientX, event.clientY)}
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
          title: slide.title,
        }))}
        renderPreview={(item) => {
          const slide = slides.find((candidate) => candidate.id === item.id);
          if (!slide) return null;
          return (
            <iframe
              src={projectAssetUrl(props.projectId, props.detail.artifact.fileRef, slide.file)}
              style={{
                width: canvas.width,
                height: canvas.height,
                transform: `scale(${deckThumbnail.scale})`,
              }}
              tabIndex={-1}
              title={`${slide.title} thumbnail`}
            />
          );
        }}
        onSelect={activateSlide}
      />
    </div>
  );
}

function DeckToolbar(props: {
  activeObject: ActiveDeckObject | null;
  canRedo: boolean;
  canUndo: boolean;
  directTextEditMode: boolean;
  saveState: "saved" | "saving" | "error";
  selectionMode: DeckSelectionMode;
  state: DeckToolbarState;
  onAlign: (align: "left" | "center" | "right") => void;
  onFillColor: (color: string) => void;
  onFontFamily: (fontFamily: string) => void;
  onFontSize: (fontSize: string) => void;
  onImage: () => void;
  onRedo: () => void;
  onTextColor: (color: string) => void;
  onToggleBold: () => void;
  onToggleDirectTextEditMode: () => void;
  onToggleItalic: () => void;
  onToggleStrikethrough: () => void;
  onToggleUnderline: () => void;
  onUndo: () => void;
}) {
  const disabled = !props.activeObject;
  const textControlDisabled = disabled || props.selectionMode !== "text";
  const textboxControlDisabled = disabled || props.activeObject?.objectType !== "textbox";
  const imageControlDisabled = props.activeObject?.objectType !== "image";
  const hasCurrentFontOption = deckFontOptions.some((option) => option.value === props.state.fontFamily);
  return (
    <Toolbar className="relative overflow-visible" display={{ maxWidth: 1500, width: "content" }}>
      <ToolbarRow wrap className="gap-y-1.5">
        <ToolbarGroup>
          <ToolbarIconButton disabled={!props.canUndo} title="Undo" onClick={props.onUndo}>
            <Undo2 size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton disabled={!props.canRedo} title="Redo" onClick={props.onRedo}>
            <Redo2 size={16} />
          </ToolbarIconButton>
        </ToolbarGroup>
        <ToolbarDivider />
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
          <ToolbarNumberInput disabled={textControlDisabled} title="Font size" value={props.state.fontSize} onChange={props.onFontSize} />
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
          <ToolbarIconButton active={props.directTextEditMode} title="Single-click text edit" onClick={props.onToggleDirectTextEditMode}>
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
