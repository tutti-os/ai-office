# HTML Editor Browser Test Cases

This document tracks proposed browser-use automation cases for the HTML editing area.

Current scope: HTML document creation/opening, iframe-hosted editing, selection handling, toolbar transforms, operation panels, links, images, tables, history, autosave/reopen behavior, sanitization boundaries, and AI edit context.

This file defines cases only. Temporary execution notes, screenshots, traces, and pass/fail conclusions should live outside this file.

## Assumptions

- Tests run against the local app server.
- A fresh HTML project can be created from the home composer, a template card, or directly through the project API.
- For editor-area tests, API-created seeded HTML projects are preferred so test setup does not obscure editing behavior.
- The HTML editor runtime is hosted inside an iframe with title equal to the current document title, usually `Runtime document` or the project title.
- The iframe document body is `contenteditable="true"` after load.
- Toolbar controls are mostly located by button `title`, select `title`, menu `role`, or operation panel `aria-label`; unlike Markdown, the HTML toolbar currently does not expose stable `data-testid` attributes.
- Test assertions should inspect both visible iframe DOM and the saved project content from the API when persistence matters.
- Execution notes, screenshots, traces, and failure notes are temporary artifacts and should not be written into this file.

## Locator Notes

- Main iframe: `iframe[title="<project title>"]` or the only editor iframe in the document view.
- Toolbar buttons by title: `Undo`, `Redo`, `Bold`, `Italic`, `Underline`, `Strikethrough`, `Align left`, `Align center`, `Align right`, `Justify`, `Numbered list`, `Bulleted list`, `Checklist`, `Indent`, `Outdent`, `Color`, `Fill color`, `Copy format`, `Apply copied format`, `Image`, `Remove image`, `Create link`, `Remove link`, `Insert table`, `Horizontal rule`, `Clear formatting`, `Style`, `More`, `Collapse toolbar`, `Expand toolbar`.
- Toolbar selects by title: `Block style`, `Font family`.
- Operation panel inputs by aria-label: `Link URL`, `Text to insert`, `HTML to insert`, `Replacement content`, `Text to append`, `Content to insert at position`, `Insert position`, `Wrapper tag`, `Text color`, `Text color value`, `Fill color`, `Fill color value`, `Table rows`, `Table columns`, `Width`, `Height`, `Line height`, `Letter spacing`, `Vertical align`, `Border width`, `Border style`, `Border color`, `Border color value`, `Border radius`, `Padding`, `Margin top`, `Margin bottom`, `Image URL`, `Image alt text`, `Image width`, `Image height`, `Element id`, `Element class`, `Element title`, `Custom attributes`.
- More menu items by text: `Insert text`, `Insert HTML`, `Replace selection`, `Image`, `Color`, `Style`, `Insert table`, `Append text`, `Append HTML`, `Insert at position`, `Wrap selection`, `Set attributes`, `Duplicate element`, `Delete element`, `Cursor to start`, `Cursor to end`, plus table actions when a table cell is active.

## Setup And Loading

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-001 | Setup | Create a blank HTML document | From home, keep output type as HTML, create a blank document, wait for editor. | HTML editor opens; iframe is visible; iframe body is editable; header shows saved/word/element summary. |
| HTML-002 | Setup | Create HTML document from prompt | Enter a prompt, create document as HTML, wait for editor. | Project title derives from prompt or attachment; HTML runtime opens with editable iframe content. |
| HTML-003 | Setup | Create HTML document from template | Select an HTML template card from home and wait for editor. | Template HTML renders in the iframe; toolbar is available; project appears in history. |
| HTML-004 | Setup | Open existing HTML project by route | Seed an HTML project through API, navigate directly to `/doc/<id>`. | Correct project loads, title matches project, iframe body contains seeded HTML. |
| HTML-005 | Setup | Open existing HTML project from History | Create a project, go Home, open it from History. | Same project opens; iframe content matches the saved project content. |
| HTML-006 | Setup | Reload template button | Open a document, click `Reload template`. | Fixture/template content reloads without breaking iframe editing; loading state clears. |
| HTML-007 | Setup | Reset iframe from RuntimeState | Make an unsaved iframe-only DOM mutation if possible, click `Reset iframe from RuntimeState`. | Iframe DOM returns to current runtime snapshot; toolbar state is reset safely. |
| HTML-008 | Setup | HTML route handles missing project | Navigate to a non-existing project ID. | UI shows a recoverable error and does not crash the app shell. |

