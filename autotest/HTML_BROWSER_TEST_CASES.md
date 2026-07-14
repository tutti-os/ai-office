# HTML Editor Browser Test Cases

This document tracks proposed browser-use automation cases for the current HTML editing area.

Current scope: HTML document creation/opening, iframe-hosted editing, selection handling, the current visible toolbar, link popover, image file insertion/replacement/resizing, table insertion and visible table toolbar actions, history, autosave/reopen behavior, serialization boundaries, navigation, and AI edit context.

This file defines cases only. Temporary execution notes, screenshots, traces, and pass/fail conclusions should live outside this file.

## Assumptions

- Tests run against the local app server.
- A fresh HTML project can be created from the home composer, a template card, or directly through the project API.
- For editor-area tests, API-created seeded HTML projects are preferred so test setup does not obscure editing behavior.
- The HTML editor runtime is hosted inside an iframe with title equal to the current document title, usually `Runtime document` or the project title.
- The iframe document body is `contenteditable="true"` after load.
- Toolbar controls should be located by current DOM affordances: button `title`/`aria-label`, select `title`, input `aria-label`, or visible panel text.
- Unlike Markdown, the HTML toolbar currently does not expose stable `data-testid` attributes.
- Test assertions should inspect both visible iframe DOM and saved project content from the API when persistence matters.
- Execution notes, screenshots, traces, and failure notes are temporary artifacts and should not be written into this file.

## Current Toolbar Surface

- Always-visible buttons by title: `Undo`, `Redo`, `Bold`, `Italic`, `Underline`, `Strikethrough`, `Align left`, `Align center`, `Align right`, `Justify`, `Spacing`, `Layout`, `Numbered list`, `Bulleted list`, `Checklist`, `Indent`, `Outdent`, `Text color`, `Fill color`, `Image`, `Create link`, `Insert table`.
- Always-visible selects by title: `Block style`, `Font family`.
- Font size controls: `Decrease font size`, `Font size`, `Increase font size`.
- Link popover inputs: `Link text`, `Link URL`; submit button text: `Apply`; existing-link remove button text: `Remove`.
- Insert table panel inputs: `Table rows`, `Table columns`; buttons: `Apply`, `Cancel`.
- Spacing menu inputs: `Letter spacing`, `Letter spacing value`, `Line height`, `Line height value`.
- Layout menu controls: `Layout`, margin/padding side inputs labelled `Top`, `Right`, `Bottom`, `Left`, and buttons `Reset Margin`, `Reset Padding`. Because margin and padding use duplicate side labels, tests may need to scope locators within the `Margin` or `Padding` section.
- Table toolbar buttons shown only when a table target is active: `Add column`, `Delete column`, `Add row`, `Delete row`, `Copy row`, `Copy column`, `Move column left`, `Move column right`, `Move row up`, `Move row down`.
- Image selection overlay inside the iframe exposes `Replace image` and resize handles labelled `Resize top-left`, `Resize top`, `Resize top-right`, `Resize right`, `Resize bottom-right`, `Resize bottom`, `Resize bottom-left`, `Resize left`.

## Not Currently Exposed By The HTML Toolbar

The runtime/model still contains handlers for some richer operations, but the current HTML toolbar does not expose browser-reachable UI for them. Browser toolbar automation should not expect these controls until the product UI adds them.

- No `More` menu is currently mounted in `HtmlEditorToolbar`.
- No visible toolbar entry currently opens `Insert text`, `Insert HTML`, `Replace selection`, `Append text`, `Append HTML`, `Insert at position`, `Wrap selection`, `Set attributes`, `Style`, or URL-based `Image` panels.
- No visible toolbar entry currently exposes `Horizontal rule`, `Clear formatting`, `Remove image`, `Collapse toolbar`, or `Expand toolbar`.
- Table handlers exist for additional actions such as row/column before, header toggles, merge/split, distribute, and delete table, but the current visible HTML toolbar exposes only the table actions listed above.

