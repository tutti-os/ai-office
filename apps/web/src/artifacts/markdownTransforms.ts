import type { MarkdownSelection } from "./markdownArtifactAdapter";

export type MarkdownTransformResult = {
  content: string;
  selection: MarkdownSelection;
};

export type MarkdownTransformInput = {
  content: string;
  selection: MarkdownSelection;
};

export function wrapMarkdownSelection(input: MarkdownTransformInput, before: string, after = before, placeholder = "text"): MarkdownTransformResult {
  const selected = input.selection.selectedText || placeholder;
  const replacement = `${before}${selected}${after}`;
  return replaceSelection(input, replacement, before.length, before.length + selected.length);
}

export function applyMarkdownHeading(input: MarkdownTransformInput, level: 0 | 1 | 2 | 3): MarkdownTransformResult {
  return transformSelectedLines(input, (line) => {
    const cleaned = line.replace(/^#{1,6}\s+/, "");
    return level === 0 ? cleaned : `${"#".repeat(level)} ${cleaned || "Heading"}`;
  });
}

export function applyMarkdownLinePrefix(input: MarkdownTransformInput, prefix: string): MarkdownTransformResult {
  return transformSelectedLines(input, (line) => `${prefix}${line.replace(/^(\s*)([-*+]|\d+\.|\[[ xX]\])\s+/, "$1") || "item"}`);
}

export function applyMarkdownQuote(input: MarkdownTransformInput): MarkdownTransformResult {
  return transformSelectedLines(input, (line) => `> ${line.replace(/^>\s?/, "") || "Quote"}`);
}

export function insertMarkdownHorizontalRule(input: MarkdownTransformInput): MarkdownTransformResult {
  return insertBlock(input, "\n---\n");
}

export function insertMarkdownCodeBlock(input: MarkdownTransformInput): MarkdownTransformResult {
  const selected = input.selection.selectedText || "code";
  return replaceSelection(input, `\n\`\`\`\n${selected}\n\`\`\`\n`, 5, 5 + selected.length);
}

export function insertMarkdownLink(input: MarkdownTransformInput): MarkdownTransformResult {
  const label = input.selection.selectedText || "link text";
  return replaceSelection(input, `[${label}](https://example.com)`, 1, 1 + label.length);
}

export function insertMarkdownImage(input: MarkdownTransformInput): MarkdownTransformResult {
  const alt = input.selection.selectedText || "image alt";
  return replaceSelection(input, `![${alt}](https://example.com/image.png)`, 2, 2 + alt.length);
}

export function insertMarkdownTable(input: MarkdownTransformInput): MarkdownTransformResult {
  return insertBlock(input, "\n| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |\n");
}

function insertBlock(input: MarkdownTransformInput, block: string): MarkdownTransformResult {
  const start = input.selection.start;
  const needsLeadingNewline = start > 0 && input.content[start - 1] !== "\n";
  const text = `${needsLeadingNewline ? "\n" : ""}${block}`;
  return replaceSelection(input, text, text.length, text.length);
}

function replaceSelection(input: MarkdownTransformInput, replacement: string, selectionStartOffset: number, selectionEndOffset: number): MarkdownTransformResult {
  const before = input.content.slice(0, input.selection.start);
  const after = input.content.slice(input.selection.end);
  const content = `${before}${replacement}${after}`;
  const start = before.length + selectionStartOffset;
  const end = before.length + selectionEndOffset;
  return {
    content,
    selection: {
      start,
      end,
      selectedText: content.slice(start, end),
    },
  };
}

function transformSelectedLines(input: MarkdownTransformInput, transform: (line: string, index: number) => string): MarkdownTransformResult {
  const { lineStart, lineEnd } = selectedLineRange(input.content, input.selection.start, input.selection.end);
  const block = input.content.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const replacement = lines.map(transform).join("\n");
  const content = `${input.content.slice(0, lineStart)}${replacement}${input.content.slice(lineEnd)}`;
  return {
    content,
    selection: {
      start: lineStart,
      end: lineStart + replacement.length,
      selectedText: replacement,
    },
  };
}

function selectedLineRange(content: string, start: number, end: number) {
  const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextBreak = content.indexOf("\n", end);
  return {
    lineStart,
    lineEnd: nextBreak === -1 ? content.length : nextBreak,
  };
}