## Iframe Editing And Keyboard

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-009 | Keyboard | Iframe body is contenteditable | Open a blank or seeded HTML document, inspect iframe body. | `document.body.contentEditable` is `true`; body accepts focus and caret placement. |
| HTML-010 | Keyboard | Type plain text in body | Click an empty paragraph or body, type `Hello HTML world`. | Text appears in iframe DOM; editor stats update; autosave starts then returns to saved. |
| HTML-011 | Keyboard | Insert paragraph break | Type first line, press Enter, type second line. | Two editable block/paragraph lines are visible; saved HTML preserves both lines. |
| HTML-012 | Keyboard | Replace selected text | Seed `alpha beta gamma`, select `beta`, type `delta`. | Visible text becomes `alpha delta gamma`; saved HTML no longer contains `beta`. |
| HTML-013 | Keyboard | Backspace and Delete editing | Seed `abcdef`, place caret in middle, use Backspace and Delete. | Expected adjacent characters are removed; iframe remains editable after each key. |
| HTML-014 | Keyboard | Select text with keyboard | Focus text, use keyboard selection to select a word. | Runtime active selection contains selected text; toolbar actions target the selected range. |
| HTML-015 | Keyboard | Native copy/paste plain text | Select text, copy, place caret elsewhere, paste. | Pasted text appears at caret; HTML serialization remains valid. |
| HTML-016 | Keyboard | Paste rich HTML into iframe | Put simple HTML on clipboard or use browser paste helper, paste into body. | Supported HTML is inserted; scripts/unsafe attributes are not persisted. |
| HTML-017 | Keyboard | Typing after collapsed style command | Place caret, apply a typing style such as text color, type text. | Newly typed text receives the chosen style marker; abandoned markers are cleaned up if unused. |
| HTML-018 | Keyboard | Editor stats after direct edits | Type, delete, and add elements. | Header word and element counts change consistently with iframe DOM. |
| HTML-019 | Keyboard | Autosave after direct input | Edit iframe text and wait past autosave delay. | Project API content contains the direct edit; header returns to saved. |
| HTML-020 | Keyboard | Direct edit and reopen | Edit iframe text, wait for saved, go Home, reopen. | Reopened iframe contains the edited text and equivalent HTML structure. |

## Selection And Toolbar State

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-021 | Selection | Text selection updates active context | Select text inside iframe. | Left AI panel active selection text and runtime selection reflect selected text. |
| HTML-022 | Selection | Collapsed caret records write selection | Click inside a paragraph without selecting text. | Runtime selection type is write; operations that support collapsed insertion can target that location. |
| HTML-023 | Selection | Element selection updates toolbar | Select or click an image/table/link element. | Relevant toolbar state becomes active, such as Image, Link, or table controls. |
| HTML-024 | Selection | Toolbar click preserves selected range | Select text, click `Bold` or another toolbar button. | Toolbar action applies to selected text rather than losing selection to the button. |
| HTML-025 | Selection | Operation panel inputs do not overwrite editor selection | Select text, open an operation panel, type into panel input, apply operation. | Operation still targets the original iframe selection where required. |
| HTML-026 | Selection | Selection survives toolbar horizontal scroll | Select text, scroll toolbar horizontally, click a later toolbar control. | The selected iframe range remains the operation target. |
| HTML-027 | Selection | Cursor to start from More menu | Click a content element, choose More -> `Cursor to start`. | Caret moves to start of that element; subsequent typing inserts at start. |
| HTML-028 | Selection | Cursor to end from More menu | Click a content element, choose More -> `Cursor to end`. | Caret moves to end of that element; subsequent typing inserts at end. |

## History

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-029 | History | Undo direct typing | Type text, click `Undo`. | Text returns to pre-typing state; Redo becomes enabled. |
| HTML-030 | History | Redo direct typing | After HTML-029, click `Redo`. | Typed text is restored; saved content eventually matches restored text. |
| HTML-031 | History | Undo toolbar operation | Apply a toolbar format or block transform, click `Undo`. | DOM returns to pre-transform state; toolbar state updates. |
| HTML-032 | History | Redo toolbar operation | After HTML-031, click `Redo`. | Transform is restored; serialized HTML reflects it. |
| HTML-033 | History | Rapid typing merges history | Type several characters continuously within the merge window. | A single undo removes the merged typing batch rather than one character at a time. |
| HTML-034 | History | Color changes merge history | Change text/fill color repeatedly within the merge window. | Undo returns to the pre-color state in one step. |
| HTML-035 | History | New edit after undo truncates redo | Type text, undo, make a different edit. | Redo is disabled; history follows the new edit branch. |
| HTML-036 | History | Undo restores selection target | Apply a transform to a selected element, undo. | DOM and selection/toolbar target restore without throwing or selecting outside iframe. |

