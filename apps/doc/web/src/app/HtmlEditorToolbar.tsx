import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowLeft, ArrowRight, ArrowUp, BetweenHorizontalEnd, Bold, Columns2, Copy, Image, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered, ListTodo, Minus, PaintBucket, Replace, Rows3, Strikethrough, Table2, Underline } from "lucide-react";
import { FontSizeControl, IconButtonLight, Toolbar, ToolbarColorInput, ToolbarDivider, ToolbarGroup, ToolbarLayoutMenu, ToolbarRow, ToolbarSelect, ToolbarSpacingMenu } from "@ai-app/ui/toolbar";
import type { AdjacentInsertPosition, HeadingTag } from "../artifact/runtime/operations";
import type { OperationPanelMode } from "./runtimeWorkbenchTypes";
import type { HtmlEditorScreenProps } from "./HtmlEditorScreen";

const operationPanelTitle: Record<Exclude<OperationPanelMode, null>, string> = {
  insertText: "Insert text",
  insertHtml: "Insert HTML",
  replaceSelection: "Replace selection",
  appendText: "Append text",
  appendHtml: "Append HTML",
  insertAtPosition: "Insert near selection",
  setAttributes: "Set attributes",
  wrapSelection: "Wrap selection",
  image: "Image",
  style: "Style",
  table: "Table",
};

const fontFamilyOptions = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Lexend", value: "Lexend, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: "'Times New Roman', serif" },
  { label: "Courier", value: "'Courier New', monospace" },
];

