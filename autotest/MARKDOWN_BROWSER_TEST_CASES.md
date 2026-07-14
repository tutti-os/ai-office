# Markdown Editor Browser Test Cases

This document tracks proposed browser-use automation cases for the current Markdown editing area.

Current scope: Markdown document creation/opening, MDXEditor-hosted editing, the current visible toolbar, link popover, image file insertion/replacement, tables, code blocks, selection handling, undo/redo, autosave/reopen behavior, serialization boundaries, navigation, and AI edit context.

This file defines cases only. Temporary execution notes, screenshots, traces, and pass/fail conclusions should live outside this file.

## Assumptions

- Tests run against the local app server.
- A fresh Markdown project can be created from the home composer by choosing the Markdown output type and creating a blank or prompt-seeded document.
- For editor-area tests, API-created seeded Markdown projects are preferred so test setup does not obscure editing behavior.
- The editable Markdown document surface is the MDXEditor contenteditable element with class `markdown-preview`.
- Toolbar controls should be located by current DOM affordances: button `title`/`aria-label`, select `title`, input `aria-label`, or visible panel text.
- The Markdown toolbar currently does not expose stable `data-testid` attributes such as `md-bold` or `md-heading-1`.
- Toolbar actions that require an active editor are disabled until the Markdown editor has been focused or otherwise activated.
- Test assertions should inspect both visible editor DOM and saved project content from the API when persistence matters.
- Image insertion uses the file picker and stores inserted images as data URLs. Tests should provide a local fixture image rather than relying on remote image URLs.
- Execution notes, screenshots, traces, and failure notes are temporary artifacts and should not be written into this file.

## Current Toolbar Surface

- Always-visible buttons by title: `Undo`, `Redo`, `Bold`, `Italic`, `Strikethrough`, `Inline code`, `Numbered list`, `Bulleted list`, `Checklist`, `Image`, `Create link`, `Insert table`, `Quote`, `Thematic break`, `Code block`.
- Always-visible select by title: `Block style`.
- Block style options: `Normal Text`, `Heading 1`, `Heading 2`, `Heading 3`, `Heading 4`, `Quote`.
- Link popover inputs: `Link text`, `Link URL`; submit button text: `Apply`.
- Code blocks expose a textarea labelled `Code block`.
- Existing Markdown images expose an inline replacement control labelled `Replace image` when the image toolbar is visible.

## Not Currently Exposed By The Markdown Toolbar

The older Markdown test plan referenced controls or behaviors that are not part of the current UI. Browser toolbar automation should not expect these until the product UI adds them.

- No stable `md-*` test IDs are currently mounted for Markdown toolbar controls.
- No dedicated toolbar button exists for `Paragraph`; use the `Block style` select with `Normal Text`.
- No dedicated toolbar button exists for `Heading 1`; use the `Block style` select.
- No remote-URL image insertion panel exists. Image insertion currently opens a file input and writes a data URL.
- No one-click link insertion with a fixed `https://example.com` URL exists. The current link flow opens a popover and requires URL input.
- No separate edit/split/preview mode control is currently exposed. The current Markdown editor is an editable rich Markdown surface.

## Setup And Loading

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-001 | Setup | Create a blank Markdown document | From home, select Markdown output type, create a blank document, wait for editor. | Markdown editor opens; editable `.markdown-preview` surface is visible; toolbar is present; project appears in History. |
| MD-002 | Setup | Create Markdown document from prompt | Select Markdown output type, enter a prompt, create document, wait for editor and any run activity. | Markdown project opens with the prompt-seeded or AI-updated content; editor remains editable after run completion or failure. |
| MD-003 | Setup | Create Markdown document from template | Select Markdown output type, select a template card from home, wait for editor. | Template is converted to a readable Markdown seed with title/brief/draft content; project appears in History. |
| MD-004 | Setup | Open existing Markdown project by route | Seed a Markdown project through API, navigate directly to `/doc/<id>`. | Correct project loads, title matches project, `.markdown-preview` renders seeded Markdown. |
| MD-005 | Setup | Open existing Markdown project from History | Create or seed a project, go Home, open it from History. | Same project opens; visible editor content matches saved project content. |
| MD-006 | Setup | Current Markdown toolbar controls mount | Open a Markdown document and inspect the toolbar. | Undo/redo, block style, inline format, list, image, link, table, quote, thematic break, and code block controls are present. |
| MD-007 | Setup | Markdown route handles missing project | Navigate to a non-existing project ID. | UI shows a recoverable error and does not crash the app shell. |