## Block And Inline Formatting

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-037 | Block | Convert paragraph to Heading 1 | Place caret in a paragraph, choose `Heading 1` from `Block style`. | Block becomes `h1`; visible style and serialized HTML reflect heading. |
| HTML-038 | Block | Convert headings H2/H3/H4 | Repeat block conversion for `Heading 2`, `Heading 3`, `Heading 4`. | Correct heading tag is used each time. |
| HTML-039 | Block | Convert block to normal text | Convert a heading back to `Normal Text`. | Block becomes a normal paragraph-compatible block; heading tag is removed. |
| HTML-040 | Block | Convert paragraph to quote | Choose `Quote` from `Block style`. | Block becomes `blockquote` or equivalent quote block. |
| HTML-041 | Inline | Bold selected text | Select text, click `Bold`. | Selected text is wrapped or styled as bold; toolbar Bold becomes active in selection. |
| HTML-042 | Inline | Italic selected text | Select text, click `Italic`. | Selected text is italic; serialization preserves italic styling. |
| HTML-043 | Inline | Underline selected text | Select text, click `Underline`. | Selected text is underlined; toolbar reflects active underline. |
| HTML-044 | Inline | Strikethrough selected text | Select text, click `Strikethrough`. | Selected text is struck through; serialization preserves it. |
| HTML-045 | Inline | Toggle inline format off | Apply Bold to selected text, select the formatted text, click `Bold` again. | Bold formatting is removed without dropping text. |
| HTML-046 | Inline | Mixed inline formatting nesting | Apply bold and italic to overlapping or same selected text. | DOM remains valid; both visual styles apply to intended text only. |
| HTML-047 | Inline | Clear formatting from selected text | Apply several inline styles, click `Clear formatting`. | Plain text remains; inline styling tags/styles are removed from selected range. |
| HTML-048 | Inline | Clear formatting from whole element | Click a formatted block with collapsed caret, click `Clear formatting`. | Element formatting is removed while textual content remains. |

## Typography, Color, And Layout

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-049 | Typography | Change font family | Select text or block, choose `Georgia`, `Times`, `Courier`, or `Inter` from `Font family`. | Target content uses selected font family; toolbar reads it back. |
| HTML-050 | Typography | Change font size | Select text or block, set font size control to a specific value. | Target content style contains the requested font size. |
| HTML-051 | Typography | Apply text color from swatch | Select text, set text color via panel or swatch. | Target text color changes; saved HTML contains a valid color style. |
| HTML-052 | Typography | Apply fill/background color | Select text, block, or table cell, set fill color. | Background color applies to intended target only. |
| HTML-053 | Typography | Color panel text and fill together | Open `Color`, set `Text color value` and `Fill color value`, apply. | Both foreground and background styles are applied. |
| HTML-054 | Typography | Invalid color is ignored safely | Enter an invalid color value in color panel and apply. | Operation does not corrupt DOM or crash; previous valid color remains or no-op occurs. |
| HTML-055 | Layout | Align left/center/right/justify | Place caret in a block and click each alignment control. | Block `text-align` updates to the selected alignment each time. |
| HTML-056 | Layout | Line spacing menu | Click `Line spacing`, choose `1.5` or `2`. | Target block line-height updates and persists. |
| HTML-057 | Layout | Letter spacing menu | Click `Letter spacing`, choose `Loose` or `Wide`. | Target text/block letter-spacing updates and persists. |
| HTML-058 | Layout | Paragraph spacing menu | Click paragraph spacing menu, choose a spacing option. | Target block margin-top/margin-bottom update as expected. |
| HTML-059 | Layout | Copy and apply format | Format one paragraph, click `Copy format`, select another paragraph, click `Apply copied format`. | Second paragraph receives copied presentation style; content text remains unchanged. |
| HTML-060 | Layout | Apply format disabled before copy | Open fresh document and inspect `Apply copied format`. | Button is disabled until a format has been copied. |

