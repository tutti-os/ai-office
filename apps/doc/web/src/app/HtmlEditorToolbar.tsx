import { AlignCenter, AlignJustify, AlignLeft, AlignRight, BetweenHorizontalEnd, Bold, Columns2, Image, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered, ListTodo, Minus, PaintBucket, Redo2, Rows3, Strikethrough, Table2, Underline, Undo2 } from "lucide-react";
import { FontSizeControl, IconButtonLight, Toolbar, ToolbarColorInput, ToolbarDivider, ToolbarGroup, ToolbarLayoutMenu, ToolbarRow, ToolbarSelect, ToolbarSpacingMenu } from "@ai-app/ui/toolbar";
import type { HeadingTag } from "./runtimeWorkbenchTypes";
import type { HtmlEditorScreenProps } from "./HtmlEditorScreen";

export function HtmlEditorToolbar(input: {
  canCreateLink: boolean;
  canRedo: boolean;
  canUndo: boolean;
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
  return (
  <Toolbar
    className="relative -translate-y-1.5 overflow-visible !shadow-[0_12px_10px_rgba(0,0,0,0.08)]"
    display={{ maxWidth: 1500, width: "content" }}
    onMouseDownCapture={(event) => {
      props.onToolbarInteractionStart();
      if (shouldKeepEditorSelectionOnToolbarCommand(event.target)) event.preventDefault();
    }}
  >
    <ToolbarRow wrap className="gap-y-1.5">
      <ToolbarGroup>
        <IconButtonLight disabled={!input.canUndo} title="Undo" onClick={props.onUndo}><Undo2 size={18} /></IconButtonLight>
        <IconButtonLight disabled={!input.canRedo} title="Redo" onClick={props.onRedo}><Redo2 size={18} /></IconButtonLight>
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup className="[column-gap:4px]">
        <ToolbarSelect disabled={toolbarDisabled} title="Block style" value={props.toolbarState.block} onChange={(value) => props.onHeading(value as HeadingTag)}>
          <option value="p">Normal Text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="blockquote">Quote</option>
        </ToolbarSelect>
        <ToolbarSelect disabled={toolbarDisabled} title="Font family" value={props.toolbarState.fontFamily} onChange={props.onFontFamily}>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Inter, sans-serif">Inter</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Times New Roman', serif">Times</option>
          <option value="'Courier New', monospace">Courier</option>
        </ToolbarSelect>
        <FontSizeControl disabled={toolbarDisabled} value={props.toolbarState.fontSize || "14px"} onChange={props.onFontSize} />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <IconButtonLight active={props.toolbarState.bold} disabled={toolbarDisabled} title="Bold" onClick={() => props.onFormat("strong")}><Bold size={19} /></IconButtonLight>
        <IconButtonLight active={props.toolbarState.italic} disabled={toolbarDisabled} title="Italic" onClick={() => props.onFormat("em")}><Italic size={19} /></IconButtonLight>
        <IconButtonLight active={props.toolbarState.underline} disabled={toolbarDisabled} title="Underline" onClick={() => props.onFormat("u")}><Underline size={19} /></IconButtonLight>
        <IconButtonLight active={props.toolbarState.strikethrough} disabled={toolbarDisabled} title="Strikethrough" onClick={() => props.onFormat("s")}><Strikethrough size={19} /></IconButtonLight>
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <IconButtonLight active={props.toolbarState.alignment === "left"} disabled={toolbarDisabled} title="Align left" onClick={() => props.onAlignment("left")}><AlignLeft size={19} /></IconButtonLight>
        <IconButtonLight active={props.toolbarState.alignment === "center"} disabled={toolbarDisabled} title="Align center" onClick={() => props.onAlignment("center")}><AlignCenter size={19} /></IconButtonLight>
        <IconButtonLight active={props.toolbarState.alignment === "right"} disabled={toolbarDisabled} title="Align right" onClick={() => props.onAlignment("right")}><AlignRight size={19} /></IconButtonLight>
        <IconButtonLight active={props.toolbarState.alignment === "justify"} disabled={toolbarDisabled} title="Justify" onClick={() => props.onAlignment("justify")}><AlignJustify size={19} /></IconButtonLight>
        <ToolbarSpacingMenu
          disabled={toolbarDisabled}
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
          disabled={toolbarDisabled}
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
        <IconButtonLight active={props.toolbarState.list === "ordered"} disabled={toolbarDisabled} title="Numbered list" onClick={() => props.onList("ordered")}><ListOrdered size={19} /></IconButtonLight>
        <IconButtonLight active={props.toolbarState.list === "unordered"} disabled={toolbarDisabled} title="Bulleted list" onClick={() => props.onList("unordered")}><List size={19} /></IconButtonLight>
        <IconButtonLight active={props.toolbarState.checklist} disabled={toolbarDisabled} title="Checklist" onClick={props.onChecklist}><ListTodo size={19} /></IconButtonLight>
        <IconButtonLight disabled={toolbarDisabled} title="Indent" onClick={props.onIndent}><IndentIncrease size={19} /></IconButtonLight>
        <IconButtonLight disabled={toolbarDisabled} title="Outdent" onClick={props.onOutdent}><IndentDecrease size={19} /></IconButtonLight>
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ToolbarColorInput
          disabled={toolbarDisabled}
          title="Text color"
          color={props.toolbarState.foreColor}
          onChange={props.onForeColor}
        />
        <ToolbarColorInput
          disabled={toolbarDisabled}
          title="Fill color"
          color={props.toolbarState.backColor}
          icon={<PaintBucket size={17} />}
          onChange={props.onBackColor}
        />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <IconButtonLight active={props.toolbarState.image} disabled={toolbarDisabled} title="Image" onClick={props.onPickImage}><Image size={18} /></IconButtonLight>
        <div ref={input.linkEditorRef} className="relative inline-grid">
          <IconButtonLight
            active={props.toolbarState.link}
            disabled={toolbarDisabled || (!props.toolbarState.link && !input.canCreateLink)}
            title="Create link"
            onClick={props.onCreateLink}
          >
            <Link2 size={18} />
          </IconButtonLight>
        </div>
        <IconButtonLight disabled={toolbarDisabled} title="Insert table" onClick={() => props.onMoreAction("insertTable")}><Table2 size={18} /></IconButtonLight>
      </ToolbarGroup>
      {props.toolbarState.table ? (
        <>
          <ToolbarDivider />
          <ToolbarGroup>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.addColumnAfter} title="Add column" onClick={() => props.onMoreAction("addColumnAfter")}><Columns2 size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.deleteColumn} title="Delete column" onClick={() => props.onMoreAction("deleteColumn")}><BetweenHorizontalEnd size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.addRowAfter} title="Add row" onClick={() => props.onMoreAction("addRowAfter")}><Rows3 size={18} /></IconButtonLight>
            <IconButtonLight disabled={toolbarDisabled || !props.toolbarState.tableActions.deleteRow} title="Delete row" onClick={() => props.onMoreAction("deleteRow")}><Minus size={18} /></IconButtonLight>
          </ToolbarGroup>
        </>
      ) : null}
    </ToolbarRow>
  </Toolbar>
  );
}

function shouldKeepEditorSelectionOnToolbarCommand(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button")) && !Boolean(target.closest("input, textarea, select"));
}