## Keyboard Editing

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-008 | Keyboard | Editable surface accepts focus | Open blank Markdown document and click `.markdown-preview`. | The editor receives focus; toolbar actions that require activation become usable. |
| MD-009 | Keyboard | Type plain paragraph text | Click editable surface and type `Hello markdown world`. | Text appears in the editor; status changes to saving and then saved after autosave delay; word count updates. |
| MD-010 | Keyboard | Insert line breaks and multiple paragraphs | Type first paragraph, press Enter twice, type second paragraph. | Editor displays two separate paragraphs; saved Markdown preserves paragraph separation. |
| MD-011 | Keyboard | Replace selected text by typing | Seed or type `alpha beta gamma`, select `beta`, type `delta`. | Editor content becomes `alpha delta gamma`; saved Markdown no longer contains `beta`. |
| MD-012 | Keyboard | Backspace and Delete editing | Type `abcdef`, place cursor in the middle, use Backspace and Delete. | Expected adjacent characters are removed; editor remains editable and autosaves. |
| MD-013 | Keyboard | Markdown shortcuts create structure | Type Markdown shortcut text such as `# Title` followed by Space/Enter where supported. | MDXEditor converts supported Markdown shortcut syntax into the expected rich structure without dropping text. |
| MD-014 | Keyboard | Keyboard inline formatting shortcuts | Select text and use Cmd/Ctrl+B or Cmd/Ctrl+I where supported by the editor. | Supported shortcut formatting appears in the editor and serializes to Markdown markers. |
| MD-015 | Keyboard | Editor stats after direct edits | Type, delete, and add paragraphs or list items. | Header word and paragraph counts change consistently with Markdown content. |
| MD-016 | Keyboard | Autosave after direct input | Edit Markdown and wait past autosave delay. | Project API content contains the direct edit; header returns to saved. |
| MD-017 | Keyboard | Direct edit and reopen | Edit Markdown, wait for saved, go Home, reopen from History. | Reopened editor contains the edited Markdown content. |

## Selection And Toolbar State

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-018 | Selection | Text selection updates active context | Select text inside the Markdown editor. | Left AI panel active selection text and runtime selection reflect selected text where current selection APIs support it. |
| MD-019 | Selection | Collapsed caret records write context | Click inside a paragraph without selecting text. | Runtime selection is empty/write-like; insertion toolbar actions target the caret location. |
| MD-020 | Selection | Toolbar initially disabled until editor activation | Open a Markdown document without focusing the editor. | Editor-targeted toolbar actions are disabled or no-op safely. |
| MD-021 | Selection | Toolbar enables after editor focus | Click inside `.markdown-preview`. | Current toolbar controls become usable according to editor state. |
| MD-022 | Selection | Toolbar click preserves selected text target | Select text, click `Bold`, `Italic`, `Strikethrough`, or `Inline code`. | Toolbar action applies to the selected text rather than losing the selection to the button. |
| MD-023 | Selection | Popover inputs preserve editor intent | Select text, open `Create link`, type URL in the popover, apply. | Link operation still targets the intended selected text or uses the selected text in the link label. |
| MD-024 | Selection | Image selection exposes replacement affordance | Insert or seed an image, select/click it until the image toolbar is visible. | `Replace image` control appears and editor remains usable. |
| MD-025 | Selection | Table cell click keeps toolbar usable | Insert or seed a table, click a body cell. | Cell can be edited; global Markdown toolbar remains usable without crashing. |

## History

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-026 | History | Undo direct typing | Type text, click `Undo`. | Text returns toward the pre-typing state; `Redo` becomes enabled when editor history supports it. |
| MD-027 | History | Redo direct typing | After MD-026, click `Redo`. | Typed text is restored; saved content eventually matches restored text. |
| MD-028 | History | Undo toolbar operation | Apply a toolbar format or block/list transform, click `Undo`. | Editor returns to the pre-transform state; toolbar state updates. |
| MD-029 | History | Redo toolbar operation | After MD-028, click `Redo`. | Transform is restored; serialized Markdown reflects it. |
| MD-030 | History | New edit after undo truncates redo | Type text, undo, make a different edit. | Redo is disabled or no longer restores the abandoned branch; content follows the new edit branch. |
| MD-031 | History | History survives autosave boundary | Make an edit, wait for saved, then use undo/redo without navigating away. | Undo/redo continues to operate on editor history after autosave. |

