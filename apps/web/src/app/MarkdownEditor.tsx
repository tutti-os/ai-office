import { useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react";
import {
  Bold,
  CheckSquare,
  Code,
  Heading1,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  Undo2,
} from "lucide-react";
import type { MarkdownRuntimeState, MarkdownSelection } from "../artifacts/markdownArtifactAdapter";
import { markdownDomToMarkdown } from "../artifacts/markdownDomSerializer";
import { renderMarkdownPreview } from "../artifacts/markdownPreview";
import {
  applyMarkdownHeading,
  applyMarkdownLinePrefix,
  applyMarkdownQuote,
  insertMarkdownCodeBlock,
  insertMarkdownHorizontalRule,
  insertMarkdownImage,
  insertMarkdownLink,
  insertMarkdownTable,
  wrapMarkdownSelection,
  type MarkdownTransformInput,
  type MarkdownTransformResult,
} from "../artifacts/markdownTransforms";
import { IconButtonLight, ToolbarDivider, ToolbarGroup } from "./toolbarPrimitives";

type MarkdownEditorProps = {
  runtime: MarkdownRuntimeState;
  dirty: boolean;
  loading: boolean;
  onBackHome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onChange: (content: string, selection: MarkdownSelection) => void;
  onSelectionChange: (selection: MarkdownSelection) => void;
};

export function MarkdownEditor(props: MarkdownEditorProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const lastInputMarkdownRef = useRef("");
  const previewHtml = useMemo(() => renderMarkdownPreview(props.runtime.content), [props.runtime.content]);
  const canUndo = props.runtime.history.currentIndex > 0;
  const canRedo = props.runtime.history.currentIndex < props.runtime.history.entries.length - 1;

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    if (document.activeElement === preview && props.runtime.content === lastInputMarkdownRef.current) return;
    preview.innerHTML = previewHtml;
  }, [previewHtml, props.runtime.content]);

  const runTransform = (transform: (input: MarkdownTransformInput) => MarkdownTransformResult) => {
    const selection = props.runtime.selection;
    const result = transform({ content: props.runtime.content, selection });
    props.onChange(result.content, result.selection);
    props.onSelectionChange(result.selection);
  };

  const syncEditableContent = () => {
    const preview = previewRef.current;
    if (!preview) return;
    const content = markdownDomToMarkdown(preview);
    const selection = readPreviewSelection(preview, content);
    lastInputMarkdownRef.current = content;
    props.onChange(content, selection);
  };

  const syncPreviewSelection = () => {
    const preview = previewRef.current;
    if (!preview) return;
    props.onSelectionChange(readPreviewSelection(preview, props.runtime.content));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      runTransform((input) => wrapMarkdownSelection(input, "**", "**", "bold text"));
    } else if (key === "i") {
      event.preventDefault();
      runTransform((input) => wrapMarkdownSelection(input, "*", "*", "italic text"));
    }
  };

  return (
    <section className="relative flex min-h-0 flex-col bg-[#1f1f1f]">
      <header className="flex h-12 items-center justify-between border-b border-white/8 px-5">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white">{props.runtime.title || "Untitled Markdown"}</div>
          <div className="text-[11px] text-white/38">
            {props.dirty ? "Unsaved changes" : "Saved"} · Markdown · {wordCount(props.runtime.content)} words
          </div>
        </div>
        <button className="text-[12px] font-semibold text-white/52 hover:text-white" type="button" onClick={props.onBackHome}>
          Home
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#2a2a2a] px-3 py-4 md:px-6 md:py-6">
        <div className="sticky top-0 z-10 mx-auto mb-4 flex w-fit max-w-full items-center gap-2 rounded-2xl border border-black/[0.04] bg-white px-3 py-2 text-[#202124] shadow-[0_10px_28px_rgba(0,0,0,0.12)] [&_svg]:size-4">
          <div className="toolbar-scroll flex min-w-0 items-center gap-1.5 overflow-x-auto">
            <ToolbarGroup>
              <IconButtonLight disabled={!canUndo} title="Undo" onClick={props.onUndo}><Undo2 /></IconButtonLight>
              <IconButtonLight disabled={!canRedo} title="Redo" onClick={props.onRedo}><Redo2 /></IconButtonLight>
            </ToolbarGroup>
            <ToolbarDivider />
            <ToolbarGroup>
              <MarkdownToolbarButton testId="md-heading-1" title="Heading 1" onClick={() => runTransform((input) => applyMarkdownHeading(input, 1))}><Heading1 /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-paragraph" title="Paragraph" onClick={() => runTransform((input) => applyMarkdownHeading(input, 0))}><Pilcrow /></MarkdownToolbarButton>
            </ToolbarGroup>
            <ToolbarDivider />
            <ToolbarGroup>
              <MarkdownToolbarButton testId="md-bold" title="Bold" onClick={() => runTransform((input) => wrapMarkdownSelection(input, "**", "**", "bold text"))}><Bold /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-italic" title="Italic" onClick={() => runTransform((input) => wrapMarkdownSelection(input, "*", "*", "italic text"))}><Italic /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-strike" title="Strikethrough" onClick={() => runTransform((input) => wrapMarkdownSelection(input, "~~", "~~", "deleted text"))}><Strikethrough /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-inline-code" title="Inline code" onClick={() => runTransform((input) => wrapMarkdownSelection(input, "`", "`", "code"))}><Code /></MarkdownToolbarButton>
            </ToolbarGroup>
            <ToolbarDivider />
            <ToolbarGroup>
              <MarkdownToolbarButton testId="md-quote" title="Quote" onClick={() => runTransform(applyMarkdownQuote)}><Quote /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-hr" title="Horizontal rule" onClick={() => runTransform(insertMarkdownHorizontalRule)}><Minus /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-code-block" title="Code block" onClick={() => runTransform(insertMarkdownCodeBlock)}><Rows3 /></MarkdownToolbarButton>
            </ToolbarGroup>
            <ToolbarDivider />
            <ToolbarGroup>
              <MarkdownToolbarButton testId="md-bullet-list" title="Bullet list" onClick={() => runTransform((input) => applyMarkdownLinePrefix(input, "- "))}><List /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-ordered-list" title="Numbered list" onClick={() => runTransform((input) => applyMarkdownLinePrefix(input, "1. "))}><ListOrdered /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-task-list" title="Task list" onClick={() => runTransform((input) => applyMarkdownLinePrefix(input, "- [ ] "))}><CheckSquare /></MarkdownToolbarButton>
            </ToolbarGroup>
            <ToolbarDivider />
            <ToolbarGroup>
              <MarkdownToolbarButton testId="md-link" title="Link" onClick={() => runTransform(insertMarkdownLink)}><Link2 /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-image" title="Image" onClick={() => runTransform(insertMarkdownImage)}><Image /></MarkdownToolbarButton>
              <MarkdownToolbarButton testId="md-table" title="Table" onClick={() => runTransform(insertMarkdownTable)}><Table2 /></MarkdownToolbarButton>
            </ToolbarGroup>
          </div>

        </div>

        <div className="mx-auto grid min-h-[760px] w-full max-w-[980px] overflow-hidden rounded border border-black/20 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
          <div
            ref={previewRef}
            data-testid="markdown-preview"
            aria-label="Markdown document"
            className="markdown-preview min-h-[760px] overflow-auto px-10 py-8 text-[#202124]"
            contentEditable
            role="textbox"
            spellCheck
            suppressContentEditableWarning
            onInput={syncEditableContent}
            onKeyDown={handleKeyDown}
            onKeyUp={syncPreviewSelection}
            onMouseUp={syncPreviewSelection}
            onBlur={syncEditableContent}
          />
        </div>
      </div>
    </section>
  );
}

function MarkdownToolbarButton(props: { testId: string; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      data-testid={props.testId}
      className="grid size-7 shrink-0 place-items-center rounded-md text-[#242424] transition hover:bg-black/[0.045]"
      type="button"
      title={props.title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function wordCount(content: string) {
  const words = content.trim().match(/\S+/g);
  return words?.length ?? 0;
}

function readPreviewSelection(root: HTMLElement, markdown: string): MarkdownSelection {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { start: markdown.length, end: markdown.length, selectedText: "" };
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return { start: markdown.length, end: markdown.length, selectedText: "" };

  const selectedText = selection.toString();
  if (selectedText) {
    const start = markdown.indexOf(selectedText);
    if (start >= 0) return { start, end: start + selectedText.length, selectedText };
  }

  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const start = Math.min(markdown.length, beforeRange.toString().length);
  return {
    start,
    end: start + selectedText.length,
    selectedText,
  };
}
