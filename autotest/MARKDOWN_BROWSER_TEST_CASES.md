# Markdown Editor Browser Test Cases

This document tracks proposed browser-use automation cases for the Markdown editing area.

Current scope: Markdown document creation, right-side/editor-area editing, toolbar transforms, keyboard editing, selection handling, undo/redo, preview serialization, and autosave/reopen behavior.

Execution status should be recorded in test results, not in the case definitions.

## Assumptions

- Tests will run against the local app server.
- A fresh Markdown project can be created from the home composer by choosing the Markdown output type and creating a blank or prompt-seeded document.
- The editable Markdown document surface is `[data-testid="markdown-preview"]`.
- Markdown toolbar controls expose stable test IDs:
  `md-heading-1`, `md-paragraph`, `md-bold`, `md-italic`, `md-strike`, `md-inline-code`, `md-quote`, `md-hr`, `md-code-block`, `md-bullet-list`, `md-ordered-list`, `md-task-list`, `md-link`, `md-image`, `md-table`.

## Test Cases

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-001 | Setup | Create a blank Markdown document | From home, select Markdown output type, create blank document, wait for editor. | Markdown editor opens; header shows `Markdown`; editable surface `[data-testid="markdown-preview"]` is visible and focused/clickable. |
| MD-002 | Keyboard | Type plain paragraph text | Open blank Markdown document, click editable surface, type `Hello markdown world`. | Text appears in the editor; status changes to unsaved and then saved after autosave delay; word count updates. |
| MD-003 | Keyboard | Insert line breaks and multiple paragraphs | Type first paragraph, press Enter twice, type second paragraph. | Preview/editor displays two paragraphs; serialized Markdown preserves paragraph separation after autosave/reopen. |
| MD-004 | Keyboard | Select text with keyboard | Type `alpha beta gamma`, use keyboard selection to select `beta`. | Runtime selection contains selected text; subsequent toolbar action applies only to `beta`. |
| MD-005 | Keyboard | Replace selected text by typing | Type `alpha beta gamma`, select `beta`, type `delta`. | Editor content becomes `alpha delta gamma`; autosaved content matches after reopen. |
| MD-006 | Keyboard | Backspace and Delete editing | Type `abcdef`, place cursor in the middle, use Backspace and Delete. | Characters are removed at the expected cursor positions; Markdown content remains editable and autosaves. |
| MD-007 | Toolbar | Bold selected text | Type `make this bold`, select `this`, click `md-bold`. | Selected text becomes bold in preview; serialized Markdown contains `**this**`; selection remains around `this` where possible. |
| MD-008 | Toolbar | Bold placeholder with collapsed cursor | Place cursor in empty document or empty paragraph, click `md-bold`. | Placeholder `bold text` is inserted and rendered bold; serialized Markdown contains `**bold text**`. |
| MD-009 | Toolbar | Italic selected text | Type `make this italic`, select `this`, click `md-italic`. | Selected text becomes italic; serialized Markdown contains `*this*`. |
| MD-010 | Toolbar | Strikethrough selected text | Type `remove this word`, select `this`, click `md-strike`. | Selected text renders struck through; serialized Markdown contains `~~this~~`. |
| MD-011 | Toolbar | Inline code selected text | Type `run npm test`, select `npm test`, click `md-inline-code`. | Selected text renders as inline code; serialized Markdown contains `` `npm test` ``. |
| MD-012 | Toolbar | Heading 1 converts current line | Type `Document title`, place cursor in that line, click `md-heading-1`. | Line renders as H1; serialized Markdown contains `# Document title`. |
| MD-013 | Toolbar | Paragraph removes heading prefix | Start with `# Document title`, place cursor in heading, click `md-paragraph`. | Heading becomes normal paragraph; serialized Markdown contains `Document title` without leading `#`. |
| MD-014 | Toolbar | Quote current line | Type `quoted thought`, place cursor in line, click `md-quote`. | Line renders as blockquote; serialized Markdown contains `> quoted thought`. |
| MD-015 | Toolbar | Horizontal rule insertion | Place cursor after a paragraph, click `md-hr`. | Horizontal rule appears after the current content; serialized Markdown contains `---` on its own line. |
| MD-016 | Toolbar | Code block insertion from selection | Type `const x = 1;`, select it, click `md-code-block`. | Selection becomes fenced code block; preview renders `<pre><code>`; serialized Markdown contains triple backticks. |
| MD-017 | Toolbar | Bullet list current lines | Type two separate lines, select both lines, click `md-bullet-list`. | Lines render as unordered list items; serialized Markdown prefixes each selected line with `- `. |
| MD-018 | Toolbar | Ordered list current lines | Type two separate lines, select both lines, click `md-ordered-list`. | Lines render as ordered list items; serialized Markdown prefixes selected lines with `1. `. |
| MD-019 | Toolbar | Task list current lines | Type `todo item`, place cursor in line, click `md-task-list`. | Line renders as a disabled task checkbox item; serialized Markdown contains `- [ ] todo item`. |
| MD-020 | Toolbar | Link insertion from selected text | Type `OpenAI`, select it, click `md-link`. | Text renders as a link; serialized Markdown contains `[OpenAI](https://example.com)`. |
| MD-021 | Toolbar | Image insertion from selected alt text | Type `Diagram`, select it, click `md-image`. | Image element is inserted with alt text; serialized Markdown contains `![Diagram](https://example.com/image.png)`. |
| MD-022 | Toolbar | Table insertion | Place cursor after existing content, click `md-table`. | Markdown table appears and renders as a table; serialized Markdown contains header, divider, and one data row. |
| MD-023 | Toolbar | Undo after toolbar transform | Apply a toolbar transform, click Undo button. | Content returns to the pre-transform state; Undo becomes disabled if no earlier history exists; Redo becomes enabled. |
| MD-024 | Toolbar | Redo after undo | After MD-023, click Redo button. | Toolbar transform is restored; serialized Markdown matches the transformed state. |
| MD-025 | Selection | Toolbar button preserves editor selection | Select text in editable surface, click a toolbar button that uses `onMouseDown.preventDefault`. | Browser focus/selection is preserved enough for transform to target the selected Markdown text. |
| MD-026 | Serialization | Direct rich text edits serialize to Markdown | Type text, apply browser-native bold/italic via keyboard shortcuts if supported, blur editor. | DOM content is converted to Markdown without dropping text; supported inline tags serialize to Markdown markers. |
| MD-027 | Persistence | Autosave Markdown edit and reopen project | Edit Markdown, wait for Saved state, go Home, reopen from History. | Reopened project contains the edited Markdown content and renders the same preview. |
| MD-028 | Persistence | Autosave after toolbar transform and reopen | Apply a toolbar transform, wait for Saved state, go Home, reopen from History. | Reopened content retains the toolbar-generated Markdown syntax and preview rendering. |
| MD-029 | Stats | Word count updates after typing and transforms | Type several words, apply inline formatting and list transforms. | Header word count reflects text words, not Markdown syntax noise where possible. |
| MD-030 | Navigation | Home button exits Markdown editor | Open Markdown editor, click Home. | App returns to home view; project appears in History if it was created. |
| MD-031 | Table | Existing Markdown table renders as table | Open a Markdown document seeded with a valid pipe table. | Editor preview renders a table with header cells and body cells matching the Markdown source. |
| MD-032 | Table | Edit table cell content | Open a Markdown document with a table, click a body cell, edit its text, and wait for autosave. | Serialized Markdown updates only the edited cell content while preserving table structure. |
| MD-033 | Table | Escape pipe characters in table cells | Open a Markdown table, edit a cell to contain `A | B`, and wait for autosave. | Serialized Markdown escapes the pipe as `A \| B` so the table column structure is preserved. |
| MD-034 | Table | Autosave and reopen edited table | Edit a Markdown table cell, wait for saved state, go Home, reopen from History. | Reopened project renders the edited table and serialized Markdown still contains a valid table. |

## Suggested Initial Automation Order

1. MD-001, MD-002, MD-027: prove creation, basic editing, and persistence.
2. MD-007, MD-012, MD-017, MD-020, MD-022: cover representative toolbar transforms.
3. MD-023, MD-024: cover history behavior.
4. MD-003 to MD-006 and MD-025: cover keyboard and selection reliability.
5. MD-031 to MD-034: cover Markdown table rendering, cell editing, escaping, and persistence.
6. Remaining toolbar cases and stats/navigation checks.

## Open Review Questions

- Should tests assert raw Markdown by reading the project API/database, or only assert visible preview and reopen behavior?
- Should keyboard shortcut behavior, such as Cmd+B/Cmd+I, be considered supported Markdown editor behavior or out of scope?
- Should toolbar placeholder insertion be tested as product behavior, or treated as implementation detail?
- Should Markdown image loading be allowed to hit `https://example.com/image.png`, or should tests only assert the generated `img` attributes?