## Block And Inline Formatting

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-032 | Block | Convert paragraph to Heading 1 | Place caret in a paragraph, choose `Heading 1` from `Block style`. | Block becomes an H1 visually; saved Markdown contains a level-one heading. |
| MD-033 | Block | Convert paragraph to Heading 2/3/4 | Repeat block conversion for `Heading 2`, `Heading 3`, and `Heading 4`. | Correct heading levels render and serialize with matching `##`, `###`, or `####` syntax. |
| MD-034 | Block | Convert heading to normal text | Place caret in a heading, choose `Normal Text` from `Block style`. | Heading becomes normal text; saved Markdown no longer contains the heading marker for that block. |
| MD-035 | Block | Convert paragraph to quote from select | Place caret in a paragraph, choose `Quote` from `Block style`. | Block becomes a blockquote or quote content is inserted according to current editor behavior; saved Markdown contains quote syntax. |
| MD-036 | Block | Quote toolbar action | Place caret in content, click `Quote`. | Quote content is inserted or current block becomes quoted according to current editor behavior; saved Markdown contains `>` quote syntax. |
| MD-037 | Inline | Bold selected text | Select text, click `Bold`. | Selected text is bold; saved Markdown contains bold syntax for that text. |
| MD-038 | Inline | Italic selected text | Select text, click `Italic`. | Selected text is italic; saved Markdown contains italic syntax for that text. |
| MD-039 | Inline | Strikethrough selected text | Select text, click `Strikethrough`. | Selected text is struck through; saved Markdown contains strikethrough syntax for that text. |
| MD-040 | Inline | Inline code selected text | Select text, click `Inline code`. | Selected text renders as inline code; saved Markdown contains backtick syntax for that text. |
| MD-041 | Inline | Toggle inline format off | Apply Bold to selected text, select the formatted text, click `Bold` again. | Bold formatting is removed without dropping text. |
| MD-042 | Inline | Mixed inline formatting nesting | Apply bold and italic to the same or overlapping text. | Editor remains stable; visual styles apply to intended text only; saved Markdown stays valid. |

## Lists

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-043 | Lists | Convert paragraphs to bulleted list | Select or place caret in paragraphs, click `Bulleted list`. | Content becomes unordered list items; saved Markdown uses `- ` or equivalent unordered list markers. |
| MD-044 | Lists | Convert paragraphs to numbered list | Select or place caret in paragraphs, click `Numbered list`. | Content becomes ordered list items; saved Markdown uses ordered list markers. |
| MD-045 | Lists | Create checklist | Select or place caret in content, click `Checklist`. | Content becomes task list items with checkboxes; saved Markdown contains task list syntax such as `- [ ]`. |
| MD-046 | Lists | Toggle list type | Convert a list between bulleted, numbered, and checklist. | List type changes while item text is preserved. |
| MD-047 | Lists | Toggle list off | Select list items or place caret in a list, click the active list control again. | Items unwrap to normal text/paragraphs without losing text where current editor behavior supports toggling off. |
| MD-048 | Lists | Nested list keyboard editing | Create a list, indent or outdent list items with keyboard controls where supported. | Nested list structure renders correctly and serializes to valid Markdown. |

## Links

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-049 | Link | Create link from selected text | Select `OpenAI`, click `Create link`, enter `https://openai.com` in `Link URL`, apply. | Selected text becomes a link; saved Markdown contains `[OpenAI](https://openai.com)` or equivalent escaped syntax. |
| MD-050 | Link | Create link with explicit label | Place caret, click `Create link`, fill `Link text` and `Link URL`, apply. | A new text link is inserted at the caret. |
| MD-051 | Link | URL normalization for bare domains | Create a link using `example.com` as URL. | Saved Markdown normalizes or preserves the URL according to current `normalizeMarkdownLinkUrl` behavior, expected `https://example.com`. |
| MD-052 | Link | Empty URL does not apply | Open link popover with an empty/default `https://` URL and submit. | Popover does not insert an invalid empty link; editor content remains unchanged. |
| MD-053 | Link | Link popover dismiss | Open link popover, press Escape or click outside. | Popover closes; Markdown content is unchanged and editor remains usable. |
| MD-054 | Link | Remove existing link through active link control | Click inside an existing link, click active `Create link` control if it is in remove mode. | Link formatting is removed and visible text remains, according to current editor behavior. |