## Setup And Loading

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-001 | Setup | Create a blank HTML document | From home, keep output type as HTML, create a blank document, wait for editor. | HTML editor opens; iframe is visible; iframe body is editable; header shows saved/word/element summary. |
| HTML-002 | Setup | Create HTML document from prompt | Enter a prompt, create document as HTML, wait for editor. | Project title derives from prompt or attachment; HTML runtime opens with editable iframe content. |
| HTML-003 | Setup | Create HTML document from template | Select an HTML template card from home and wait for editor. | Template HTML renders in the iframe; toolbar is available; project appears in history. |
| HTML-004 | Setup | Open existing HTML project by route | Seed an HTML project through API, navigate directly to `/doc/<id>`. | Correct project loads, title matches project, iframe body contains seeded HTML. |
| HTML-005 | Setup | Open existing HTML project from History | Create a project, go Home, open it from History. | Same project opens; iframe content matches saved project content. |
| HTML-006 | Setup | Current HTML toolbar controls mount | Open an HTML document and inspect the toolbar. | Current always-visible controls are present: undo/redo, block/font/font-size controls, inline format buttons, alignment, spacing, layout, list/indent controls, color controls, image, link, and table. |
| HTML-007 | Setup | HTML route handles missing project | Navigate to a non-existing project ID. | UI shows a recoverable error and does not crash the app shell. |

## Iframe Editing And Keyboard

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-008 | Keyboard | Iframe body is contenteditable | Open a blank or seeded HTML document, inspect iframe body. | `document.body.contentEditable` is `true`; body accepts focus and caret placement. |
| HTML-009 | Keyboard | Type plain text in body | Click an empty paragraph or body, type `Hello HTML world`. | Text appears in iframe DOM; editor stats update; autosave starts then returns to saved. |
| HTML-010 | Keyboard | Insert paragraph break | Type first line, press Enter, type second line. | Two editable block/paragraph lines are visible; saved HTML preserves both lines. |
| HTML-011 | Keyboard | Replace selected text | Seed `alpha beta gamma`, select `beta`, type `delta`. | Visible text becomes `alpha delta gamma`; saved HTML no longer contains `beta`. |
| HTML-012 | Keyboard | Backspace and Delete editing | Seed `abcdef`, place caret in middle, use Backspace and Delete. | Expected adjacent characters are removed; iframe remains editable after each key. |
| HTML-013 | Keyboard | Select text with keyboard | Focus text, use keyboard selection to select a word. | Runtime active selection contains selected text; toolbar actions target the selected range. |
| HTML-014 | Keyboard | Native copy/paste plain text | Select text, copy, place caret elsewhere, paste. | Pasted text appears at caret; HTML serialization remains valid. |
| HTML-015 | Keyboard | Paste rich HTML into iframe | Put simple safe HTML on clipboard or use browser paste helper, paste into body. | Pasted HTML is inserted; persisted HTML remains valid and runtime-only editing attributes are absent. |
| HTML-016 | Keyboard | Typing after collapsed style command | Place caret, apply a typing style such as text color or font size, type text. | Newly typed text receives the chosen style marker; abandoned markers are cleaned up if unused. |
| HTML-017 | Keyboard | Editor stats after direct edits | Type, delete, and add elements. | Header word and element counts change consistently with iframe DOM. |
| HTML-018 | Keyboard | Autosave after direct input | Edit iframe text and wait past autosave delay. | Project API content contains the direct edit; header returns to saved. |
| HTML-019 | Keyboard | Direct edit and reopen | Edit iframe text, wait for saved, go Home, reopen. | Reopened iframe contains the edited text and equivalent HTML structure. |

## Selection And Toolbar State

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-020 | Selection | Text selection updates active context | Select text inside iframe. | Left AI panel active selection text and runtime selection reflect selected text. |
| HTML-021 | Selection | Collapsed caret records write selection | Click inside a paragraph without selecting text. | Runtime selection type is write; insertion-style toolbar actions can target that location. |
| HTML-022 | Selection | Toolbar initially disabled until iframe activation | Open an HTML document without focusing the iframe. | Toolbar actions that require editor activation are disabled or no-op safely. |
| HTML-023 | Selection | Toolbar enables after iframe focus | Click inside iframe content. | Current toolbar controls become usable according to the selected target. |
| HTML-024 | Selection | Toolbar click preserves selected range | Select text, click `Bold` or another toolbar button. | Toolbar action applies to selected text rather than losing selection to the button. |
| HTML-025 | Selection | Popover inputs preserve editor selection | Select text, open `Create link`, type into `Link URL`, apply. | Link operation still targets the original iframe selection. |
| HTML-026 | Selection | Image click selects image object | Seed or insert an image, click the image. | Image selection overlay appears, toolbar image state is active, and selection remains inside iframe. |
| HTML-027 | Selection | Table cell click exposes table toolbar | Insert or seed a table, click a cell. | Table-specific toolbar buttons appear and enabled states match the current cell/table. |