## Lists And Indentation

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-061 | Lists | Convert paragraphs to bulleted list | Select multiple paragraphs, click `Bulleted list`. | Paragraphs become list items in `ul`; visible bullets appear. |
| HTML-062 | Lists | Convert paragraphs to numbered list | Select multiple paragraphs, click `Numbered list`. | Paragraphs become ordered list items in `ol`. |
| HTML-063 | Lists | Toggle list type | Convert a list between bulleted and numbered. | List tag changes while item text is preserved. |
| HTML-064 | Lists | Toggle list off | Select list items and click the active list control again. | Items unwrap to paragraphs/blocks without losing text. |
| HTML-065 | Lists | Create checklist | Select paragraphs or list items, click `Checklist`. | Items become checklist list items with checkbox inputs and `data-ai-checklist="true"`. |
| HTML-066 | Lists | Toggle checklist off | Select checklist items and click `Checklist` again. | Checklist unwraps or converts back to ordinary blocks/lists. |
| HTML-067 | Indent | Indent and outdent block | Place caret in paragraph, click `Indent`, then `Outdent`. | Block indentation increases then returns toward original value. |
| HTML-068 | Indent | Indent and outdent list item | Place caret in a list item, click `Indent`, then `Outdent`. | Nested list is created or item moves indentation level; outdent reverses it. |
| HTML-069 | Indent | Indent selected table cells | Select table cells, click `Indent`. | Cell content or cell padding/indent changes consistently across selected cells. |

## Link And Image

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-070 | Link | Create link from selected text | Select text, click `Create link`, enter `https://example.com`, apply. | Selected text becomes an anchor with normalized href; toolbar Link becomes active. |
| HTML-071 | Link | Create link at collapsed cursor | Place caret, click `Create link`, enter a URL, apply. | A new text link is inserted at caret. |
| HTML-072 | Link | Edit existing link href | Click an existing link, click `Create link`, change URL, apply. | Existing anchor href updates; link text remains. |
| HTML-073 | Link | Remove link | Click inside an existing link, click `Remove link`. | Anchor is replaced with plain text; text remains visible. |
| HTML-074 | Link | Link URL normalization | Create links using `example.com` and an already-normalized URL. | Saved hrefs are normalized and safe; invalid/empty URLs are not applied. |
| HTML-075 | Image | Insert image from panel | Click insertion point, open `Image`, set URL, alt text, width, height, apply. | Image appears with expected `src`, `alt`, width, and height attributes/styles. |
| HTML-076 | Image | Edit existing image attributes | Select image, open `Image`, change alt and dimensions, apply. | Same image updates attributes without duplicating image. |
| HTML-077 | Image | Remove image | Select image, click `Remove image`. | Image is removed; surrounding content remains. |
| HTML-078 | Image | Image toolbar state | Click an image. | Image toolbar button is active and Remove image button is visible. |
| HTML-079 | Image | Unsafe image URL is rejected | Try to insert an image with an unsafe `javascript:` URL. | Image is not inserted or unsafe URL is sanitized; app remains stable. |