## Images

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-055 | Image | Insert image from file picker | Click insertion point, click `Image`, provide a fixture image through the hidden file input. | Image appears in the editor with data URL `src` and inferred alt text; saved Markdown contains image syntax with a data URL. |
| MD-056 | Image | Non-image file is ignored | Use the image file input with a non-image file. | No image is inserted and editor remains stable. |
| MD-057 | Image | Select image shows replacement control | Insert or seed an image and select/click it. | `Replace image` control appears when the image toolbar is visible. |
| MD-058 | Image | Replace selected image | Select an image, click `Replace image`, provide another fixture image. | Same image target updates to the replacement data URL and keeps Markdown content valid. |
| MD-059 | Image | Persist image insertion | Insert an image, wait for saved, go Home, reopen. | Reopened editor renders the image; saved Markdown still contains the data URL image syntax. |
| MD-060 | Image | Image alt text inferred from file name | Insert `sample-chart.png`. | Saved Markdown or rendered image alt text uses `sample chart` or the current file-name-derived alt behavior. |

## Code Blocks And Thematic Breaks

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-061 | Code | Insert code block | Place caret, click `Code block`. | A code block appears with textarea labelled `Code block`; saved Markdown contains fenced code block syntax. |
| MD-062 | Code | Edit code block content | Insert a code block, type `const x = 1;` into the code block textarea. | Code content appears inside the block and serializes inside fences. |
| MD-063 | Code | Preserve code block after reopen | Edit a code block, wait for saved, go Home, reopen. | Reopened editor renders the same code block content. |
| MD-064 | Thematic Break | Insert thematic break | Place cursor after a paragraph, click `Thematic break`. | Horizontal rule appears after current content; saved Markdown contains thematic break syntax. |
| MD-065 | Thematic Break | Undo thematic break insertion | Insert thematic break, click `Undo`. | Thematic break is removed and surrounding content remains intact. |

## Tables

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-066 | Table | Insert default table | Place cursor after existing content, click `Insert table`. | A 3x3 table appears; saved Markdown contains a valid pipe table. |
| MD-067 | Table | Existing Markdown table renders as table | Open a Markdown document seeded with a valid pipe table. | Editor renders a table with header/body cells matching the Markdown source. |
| MD-068 | Table | Edit table cell content | Open or insert a table, click a body cell, edit its text, and wait for autosave. | Saved Markdown updates the edited cell while preserving table structure. |
| MD-069 | Table | Add text containing pipe to table cell | Edit a cell to contain `A | B` and wait for autosave. | Saved Markdown escapes or otherwise preserves the pipe so the table column structure remains valid. |
| MD-070 | Table | Table inline formatting | Click inside a table cell, apply Bold or Inline code. | Formatting applies to the cell content only and serializes to valid Markdown inside the table. |
| MD-071 | Table | Autosave and reopen edited table | Edit a Markdown table cell, wait for saved, go Home, reopen from History. | Reopened project renders the edited table and saved Markdown still contains a valid table. |
| MD-072 | Table | Undo table insertion | Insert a table, click `Undo`. | Table insertion is undone without corrupting surrounding content. |

## Persistence, Serialization, And Navigation

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-073 | Persistence | Autosave after toolbar transform | Apply a toolbar transform, wait for saved, fetch project API. | Saved project content includes the transformed Markdown syntax. |
| MD-074 | Persistence | Reopen after multiple edits | Make direct, toolbar, link, image, code block, and table edits; wait saved; go Home; reopen. | All edits render correctly after reopening. |
| MD-075 | Persistence | Browser reload on document route | Open edited Markdown project and reload route. | Document reloads from saved content without losing persisted edits. |
| MD-076 | Serialization | Preserve Markdown syntax boundaries | Seed Markdown with headings, lists, blockquotes, code fences, links, images, and tables, then save after a small edit. | Saved content remains valid Markdown and does not drop unrelated syntax. |
| MD-077 | Serialization | No HTML runtime artifacts in Markdown | Edit/save a Markdown document. | Saved Markdown does not contain HTML iframe runtime scripts, runtime overlay nodes, or HTML-editor-only attributes. |
| MD-078 | Serialization | Rich editor changes serialize to Markdown | Apply current toolbar formatting and blur editor. | Saved project content contains Markdown syntax rather than editor-only DOM. |
| MD-079 | Navigation | Home exits Markdown editor | Open Markdown editor, click Home from the left conversation panel. | App returns to home view and project appears in History. |
| MD-080 | Navigation | Dirty state resolves before leaving | Edit Markdown, wait for saved, navigate Home. | No unsaved changes indicator remains; history item opens saved version. |
| MD-081 | Navigation | Open HTML after Markdown | Open Markdown project, go Home, open HTML project. | Runtime switches cleanly; no stale Markdown toolbar/editor state leaks into HTML editor. |
| MD-082 | Navigation | Open DOCX after Markdown | Open Markdown project, go Home, open DOCX project. | Runtime switches cleanly; no stale Markdown editor state leaks into DOCX preview. |
| MD-094 | Navigation | Pending table cell edit is not reported as saved | Edit a Markdown table cell and keep focus inside the cell without pressing Tab/Enter or clicking outside the table. | Header/dirty state does not misleadingly report a fully saved document while the cell edit is still pending commit. |
| MD-095 | Navigation | Home commits pending table cell edit before leaving | Edit a Markdown table cell, keep focus in the cell, then click Home from the left conversation panel. | The active cell edit is committed through the table editor lifecycle, autosaved, and the project reopens with the edited cell content. |
| MD-096 | Navigation | Browser reload warns on pending table cell edit | Edit a Markdown table cell, keep focus in the cell, then attempt browser reload before the cell edit is committed/saved. | Browser shows an unsaved-changes confirmation instead of silently reloading and losing the visible cell edit. |