## History

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-028 | History | Undo direct typing | Type text, click `Undo`. | Text returns to pre-typing state; `Redo` becomes enabled. |
| HTML-029 | History | Redo direct typing | After HTML-028, click `Redo`. | Typed text is restored; saved content eventually matches restored text. |
| HTML-030 | History | Undo toolbar operation | Apply a toolbar format or block transform, click `Undo`. | DOM returns to pre-transform state; toolbar state updates. |
| HTML-031 | History | Redo toolbar operation | After HTML-030, click `Redo`. | Transform is restored; serialized HTML reflects it. |
| HTML-032 | History | Rapid typing merges history | Type several characters continuously within the merge window. | A single undo removes the merged typing batch rather than one character at a time. |
| HTML-033 | History | Color or spacing changes merge history | Change text color, fill color, line height, or letter spacing repeatedly within the merge window. | Undo returns to the pre-change state in one step. |
| HTML-034 | History | New edit after undo truncates redo | Type text, undo, make a different edit. | Redo is disabled; history follows the new edit branch. |
| HTML-035 | History | Undo restores selection target | Apply a transform to a selected text, image, or table cell, undo. | DOM and selection/toolbar target restore without throwing or selecting outside iframe. |

## Block And Inline Formatting

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-036 | Block | Convert paragraph to Heading 1 | Place caret in a paragraph, choose `Heading 1` from `Block style`. | Block becomes `h1`; visible style and serialized HTML reflect heading. |
| HTML-037 | Block | Convert headings H2/H3/H4 | Repeat block conversion for `Heading 2`, `Heading 3`, `Heading 4`. | Correct heading tag is used each time. |
| HTML-038 | Block | Convert block to normal text | Convert a heading back to `Normal Text`. | Block becomes a normal paragraph-compatible block; heading tag is removed. |
| HTML-039 | Block | Convert paragraph to quote | Choose `Quote` from `Block style`. | Block becomes `blockquote` or equivalent quote block. |
| HTML-040 | Inline | Bold selected text | Select text, click `Bold`. | Selected text is wrapped or styled as bold; toolbar Bold becomes active in selection. |
| HTML-041 | Inline | Italic selected text | Select text, click `Italic`. | Selected text is italic; serialization preserves italic styling. |
| HTML-042 | Inline | Underline selected text | Select text, click `Underline`. | Selected text is underlined; toolbar reflects active underline. |
| HTML-043 | Inline | Strikethrough selected text | Select text, click `Strikethrough`. | Selected text is struck through; toolbar reflects active strikethrough. |
| HTML-044 | Inline | Toggle inline format off | Apply Bold to selected text, select the formatted text, click `Bold` again. | Bold formatting is removed without dropping text. |
| HTML-045 | Inline | Mixed inline formatting nesting | Apply bold and italic to overlapping or same selected text. | DOM remains valid; both visual styles apply to intended text only. |

## Typography, Spacing, Color, And Layout

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-046 | Typography | Change font family | Select text or place caret in a block, choose `Georgia`, `Times`, `Courier`, or `Inter` from `Font family`. | Target content uses selected font family; toolbar reads it back. |
| HTML-047 | Typography | Change font size with input | Select text or block, fill `Font size` with a specific number and commit. | Target content style contains the requested pixel font size. |
| HTML-048 | Typography | Change font size with stepper buttons | Select text or block, click `Increase font size` and `Decrease font size`. | Font size changes by step and can be reversed. |
| HTML-049 | Typography | Apply text color | Select text, use `Text color` color input. | Target text color changes; saved HTML contains a valid color style. |
| HTML-050 | Typography | Apply fill/background color | Select text, block, or table cell, use `Fill color`. | Background color applies to intended target only. |
| HTML-051 | Layout | Align left/center/right/justify | Place caret in a block and click each alignment control. | Block `text-align` updates to the selected alignment each time. |
| HTML-052 | Spacing | Open and close Spacing menu | Click `Spacing`, then click outside or press Escape. | Floating menu opens with letter spacing and line height controls, then closes without mutating content. |
| HTML-053 | Spacing | Adjust line height | Open `Spacing`, set `Line height` or `Line height value`. | Target style line-height updates and persists. |
| HTML-054 | Spacing | Adjust letter spacing | Open `Spacing`, set `Letter spacing` or `Letter spacing value`. | Target style letter-spacing updates and persists. |
| HTML-055 | Layout | Open and close Layout menu | Click `Layout`, then click outside or press Escape. | Floating menu opens with margin and padding controls, then closes without mutating content. |
| HTML-056 | Layout | Adjust margin controls | Open `Layout`, change scoped margin top/right/bottom/left controls. | Target element margin styles update and persist. |
| HTML-057 | Layout | Adjust padding controls | Open `Layout`, change scoped padding top/right/bottom/left controls. | Target element padding styles update and persist. |
| HTML-058 | Layout | Reset margin and padding | Apply margin/padding through `Layout`, click `Reset Margin` and `Reset Padding`. | Corresponding inline layout styles are removed or cleared. |