export function HtmlEditorToolbar(input: {
  canCreateLink: boolean;
  layoutMenuOpen: boolean;
  linkEditorRef: React.RefObject<HTMLDivElement | null>;
  props: HtmlEditorScreenProps;
  spacingMenuOpen: boolean;
  toolbarDisabled: boolean;
  onLayoutMenuOpenChange: (open: boolean) => void;
  onSpacingMenuOpenChange: (open: boolean) => void;
}) {
  const { props, toolbarDisabled } = input;
  const spacingMenuOpen = input.spacingMenuOpen;
  const layoutMenuOpen = input.layoutMenuOpen;
  const imageSelected = props.toolbarState.image;
  const defaultControlsDisabled = toolbarDisabled || imageSelected;
  const fontFamily = props.toolbarState.fontFamily || fontFamilyOptions[0].value;
  const hasFontFamilyOption = fontFamilyOptions.some((option) => sameFontFamily(option.value, fontFamily));
  return (
  <div className="mb-4 flex min-h-[78px] items-center justify-center">
  <Toolbar
    className="relative !mb-0 !rounded-none !border-t-0 !border-l-0 !bg-[#EEE8DC] overflow-visible"
    display={{ maxWidth: 1500 }}
    onFloatingLayerPointerDown={props.onToolbarInteractionStart}
    onMouseDownCapture={(event) => {
      if (!shouldSkipToolbarSelectionPreserve(event.target)) props.onToolbarInteractionStart();
      if (shouldKeepEditorSelectionOnToolbarCommand(event.target)) event.preventDefault();
    }}
    onPointerDownCapture={(event) => {
      if (!shouldSkipToolbarSelectionPreserve(event.target)) props.onToolbarInteractionStart();
    }}
  >
    <ToolbarRow wrap className="gap-y-1.5">
          <ToolbarGroup className="[column-gap:4px]">
            <ToolbarSelect disabled={defaultControlsDisabled} title="Block style" value={props.toolbarState.block} onChange={(value) => props.onHeading(value as HeadingTag)}>
              <option value="p">Normal Text</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="h4">Heading 4</option>
              <option value="blockquote">Quote</option>
            </ToolbarSelect>
            <ToolbarSelect disabled={defaultControlsDisabled} title="Font family" value={fontFamily} onChange={props.onFontFamily}>
              {!hasFontFamilyOption ? <option value={fontFamily}>{fontFamilyLabel(fontFamily)}</option> : null}
              {fontFamilyOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </ToolbarSelect>
            <FontSizeControl disabled={defaultControlsDisabled} value={props.toolbarState.fontSize || "14px"} onChange={props.onFontSize} />
          </ToolbarGroup>
          <ToolbarDivider />
          <ToolbarGroup>
            <IconButtonLight active={props.toolbarState.bold} disabled={defaultControlsDisabled} title="Bold" onClick={() => props.onFormat("strong")}><Bold size={19} /></IconButtonLight>
            <IconButtonLight active={props.toolbarState.italic} disabled={defaultControlsDisabled} title="Italic" onClick={() => props.onFormat("em")}><Italic size={19} /></IconButtonLight>
            <IconButtonLight active={props.toolbarState.underline} disabled={defaultControlsDisabled} title="Underline" onClick={() => props.onFormat("u")}><Underline size={19} /></IconButtonLight>
            <IconButtonLight active={props.toolbarState.strikethrough} disabled={defaultControlsDisabled} title="Strikethrough" onClick={() => props.onFormat("s")}><Strikethrough size={19} /></IconButtonLight>
          </ToolbarGroup>
          <ToolbarDivider />
          <ToolbarGroup>
            <IconButtonLight active={props.toolbarState.alignment === "left"} disabled={defaultControlsDisabled} title="Align left" onClick={() => props.onAlignment("left")}><AlignLeft size={19} /></IconButtonLight>
            <IconButtonLight active={props.toolbarState.alignment === "center"} disabled={defaultControlsDisabled} title="Align center" onClick={() => props.onAlignment("center")}><AlignCenter size={19} /></IconButtonLight>
            <IconButtonLight active={props.toolbarState.alignment === "right"} disabled={defaultControlsDisabled} title="Align right" onClick={() => props.onAlignment("right")}><AlignRight size={19} /></IconButtonLight>
            <IconButtonLight active={props.toolbarState.alignment === "justify"} disabled={defaultControlsDisabled} title="Justify" onClick={() => props.onAlignment("justify")}><AlignJustify size={19} /></IconButtonLight>
            <ToolbarSpacingMenu
              disabled={defaultControlsDisabled}
              lineHeight={props.toolbarState.lineHeight}
              letterSpacing={props.toolbarState.letterSpacing}
              open={spacingMenuOpen}
              onLineHeightChange={props.onLineHeight}
              onLetterSpacingChange={props.onLetterSpacing}
              onOpenChange={(open) => {
                input.onSpacingMenuOpenChange(open);
                if (open) input.onLayoutMenuOpenChange(false);
              }}
            />
            <ToolbarLayoutMenu
              disabled={defaultControlsDisabled}
              open={layoutMenuOpen}
              targetLabel={props.toolbarState.targetLabel}
              value={props.toolbarState.layout}
              onOpenChange={(open) => {
                input.onLayoutMenuOpenChange(open);
                if (open) input.onSpacingMenuOpenChange(false);
              }}
              onChange={props.onLayoutChange}
            />
          </ToolbarGroup>
          <ToolbarDivider />
          <ToolbarGroup>
            <IconButtonLight active={props.toolbarState.list === "ordered"} disabled={defaultControlsDisabled} title="Numbered list" onClick={() => props.onList("ordered")}><ListOrdered size={19} /></IconButtonLight>
            <IconButtonLight active={props.toolbarState.list === "unordered"} disabled={defaultControlsDisabled} title="Bulleted list" onClick={() => props.onList("unordered")}><List size={19} /></IconButtonLight>
            <IconButtonLight active={props.toolbarState.checklist} disabled={defaultControlsDisabled} title="Checklist" onClick={props.onChecklist}><ListTodo size={19} /></IconButtonLight>
            <IconButtonLight disabled={defaultControlsDisabled} title="Indent" onClick={props.onIndent}><IndentIncrease size={19} /></IconButtonLight>
            <IconButtonLight disabled={defaultControlsDisabled} title="Outdent" onClick={props.onOutdent}><IndentDecrease size={19} /></IconButtonLight>
          </ToolbarGroup>
          <ToolbarDivider />
          <ToolbarGroup>
            <ToolbarColorInput
              disabled={defaultControlsDisabled}
              title="Text color"
              color={props.toolbarState.foreColor}
              onChange={props.onForeColor}
            />
            <ToolbarColorInput
              disabled={defaultControlsDisabled}
              title="Fill color"
              color={props.toolbarState.backColor}
              icon={<PaintBucket size={17} />}
              onChange={props.onBackColor}
            />
          </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <IconButtonLight disabled={toolbarDisabled} title={imageSelected ? "Replace image" : "Image"} onClick={props.onPickImage}>
          {imageSelected ? <Replace size={18} /> : <Image size={18} />}
        </IconButtonLight>
        <IconButtonLight disabled={defaultControlsDisabled} title="Insert table" onClick={() => props.onMoreAction("insertTable")}><Table2 size={18} /></IconButtonLight>
      </ToolbarGroup>
          <ToolbarDivider />
          <ToolbarGroup>
            <div ref={input.linkEditorRef} className="relative inline-grid">
              <IconButtonLight
                active={props.toolbarState.link}
                disabled={defaultControlsDisabled || (!props.toolbarState.link && !input.canCreateLink)}
                title="Create link"
                onClick={props.onCreateLink}
              >
                <Link2 size={18} />
              </IconButtonLight>
            </div>
          </ToolbarGroup>
      {props.toolbarState.table && !imageSelected ? (
        <>
          <ToolbarDivider />
          <ToolbarGroup>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.addColumnAfter} title="Add column" onClick={() => props.onMoreAction("addColumnAfter")}><Columns2 size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.deleteColumn} title="Delete column" onClick={() => props.onMoreAction("deleteColumn")}><BetweenHorizontalEnd size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.addRowAfter} title="Add row" onClick={() => props.onMoreAction("addRowAfter")}><Rows3 size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.deleteRow} title="Delete row" onClick={() => props.onMoreAction("deleteRow")}><Minus size={18} /></IconButtonLight>
          </ToolbarGroup>
          <ToolbarDivider />
          <ToolbarGroup>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.copyRow} title="Copy row" onClick={() => props.onMoreAction("copyRow")}><Copy size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.copyColumn} title="Copy column" onClick={() => props.onMoreAction("copyColumn")}><Copy className="rotate-90" size={18} /></IconButtonLight>
          </ToolbarGroup>
          <ToolbarDivider />
          <ToolbarGroup>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.moveColumnLeft} title="Move column left" onClick={() => props.onMoreAction("moveColumnLeft")}><ArrowLeft size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.moveColumnRight} title="Move column right" onClick={() => props.onMoreAction("moveColumnRight")}><ArrowRight size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.moveRowUp} title="Move row up" onClick={() => props.onMoreAction("moveRowUp")}><ArrowUp size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.moveRowDown} title="Move row down" onClick={() => props.onMoreAction("moveRowDown")}><ArrowUp className="rotate-180" size={18} /></IconButtonLight>
          </ToolbarGroup>
        </>
      ) : null}
    </ToolbarRow>

    {props.operationPanelMode ? (
      <form
        data-toolbar-skip-selection-preserve="true"
        className="absolute left-3 right-3 top-full z-30 mt-2 flex min-h-9 w-fit max-w-[calc(100%-1.5rem)] shrink-0 items-center gap-1.5 overflow-x-auto rounded-[8px] border border-[#B8A07C]/30 bg-[#F9F4EC] px-2.5 py-1.5  [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onSubmit={(event) => {
          event.preventDefault();
          props.onApplyOperation();
        }}
      >
        <span className="shrink-0 px-1 text-[11px] font-bold text-[#8B8275]">{operationPanelTitle[props.operationPanelMode]}</span>
        {props.operationPanelMode === "insertAtPosition" || props.operationPanelMode === "replaceSelection" ? (
          <>
            {props.operationPanelMode === "insertAtPosition" ? (
              <select
                aria-label="Insert position"
                className="h-8 rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-semibold text-[#333] outline-none"
                value={props.operationPosition}
                onChange={(event) => props.onOperationPositionChange(event.currentTarget.value as AdjacentInsertPosition)}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <option value="beforebegin">Before element</option>
                <option value="afterbegin">At start</option>
                <option value="beforeend">At end</option>
                <option value="afterend">After element</option>
              </select>
            ) : null}
            <label className="flex h-8 items-center gap-1 rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[11px] font-semibold text-[#555]">
              <input
                checked={props.operationIsHtml}
                type="checkbox"
                onChange={(event) => props.onOperationHtmlChange(event.currentTarget.checked)}
                onMouseDown={(event) => event.stopPropagation()}
              />
              HTML
            </label>
          </>
        ) : null}
        {props.operationPanelMode === "wrapSelection" ? (
          <select
            aria-label="Wrapper tag"
            className="h-8 rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-semibold text-[#333] outline-none"
            value={props.operationWrapperTag}
            onChange={(event) => props.onOperationWrapperTagChange(event.currentTarget.value)}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <option value="span">span</option>
            <option value="strong">strong</option>
            <option value="em">em</option>
            <option value="mark">mark</option>
            <option value="code">code</option>
            <option value="p">p</option>
            <option value="h1">h1</option>
            <option value="h2">h2</option>
            <option value="h3">h3</option>
            <option value="h4">h4</option>
            <option value="h5">h5</option>
            <option value="h6">h6</option>
            <option value="div">div</option>
            <option value="section">section</option>
            <option value="article">article</option>
            <option value="blockquote">blockquote</option>
            <option value="pre">pre</option>
            <option value="ul">ul</option>
            <option value="ol">ol</option>
            <option value="li">li</option>
          </select>
        ) : null}
        {props.operationPanelMode === "table" ? (
          <>
            <input
              aria-label="Table rows"
              className="h-8 w-[86px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              inputMode="numeric"
              placeholder="rows"
              value={props.tableDraft.rows}
              onChange={(event) => props.onTableDraftChange({ ...props.tableDraft, rows: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Table columns"
              className="h-8 w-[96px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              inputMode="numeric"
              placeholder="columns"
              value={props.tableDraft.columns}
              onChange={(event) => props.onTableDraftChange({ ...props.tableDraft, columns: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
          </>
        ) : props.operationPanelMode === "style" ? (
          <>
            <input
              aria-label="Width"
              className="h-8 w-[82px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="width"
              value={props.styleDraft.width ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, width: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Height"
              className="h-8 w-[82px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="height"
              value={props.styleDraft.height ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, height: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Line height"
              className="h-8 w-[88px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="line"
              value={props.styleDraft.lineHeight ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, lineHeight: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Letter spacing"
              className="h-8 w-[88px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="spacing"
              value={props.styleDraft.letterSpacing ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, letterSpacing: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <select
              aria-label="Vertical align"
              className="h-8 rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-semibold text-[#333] outline-none"
              value={props.styleDraft.verticalAlign ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, verticalAlign: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <option value="">vertical</option>
              <option value="top">top</option>
              <option value="middle">middle</option>
              <option value="bottom">bottom</option>
              <option value="baseline">baseline</option>
            </select>
            <input
              aria-label="Border width"
              className="h-8 w-[82px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="border"
              value={props.styleDraft.borderWidth ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderWidth: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <select
              aria-label="Border style"
              className="h-8 rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-semibold text-[#333] outline-none"
              value={props.styleDraft.borderStyle ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderStyle: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <option value="">border style</option>
              <option value="none">none</option>
              <option value="solid">solid</option>
              <option value="dashed">dashed</option>
              <option value="dotted">dotted</option>
              <option value="double">double</option>
            </select>
            <label className="flex h-8 items-center gap-2 rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[11px] font-semibold text-[#555]">
              Border
              <input
                aria-label="Border color"
                className="size-5 rounded-[8px] border border-[#B8A07C]/30"
                type="color"
                value={props.styleDraft.borderColor || "#d0d5dd"}
                onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderColor: event.currentTarget.value })}
                onMouseDown={(event) => event.stopPropagation()}
              />
            </label>
            <input
              aria-label="Border color value"
              className="h-8 w-[92px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="#d0d5dd"
              value={props.styleDraft.borderColor ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderColor: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Border radius"
              className="h-8 w-[82px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="radius"
              value={props.styleDraft.borderRadius ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderRadius: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Padding"
              className="h-8 w-[82px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="padding"
              value={props.styleDraft.padding ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, padding: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Margin top"
              className="h-8 w-[82px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="before"
              value={props.styleDraft.marginTop ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, marginTop: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Margin bottom"
              className="h-8 w-[82px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="after"
              value={props.styleDraft.marginBottom ?? ""}
              onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, marginBottom: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
          </>
        ) : props.operationPanelMode === "image" ? (
          <>
            <input
              aria-label="Image URL"
              className="h-8 w-[260px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="https://... or data:image/..."
              value={props.imageDraft.src}
              onChange={(event) => props.onImageDraftChange({ ...props.imageDraft, src: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Image alt text"
              className="h-8 w-[140px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="alt"
              value={props.imageDraft.alt ?? ""}
              onChange={(event) => props.onImageDraftChange({ ...props.imageDraft, alt: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Image width"
              className="h-8 w-[86px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="width"
              value={props.imageDraft.width ?? ""}
              onChange={(event) => props.onImageDraftChange({ ...props.imageDraft, width: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Image height"
              className="h-8 w-[86px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="height"
              value={props.imageDraft.height ?? ""}
              onChange={(event) => props.onImageDraftChange({ ...props.imageDraft, height: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
          </>
        ) : props.operationPanelMode === "setAttributes" || props.operationPanelMode === "wrapSelection" ? (
          <>
            <input
              aria-label="Element id"
              className="h-8 w-[96px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="id"
              value={props.attributeDraft.id}
              onChange={(event) => props.onAttributeDraftChange({ ...props.attributeDraft, id: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Element class"
              className="h-8 w-[128px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="class"
              value={props.attributeDraft.className}
              onChange={(event) => props.onAttributeDraftChange({ ...props.attributeDraft, className: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label="Element title"
              className="h-8 w-[140px] rounded-lg border border-[#B8A07C]/30 bg-white px-2 text-[13px] font-medium text-[#333] outline-none"
              placeholder="title"
              value={props.attributeDraft.title}
              onChange={(event) => props.onAttributeDraftChange({ ...props.attributeDraft, title: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
            <textarea
              aria-label="Custom attributes"
              className="h-14 w-[220px] resize-none rounded-lg border border-[#B8A07C]/30 bg-white px-2 py-1 text-[13px] font-medium leading-4 text-[#333] outline-none"
              placeholder={"data-key=value\naria-label=Name"}
              value={props.attributeDraft.custom}
              onChange={(event) => props.onAttributeDraftChange({ ...props.attributeDraft, custom: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
            />
          </>
        ) : (
          <textarea
            aria-label={operationPanelTextLabel(props.operationPanelMode)}
            className="h-14 w-[280px] resize-none rounded-lg border border-[#B8A07C]/30 bg-white px-2 py-1 text-[13px] font-medium leading-4 text-[#333] outline-none"
            placeholder={operationPanelPlaceholder(props.operationPanelMode)}
            value={props.operationDraft}
            onChange={(event) => props.onOperationDraftChange(event.currentTarget.value)}
            onMouseDown={(event) => event.stopPropagation()}
          />
        )}
        <button className="h-8 rounded-[8px] bg-[#2A2620] px-3 text-[11px] font-semibold text-[#F4EFE6]" type="submit">
          Apply
        </button>
        <button
          className="h-8 rounded-[8px] px-3 text-[11px] font-semibold text-[#8B8275] hover:bg-[#EEE8DC]/55 hover:text-[#5C6B50]"
          type="button"
          onClick={props.onCloseOperation}
        >
          Cancel
        </button>
      </form>
    ) : null}
  </Toolbar>
  </div>
  );
}

function operationPanelTextLabel(mode: OperationPanelMode) {
  if (mode === "replaceSelection") return "Replacement content";
  if (mode === "insertHtml" || mode === "appendHtml") return "HTML to insert";
  if (mode === "insertAtPosition") return "Content to insert at position";
  if (mode === "appendText") return "Text to append";
  return "Text to insert";
}

function operationPanelPlaceholder(mode: OperationPanelMode) {
  if (mode === "replaceSelection") return "Replacement text or HTML...";
  if (mode === "insertHtml" || mode === "appendHtml" || mode === "insertAtPosition") return "<p>Paste HTML or text...</p>";
  if (mode === "appendText") return "Text to append...";
  return "Text to insert...";
}

function shouldSkipToolbarSelectionPreserve(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-toolbar-skip-selection-preserve="true"]'));
}

function shouldKeepEditorSelectionOnToolbarCommand(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button")) && !Boolean(target.closest("input, textarea, select"));
}

function sameFontFamily(left: string, right: string) {
  return normalizeFontFamilyValue(left) === normalizeFontFamilyValue(right);
}

function normalizeFontFamilyValue(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function fontFamilyLabel(value: string) {
  const firstFamily = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return firstFamily || value;
}