## Operation Panel

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-080 | Operation | Insert text | More -> `Insert text`, enter plain text, apply. | Text inserts at current caret or target; saved HTML contains escaped text, not unexpected markup. |
| HTML-081 | Operation | Insert HTML | More -> `Insert HTML`, enter `<strong>Inserted</strong>`, apply. | HTML fragment is inserted as DOM; saved HTML contains `<strong>Inserted</strong>`. |
| HTML-082 | Operation | Insert HTML sanitizes script | Insert HTML containing `<script>` or event handlers. | Unsafe nodes/attributes are removed before insertion and persistence. |
| HTML-083 | Operation | Replace selection with text | Select text, More -> `Replace selection`, leave HTML unchecked, apply text. | Selected range is replaced with plain text only. |
| HTML-084 | Operation | Replace selection with HTML | Select text, More -> `Replace selection`, check HTML, apply an HTML fragment. | Selected range is replaced with sanitized DOM fragment. |
| HTML-085 | Operation | Replace selection with empty content | Select text, open replace panel, submit empty content. | Selection is deleted; DOM remains normalized. |
| HTML-086 | Operation | Append text to element | Select or click a content element, More -> `Append text`, apply. | Text is appended inside the target element. |
| HTML-087 | Operation | Append HTML to element | Select or click a content element, More -> `Append HTML`, apply an HTML fragment. | Sanitized fragment is appended inside target element. |
| HTML-088 | Operation | Insert at position before element | Select an element, More -> `Insert at position`, choose `Before element`, apply content. | New content appears before selected element. |
| HTML-089 | Operation | Insert at position at start/end/after | Repeat insert-at-position for `At start`, `At end`, `After element`. | Content appears in the requested relative position. |
| HTML-090 | Operation | Wrap selected text | Select text, More -> `Wrap selection`, choose `mark` or `code`, apply. | Selected text is wrapped with chosen safe tag. |
| HTML-091 | Operation | Wrap selection with attributes | Select text, choose wrapper tag, set id/class/title/custom data attr, apply. | Wrapper contains safe attributes and selected text. |
| HTML-092 | Operation | Set element attributes | Select an element, More -> `Set attributes`, set id/class/title/custom data attr. | Element attributes update; unsafe attributes are ignored or sanitized. |
| HTML-093 | Operation | Duplicate element | Select a mutable element, More -> `Duplicate element`. | A duplicate element appears next to original with equivalent content. |
| HTML-094 | Operation | Delete element | Select a mutable element, More -> `Delete element`. | Selected element is removed; parent document remains editable. |
| HTML-095 | Operation | Horizontal rule insertion | Place caret between paragraphs, click `Horizontal rule`. | `<hr>` is inserted at caret and persists after autosave/reopen. |

## Style Panel

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-096 | Style | Set width and height | Select element, open `Style`, set Width and Height, apply. | Target style has expected width/height values. |
| HTML-097 | Style | Set line height and letter spacing | Select element, open `Style`, set Line height and Letter spacing, apply. | Styles apply to selected target and persist. |
| HTML-098 | Style | Set vertical align | Select table cell or inline target, open `Style`, set Vertical align. | `vertical-align` style is applied when target supports it. |
| HTML-099 | Style | Set border styles | Select element, open `Style`, set border width/style/color, apply. | Target gets expected border styles. |
| HTML-100 | Style | Set border radius, padding, margins | Select element, open `Style`, set radius, padding, margin top/bottom, apply. | Target gets expected box styles and layout remains editable. |
| HTML-101 | Style | Clear style fields | Apply styles, reopen Style, clear one or more fields, apply. | Cleared fields are removed from inline style. |
| HTML-102 | Style | Invalid style values are ignored safely | Enter invalid width/color/border values where possible. | Operation no-ops or sanitizes value without corrupting DOM. |