## Lists And Indentation

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-059 | Lists | Convert paragraphs to bulleted list | Select multiple paragraphs, click `Bulleted list`. | Paragraphs become list items in `ul`; visible bullets appear. |
| HTML-060 | Lists | Convert paragraphs to numbered list | Select multiple paragraphs, click `Numbered list`. | Paragraphs become ordered list items in `ol`. |
| HTML-061 | Lists | Toggle list type | Convert a list between bulleted and numbered. | List tag changes while item text is preserved. |
| HTML-062 | Lists | Toggle list off | Select list items and click the active list control again. | Items unwrap to paragraphs/blocks without losing text. |
| HTML-063 | Lists | Create checklist | Select paragraphs or list items, click `Checklist`. | Items become checklist list items with checkbox inputs and `data-ai-checklist="true"`. |
| HTML-064 | Lists | Toggle checklist off | Select checklist items and click `Checklist` again. | Checklist unwraps or converts back to ordinary blocks/lists. |
| HTML-065 | Indent | Indent and outdent block | Place caret in paragraph, click `Indent`, then `Outdent`. | Block indentation increases then returns toward original value. |
| HTML-066 | Indent | Indent and outdent list item | Place caret in a list item, click `Indent`, then `Outdent`. | Nested list is created or item moves indentation level; outdent reverses it. |
| HTML-067 | Indent | Indent selected table cells | Select or click table cells, click `Indent`. | Cell content or cell padding/indent changes consistently across selected cells. |

## Links

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-068 | Link | Create link from selected text | Select text, click `Create link`, enter `https://example.com`, apply. | Selected text becomes an anchor with normalized href; toolbar link state becomes active. |
| HTML-069 | Link | Create link at collapsed cursor | Place caret, click `Create link`, enter URL and optional `Link text`, apply. | A new text link is inserted at caret. |
| HTML-070 | Link | Edit existing link href | Click an existing link, click `Create link`, change URL, apply. | Existing anchor href updates; link text remains unless changed. |
| HTML-071 | Link | Remove existing link from link popover | Click inside an existing link, click `Create link`, then click `Remove`. | Anchor is replaced with plain text; text remains visible. |
| HTML-072 | Link | Link URL normalization | Create links using `example.com` and an already-normalized URL. | Saved hrefs are normalized and safe; invalid/empty URLs are not applied. |
| HTML-073 | Link | Link popover dismiss | Open the link popover, press Escape or click outside. | Popover closes; iframe content is unchanged and editor remains usable. |

## Images

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-074 | Image | Insert image from file picker | Click insertion point, click `Image`, provide an image file through the hidden file input. | Image appears with data URL `src`, inferred alt text, and max-width styling. |
| HTML-075 | Image | Select image shows overlay | Click an existing image. | Image selection overlay appears with `Replace image` and resize handles. |
| HTML-076 | Image | Replace selected image from overlay | Select an image, click `Replace image`, provide another image file. | Same image target updates to the replacement data URL and keeps editable document stable. |
| HTML-077 | Image | Resize selected image | Drag a resize handle such as `Resize bottom-right`. | Image width/height style updates and persists after autosave. |
| HTML-078 | Image | Non-image file is rejected | Use the image file input with a non-image file. | Error appears; no image is inserted or replaced. |
| HTML-079 | Image | Image overlay does not persist | Save/reopen after selecting an image. | Saved HTML does not contain `data-runtime-editor-overlay` nodes. |