## AI Context And Conversation Panel

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-083 | AI Context | Active selection text is shown | Select text in the Markdown editor. | Conversation panel displays the selected text context where current selection APIs expose it. |
| MD-084 | AI Context | Send prompt with no selection | Open Markdown project, send a prompt using a deterministic test/stub provider. | Request includes current Markdown content and write-mode context; UI shows accepted/running/completed item. |
| MD-085 | AI Context | Send prompt with text selection | Select text, send a prompt using a deterministic test/stub provider. | Request includes selected text, Markdown content, selection type, and selection path. |
| MD-086 | AI Context | AI update reloads Markdown runtime | Simulate or run an AI project update with `updatedBy: ai`. | Markdown runtime reloads new content, history list updates, stale selection is cleared. |
| MD-087 | AI Context | AI error is visible and recoverable | Force provider/API error when sending prompt. | Error appears in conversation panel; editor remains usable. |

## Toolbar And Responsive Behavior

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| MD-088 | Toolbar | Disabled controls do not mutate content | Before editor activation, click disabled actions where possible. | No content mutation occurs and no console/runtime crash happens. |
| MD-089 | Toolbar | Toolbar works after editor scroll | Scroll editor page, select content, use toolbar. | Toolbar remains usable and actions target the Markdown editor selection. |
| MD-090 | Toolbar | Narrow viewport toolbar wraps accessibly | Set a narrow viewport and run representative toolbar actions across wrapped rows. | Controls remain reachable; no overlapping text or unusable popover. |
| MD-091 | Toolbar | Link popover positions within viewport | Open `Create link` near viewport edges or after scroll. | Floating link UI stays within viewport margins and remains usable. |
| MD-092 | Toolbar | Code block editor usable on narrow viewport | Insert and edit a code block on a narrow viewport. | Code textarea remains reachable and text does not overflow controls in a blocking way. |
| MD-093 | Toolbar | Image replacement toolbar does not overlap badly | Select an image on desktop and mobile viewport widths. | Replacement control is reachable and does not prevent continuing to edit the document. |

## Suggested Automation Order

1. MD-001, MD-004, MD-008, MD-009, MD-016, MD-017: prove creation, route loading, editability, autosave, and reopen.
2. MD-018 to MD-025: stabilize editor activation, selection capture, toolbar selection preservation, and popover/image/table focus behavior.
3. MD-032 to MD-048: cover visible block, inline, and list toolbar controls.
4. MD-049 to MD-054: cover current link popover behavior.
5. MD-055 to MD-060: cover current image file insertion, replacement, and persistence.
6. MD-061 to MD-065: cover code block and thematic break behavior.
7. MD-066 to MD-072: cover current table insertion, editing, serialization, and persistence.
8. MD-026 to MD-031: cover history behavior once basic editing and toolbar actions are stable.
9. MD-073 to MD-082 and MD-094 to MD-096: cover serialization, navigation, pending table-cell protection, and cross-runtime switching.
10. MD-083 to MD-087: cover AI context only when a deterministic test/stub provider is available.
11. MD-088 to MD-093: cover toolbar responsive behavior, disabled states, and floating UI positioning.

## Open Review Questions

- Should the Markdown toolbar add stable `data-testid` values before broad automation, or is title/aria-label based targeting acceptable?
- Should Markdown browser tests create projects only through API, or should a smaller smoke suite also cover home composer/template creation?
- Should AI context tests use a dedicated stub Agent Target to avoid relying on the machine's current Agent catalog?
- Should selection assertions tolerate current MDXEditor selection API limitations, or should the product add stronger selection instrumentation?
- Should table serialization assertions compare exact Markdown, or assert valid table structure plus expected edited content?