## Tables

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-103 | Table | Insert default table | Click `Insert table`, keep default 3 rows and 3 columns, apply. | A 3x3 editable table appears with `data-ai-document-table="true"` and bordered cells. |
| HTML-104 | Table | Insert custom table dimensions | Insert a 2x4 table using `Table rows` and `Table columns`. | Table has 2 rows and 4 columns. |
| HTML-105 | Table | Clamp invalid table dimensions | Try rows/columns of 0, negative, or very large values. | Inserted table dimensions are clamped to supported range, 1 to 12. |
| HTML-106 | Table | Type into table cell | Click a cell and type text. | Text appears inside that cell only and autosaves. |
| HTML-107 | Table | Select multiple cells by drag | Drag from one table cell to another. | Selected cells get `data-ai-table-cell-selected`; table toolbar actions become available. |
| HTML-108 | Table | Add row before and after | Click a cell, use `Add row before` and `Add row after`. | Rows are inserted in correct positions and preserve compatible cell styling. |
| HTML-109 | Table | Add column before and after | Click a cell, use `Add column before` and `Add column after`. | Columns are inserted in correct positions across all rows. |
| HTML-110 | Table | Delete row | Click a cell, use `Delete row`. | Current row is removed; remaining table structure stays valid. |
| HTML-111 | Table | Delete column | Click a cell, use `Delete column`. | Current column is removed from all rows; table stays valid. |
| HTML-112 | Table | Delete table | Click table cell, use `Delete table`. | Entire table is removed; surrounding content remains. |
| HTML-113 | Table | Copy row | Click a row cell, use `Copy row`. | A duplicate row is inserted with matching content and styles. |
| HTML-114 | Table | Copy column | Click a column cell, use `Copy column`. | A duplicate column is inserted with matching content and styles. |
| HTML-115 | Table | Move row up and down | Click a row that can move, use `Move row up`, then `Move row down`. | Row order changes then can be restored. |
| HTML-116 | Table | Move column left and right | Click a column that can move, use `Move column left`, then `Move column right`. | Column order changes then can be restored. |
| HTML-117 | Table | Toggle header row | Click first row, use `Set row header`, then `Remove row header`. | Row cells convert between `th` and `td`; toolbar title reflects current state. |
| HTML-118 | Table | Toggle header column | Click first column, use `Set column header`, then `Remove column header`. | Column cells convert between `th` and `td`; toolbar title reflects current state. |
| HTML-119 | Table | Merge cell right | Click a cell with a right neighbor, use `Merge cell right`. | Cell colspan increases; neighbor content merges into target cell. |
| HTML-120 | Table | Merge cell down | Click a cell with a lower neighbor, use `Merge cell down`. | Cell rowspan increases; lower cell content merges into target cell. |
| HTML-121 | Table | Split merged cell | Merge a cell, then use `Split cell`. | Table structure expands back; merged cell span is reduced or removed. |
| HTML-122 | Table | Distribute rows | Select or click table rows, use `Distribute rows`. | Row heights are distributed consistently across applicable rows. |
| HTML-123 | Table | Distribute columns | Select or click table columns, use `Distribute columns`. | Column widths are distributed consistently across applicable columns. |
| HTML-124 | Table | Apply and clear row height | Set Style Height, click `Apply row height`, then `Clear row height`. | Row height applies to target rows and is later removed. |
| HTML-125 | Table | Apply and clear column width | Set Style Width, click `Apply column width`, then `Clear column width`. | Column width applies to target columns and is later removed. |
| HTML-126 | Table | Cell vertical alignment | Click a cell, use `Vertical align top`, `middle`, and `bottom`. | Target cell vertical-align changes to selected value. |
| HTML-127 | Table | Cell border presets | Click/select cells and apply all, outer, inner, top, right, bottom, left, and clear border commands. | Expected border sides update without affecting unrelated cells. |
| HTML-128 | Table | Format selected cells | Select multiple cells, apply bold, color, fill, alignment, list, and checklist. | Formatting applies to all selected cells only. |
| HTML-129 | Table | Clear formatting in selected cells | Select formatted cells, click `Clear formatting`. | Cell text remains; inline/presentation formatting is cleared. |
| HTML-130 | Table | Table edit availability at edges | Click first/last rows and columns. | Move/delete/merge controls are enabled or disabled according to valid table actions. |
| HTML-131 | Table | Persist complex table edits | Perform several table edits, wait for saved, reopen project. | Reopened iframe preserves table structure, spans, headers, styles, and cell text. |

## Persistence, Serialization, And Navigation

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-132 | Persistence | Autosave after toolbar transform | Apply a toolbar transform, wait for saved, fetch project API. | Saved project content includes the transformed HTML. |
| HTML-133 | Persistence | Autosave after operation panel transform | Use operation panel to insert/modify content, wait for saved. | Saved project content includes the operation result. |
| HTML-134 | Persistence | Reopen after multiple edits | Make direct, toolbar, operation, and table edits; wait saved; go Home; reopen. | All edits render correctly after reopening. |
| HTML-135 | Persistence | Browser reload on document route | Open edited project, reload route. | Document reloads from saved content without losing persisted edits. |
| HTML-136 | Serialization | Preserve doctype/html/head/body | Seed HTML with doctype, html attributes, head metadata/title/style, and body attributes. | Saved HTML preserves intended document shell and body content. |
| HTML-137 | Serialization | Strip runtime-only attributes | Save a document after editing. | Serialized HTML does not persist runtime-only attributes such as `data-runtime-*`. |
| HTML-138 | Serialization | Preserve safe styles | Apply inline styles through toolbar/panel and save. | Safe style attributes persist with expected values. |
| HTML-139 | Serialization | Preserve safe custom attributes | Set data/aria/title/class/id attributes and save/reopen. | Safe attributes remain on the target element. |
| HTML-140 | Serialization | Reject unsafe attributes | Attempt to insert or set unsafe attributes such as event handlers. | Unsafe attributes are absent in saved content. |
| HTML-141 | Navigation | Home exits editor | Click Home from the left conversation panel. | App returns to home view and project appears in History. |
| HTML-142 | Navigation | Dirty state resolves before leaving | Edit document, wait for saved, navigate Home. | No unsaved changes indicator remains; history item opens saved version. |
| HTML-143 | Navigation | Open Markdown after HTML | Open HTML project, go Home, open Markdown project. | Runtime switches cleanly; no stale HTML toolbar/table state leaks into Markdown editor. |
| HTML-144 | Navigation | Open DOCX after HTML | Open HTML project, go Home, open DOCX project. | Runtime switches cleanly; no stale HTML iframe state leaks into DOCX preview. |