## Tables

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-080 | Table | Insert default table | Click `Insert table`, keep default 3 rows and 3 columns, apply. | A 3x3 editable table appears with `data-ai-doc-table="true"` and bordered cells. |
| HTML-081 | Table | Insert custom table dimensions | Insert a 2x4 table using `Table rows` and `Table columns`. | Table has 2 rows and 4 columns. |
| HTML-082 | Table | Clamp invalid table dimensions | Try rows/columns of 0, negative, or very large values. | Inserted table dimensions are clamped to supported range, 1 to 12. |
| HTML-083 | Table | Cancel table insertion | Click `Insert table`, change draft values, click `Cancel`. | Panel closes and no table is inserted. |
| HTML-084 | Table | Type into table cell | Click a cell and type text. | Text appears inside that cell only and autosaves. |
| HTML-085 | Table | Select multiple cells by drag | Drag from one table cell to another. | Selected cells get `data-ai-table-cell-selected`; table toolbar actions become available. |
| HTML-086 | Table | Add row after | Click a cell, click `Add row`. | A row is inserted after the current row and compatible cell styling is preserved. |
| HTML-087 | Table | Add column after | Click a cell, click `Add column`. | A column is inserted after the current column across all rows. |
| HTML-088 | Table | Delete row | Click a cell, click `Delete row`. | Current row is removed; remaining table structure stays valid. |
| HTML-089 | Table | Delete column | Click a cell, click `Delete column`. | Current column is removed from all rows; table stays valid. |
| HTML-090 | Table | Copy row | Click a row cell, click `Copy row`. | A duplicate row is inserted with matching content and styles. |
| HTML-091 | Table | Copy column | Click a column cell, click `Copy column`. | A duplicate column is inserted with matching content and styles. |
| HTML-092 | Table | Move row up and down | Click a row that can move, use `Move row up`, then `Move row down`. | Row order changes then can be restored. |
| HTML-093 | Table | Move column left and right | Click a column that can move, use `Move column left`, then `Move column right`. | Column order changes then can be restored. |
| HTML-094 | Table | Table edit availability at edges | Click first/last rows and columns. | Move/delete/copy controls are enabled or disabled according to valid table actions. |
| HTML-095 | Table | Format active table cell | Click a cell, apply bold, color, fill, alignment, list, or checklist. | Formatting applies to the active cell/selection only. |
| HTML-096 | Table | Persist table edits | Perform several visible table toolbar edits, wait for saved, reopen project. | Reopened iframe preserves table structure, styles, and cell text. |

## Persistence, Serialization, And Navigation

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-097 | Persistence | Autosave after toolbar transform | Apply a toolbar transform, wait for saved, fetch project API. | Saved project content includes the transformed HTML. |
| HTML-098 | Persistence | Reopen after multiple edits | Make direct, toolbar, image, and table edits; wait saved; go Home; reopen. | All edits render correctly after reopening. |
| HTML-099 | Persistence | Browser reload on document route | Open edited project, reload route. | Document reloads from saved content without losing persisted edits. |
| HTML-100 | Serialization | Preserve doctype/html/head/body | Seed HTML with doctype, html attributes, head metadata/title/style, and body attributes. | Saved HTML preserves intended document shell and body content. |
| HTML-101 | Serialization | Strip runtime-only attributes | Save a document after editing cells/images/selections. | Serialized HTML does not persist runtime-only attributes such as `data-runtime-*`, editable cell helpers, or overlay nodes. |
| HTML-102 | Serialization | Preserve safe styles | Apply inline styles through visible toolbar controls and save. | Safe style attributes persist with expected values. |
| HTML-103 | Serialization | Strip runtime bridge and overlay content | Edit/save a document after frame load and image selection. | Saved content does not include editor runtime scripts, runtime styles, editable cell helpers, or image overlay nodes. |
| HTML-104 | Navigation | Home exits editor | Click Home from the left conversation panel. | App returns to home view and project appears in History. |
| HTML-105 | Navigation | Dirty state resolves before leaving | Edit document, wait for saved, navigate Home. | No unsaved changes indicator remains; history item opens saved version. |
| HTML-106 | Navigation | Open Markdown after HTML | Open HTML project, go Home, open Markdown project. | Runtime switches cleanly; no stale HTML toolbar/table state leaks into Markdown editor. |
| HTML-107 | Navigation | Open DOCX after HTML | Open HTML project, go Home, open DOCX project. | Runtime switches cleanly; no stale HTML iframe state leaks into DOCX preview. |
| HTML-119 | Navigation | Browser reload warns while HTML save is pending | Make an HTML edit and attempt browser reload before the server save has been accepted. | Browser shows an unsaved-changes confirmation instead of silently reloading during a pending local edit/save. |
| HTML-120 | Navigation | Home warns while HTML save is pending | Make an HTML edit and click Home before the server save has been accepted. | App shows an unsaved-changes confirmation; cancel keeps the editor open and the edit remains visible. |
| HTML-121 | Navigation | Home after accepted save does not warn | Make an HTML edit, wait until the header returns to Saved, then click Home and reopen. | App returns Home without an unsaved-changes prompt, and the reopened project contains the edit. |

## AI Context And Conversation Panel

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-108 | AI Context | Active selection text is shown | Select text in iframe. | Conversation panel displays the selected text context. |
| HTML-109 | AI Context | Send prompt with no selection | Open HTML project, send a prompt using a deterministic test/stub provider. | Request includes current HTML and write-mode context; UI shows accepted/running/completed item. |
| HTML-110 | AI Context | Send prompt with text selection | Select text, send prompt using a deterministic test/stub provider. | Request includes selected text, selected HTML, selection type, and selection path. |
| HTML-111 | AI Context | Send prompt with table cell selection | Select table cells, send prompt using a deterministic test/stub provider. | Request context identifies current HTML and relevant selection/target path. |
| HTML-112 | AI Context | AI update reloads HTML runtime | Simulate or run an AI project update with `updatedBy: ai`. | HTML runtime reloads new content, history list updates, stale selection is cleared. |
| HTML-113 | AI Context | AI error is visible and recoverable | Force provider/API error when sending prompt. | Error appears in conversation panel; editor remains usable. |

## Toolbar And Responsive Behavior

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-114 | Toolbar | Operation panel Cancel | Open `Insert table`, enter draft data, click `Cancel`. | Panel closes; iframe content is unchanged. |
| HTML-115 | Toolbar | Disabled controls do not mutate content | With no valid target or before iframe activation, click disabled actions where possible. | No DOM mutation occurs and no console/runtime crash happens. |
| HTML-116 | Toolbar | Toolbar works after iframe scroll | Scroll editor page, select content, use toolbar. | Sticky toolbar remains usable and actions target iframe selection. |
| HTML-117 | Toolbar | Narrow viewport toolbar wraps accessibly | Set a narrow viewport and run representative toolbar actions across wrapped rows. | Controls remain reachable; no overlapping text or unusable operation panel. |
| HTML-118 | Toolbar | Floating menus position within viewport | Open `Spacing`, `Layout`, and link popover near viewport edges. | Floating UI stays within viewport margins and remains usable. |

## Suggested Automation Order

1. HTML-001, HTML-004, HTML-008, HTML-009, HTML-018, HTML-019: prove creation, route loading, iframe editability, autosave, and reopen.
2. HTML-020 to HTML-027: stabilize iframe activation, selection capture, and toolbar selection preservation.
3. HTML-036 to HTML-058: cover visible block, inline, typography, spacing, color, and layout toolbar controls.
4. HTML-059 to HTML-067: cover lists and indentation.
5. HTML-068 to HTML-073: cover current link popover behavior.
6. HTML-074 to HTML-079: cover current image file insertion, replacement, resizing, and overlay cleanup.
7. HTML-080 to HTML-096: cover current visible table panel and table toolbar actions.
8. HTML-097 to HTML-107 and HTML-119 to HTML-121: cover serialization, navigation, unsaved-change protection, and cross-runtime switching.
9. HTML-108 to HTML-113: cover AI context only when a deterministic test/stub provider is available.
10. HTML-114 to HTML-118: cover toolbar responsive behavior, disabled states, cancel states, and floating menu positioning.

## Open Review Questions

- Should HTML browser tests create projects only through API, or should a smaller smoke suite also cover home composer/template creation?
- Should the HTML toolbar add stable `data-testid` values before broad automation, or is title/aria-label based targeting acceptable?
- Should AI context tests use a dedicated stub Agent Target to avoid relying on the machine's current Agent catalog?
- Should currently-unmounted runtime actions get product UI again, or should separate non-browser unit/integration tests cover those handlers?
- Should sanitization assertions compare saved HTML exactly, or assert only the absence of unsafe/runtime-only nodes and attributes plus presence of expected safe content?