## AI Context And Conversation Panel

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-145 | AI Context | Active selection text is shown | Select text in iframe. | Conversation panel displays the selected text context. |
| HTML-146 | AI Context | Send prompt with no selection | Open HTML project, send a prompt without selected text using a test/stub provider. | Request includes current HTML and write-mode context; UI shows accepted/running/completed item. |
| HTML-147 | AI Context | Send prompt with text selection | Select text, send prompt using a test/stub provider. | Request includes selected text, selected HTML, selection type, and selection path. |
| HTML-148 | AI Context | Send prompt with table cell selection | Select table cells, send prompt using a test/stub provider. | Request context identifies current HTML and relevant selection/target path. |
| HTML-149 | AI Context | AI update reloads HTML runtime | Simulate or run an AI project update with `updatedBy: ai`. | HTML runtime reloads new content, history list updates, stale selection is cleared. |
| HTML-150 | AI Context | AI error is visible and recoverable | Force provider/API error when sending prompt. | Error appears in conversation panel; editor remains usable. |

## Toolbar And Responsive Behavior

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HTML-151 | Toolbar | Collapse toolbar | Click `Collapse toolbar`. | Secondary toolbar row and operation panels collapse; expand control appears. |
| HTML-152 | Toolbar | Expand toolbar | Click `Expand toolbar`. | Full toolbar returns with controls usable. |
| HTML-153 | Toolbar | More menu opens and closes | Click `More`, inspect menu, press Escape or click outside. | Menu opens with expected enabled actions and closes without losing editor state. |
| HTML-154 | Toolbar | Operation panel Cancel | Open an operation panel, enter draft data, click Cancel. | Panel closes; iframe content is unchanged. |
| HTML-155 | Toolbar | Disabled controls do not mutate content | With no valid target, click disabled actions where possible. | No DOM mutation occurs and no console/runtime crash happens. |
| HTML-156 | Toolbar | Toolbar works after iframe scroll | Scroll editor page, select content, use toolbar. | Sticky toolbar remains usable and actions target iframe selection. |
| HTML-157 | Toolbar | Narrow viewport toolbar usability | Set a narrow viewport, scroll toolbar horizontally, run representative actions. | Controls remain reachable; no overlapping text or unusable operation panel. |

## Suggested Automation Order

1. HTML-001, HTML-004, HTML-009, HTML-010, HTML-019, HTML-020: prove creation, route loading, iframe editability, autosave, and reopen.
2. HTML-021 to HTML-028: stabilize iframe selection and toolbar selection preservation.
3. HTML-037 to HTML-060: cover core block, inline, typography, layout, color, and format-copy behavior.
4. HTML-061 to HTML-069: cover lists and indentation.
5. HTML-070 to HTML-079: cover links and images.
6. HTML-080 to HTML-102: cover operation panels, sanitization, and style panel behavior.
7. HTML-103 to HTML-131: cover table creation, structural edits, styling, spans, and persistence.
8. HTML-132 to HTML-144: cover serialization, navigation, and cross-runtime switching.
9. HTML-145 to HTML-150: cover AI context only when a deterministic test/stub provider is available.
10. HTML-151 to HTML-157: cover toolbar responsive behavior and disabled/cancel states.

## Open Review Questions

- Should HTML browser tests create projects only through API, or should a smaller smoke suite also cover home composer/template creation?
- Should the HTML toolbar add stable `data-testid` values before broad automation, or is title/aria-label based targeting acceptable?
- Should AI context tests use a dedicated stub ACP provider to avoid relying on Codex/Claude availability?
- Should table cases be split into a separate `HTML_TABLE_BROWSER_TEST_CASES.md` later if the suite becomes too large?
- Should sanitization assertions compare saved HTML exactly, or assert only the absence of unsafe nodes/attributes plus presence of expected safe content?
