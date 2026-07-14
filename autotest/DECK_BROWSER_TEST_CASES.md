# Deck Editor Browser Test Cases

This document tracks proposed browser-use automation cases for the current Deck editing area in the slide app.

Current scope: deck project creation/opening, template materialization, iframe-hosted slide rendering, filmstrip navigation, object selection, text editing, toolbar formatting, object geometry operations, image replacement, per-slide autosave/reopen behavior, serialization boundaries, export flow, navigation, responsive behavior, and AI edit context.

This file defines cases only. Temporary execution notes, screenshots, traces, and pass/fail conclusions should live outside this file.

## Assumptions

- Tests run against the local slide app server.
- Start app with `pnpm dev:slide`.
- Open web at the slide web URL, usually `http://localhost:5175` for Vite or the configured slide server URL when testing packaged/static serving.
- A fresh deck project can be created from Home by selecting `Deck`, entering a prompt, choosing a template, or creating a blank card.
- For editor-area tests, API-created or template-seeded deck projects are preferred so setup does not obscure editing behavior.
- The route for an open slide project is `/slide/<id>`.
- Deck artifacts use type `deck`, file ref `deck.slides`, and MIME type `application/vnd.ai-slide.deck`.
- A deck is represented by a manifest plus per-slide HTML files. The visible active slide is rendered inside an iframe whose title is the slide title.
- Slide iframe HTML uses `[data-object="true"]` elements for selectable objects and `data-object-type` values such as `textbox`, `image`, or `shape`.
- The React overlay outside the iframe handles object selection, resize, rotation, duplicate, delete, and geometry controls.
- Text editing requires entering a selected textbox's text mode by double-clicking, or by enabling `Single-click text edit` and clicking a textbox.
- Test assertions should inspect visible slide iframe DOM, overlay controls, filmstrip state, and saved slide HTML from `/api/projects/:projectId/deck/slides/:slideId` when persistence matters.
- Execution notes, screenshots, traces, and failure notes are temporary artifacts and should not be written into this file.

## Current Toolbar Surface

- Always-visible buttons by title: `Undo`, `Redo`, `Bold`, `Italic`, `Underline`, `Strikethrough`, `Align left`, `Align center`, `Align right`, `Single-click text edit`, `Text color`, `Fill color`, `Replace image`.
- Always-visible selects by title: `Block style`, `Font family`.
- Always-visible numeric input by title: `Font size`.
- `Block style` options are visible as `Normal Text`, `Heading`, `Shape`, and `Image`, but the current control is state display only and does not mutate block type.
- `Font family` options include `PingFang SC`, `Inter`, `IBM Plex Sans`, `IBM Plex Mono`, `JetBrains Mono`, `STIX Two Text`, `Arial`, `Georgia`, and `Times`.
- Object overlay buttons by title or aria-label: `Duplicate object`, `Delete object`, `Move panel`, `Rotate object`.
- Resize handles by aria-label: `Resize top-left`, `Resize top`, `Resize top-right`, `Resize right`, `Resize bottom-right`, `Resize bottom`, `Resize bottom-left`, `Resize left`.
- Geometry panel opens from `Move panel` and exposes alignment actions: `Align left`, `Align center`, `Align right`, `Align top`, `Align middle`, `Align bottom`, plus number fields labelled `W`, `H`, `X`, and `Y`, and a lock button titled `Lock proportion` or `Unlock proportion`.
- Filmstrip container has aria-label `Slides`; selected thumbnail exposes `aria-selected="true"`.
- Header export menu exposes `PPTX` for deck artifacts; `HTML deck` is currently disabled.

## Not Currently Exposed By The Deck UI

The current deck runtime has editing primitives for existing slide objects, but browser toolbar automation should not expect UI for the following until the product adds it.

- No stable `data-testid` attributes are currently mounted for deck toolbar, overlay, or filmstrip controls.
- No visible toolbar entry currently inserts a new slide, deletes a slide, duplicates a slide, or reorders slides.
- No visible toolbar entry currently inserts a new textbox, shape, image, table, chart, or arbitrary HTML object.
- No remote-URL image insertion panel exists. Image replacement currently uses a file input and writes uploaded project assets.
- No visible edit controls currently change object z-order, group/ungroup objects, lock objects, crop images, edit alt text, or set opacity/border styles.
- No visible deck toolbar exposes speaker notes, comments, transitions, animations, theme switching, or slide size changes.
- `Block style` is currently read-only from a behavior perspective, so automation should not assert block conversion from this control.

## Setup And Loading

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-001 | Setup | Create a blank deck project | From Home, select `Deck`, create a blank project from the blank/template area, wait for editor. | Deck editor opens at `/slide/<id>`; header title is visible; active slide iframe is visible; filmstrip has at least one selected thumbnail. |
| DECK-002 | Setup | Create deck from prompt | Select `Deck`, enter a prompt, click `Create`, wait for editor and any run activity. | New deck project opens; initial AI run is accepted/running/completed or shows a recoverable error; editor remains usable. |
| DECK-003 | Setup | Create deck from template | Open a template preview and choose it. | Template deck opens; manifest slide count matches preview/template metadata; slide iframes render template content. |
| DECK-004 | Setup | Open existing deck by route | Seed or create a deck project, navigate directly to `/slide/<id>`. | Correct project loads; active artifact type is deck; active slide iframe title and content match the manifest. |
| DECK-005 | Setup | Open existing deck from History | Create a deck, return Home, open the project from History when the history UI exposes it. | Same project opens and rendered slide content matches saved project content. |
| DECK-006 | Setup | Current deck toolbar controls mount | Open a deck and inspect the toolbar. | Undo/redo, block/font/font-size, inline format, alignment, direct text edit, color, and replace-image controls are present with current titles. |
| DECK-007 | Setup | Deck route handles missing project | Navigate to a non-existing slide project ID. | UI shows a recoverable `Presentation not found` style error and does not crash the app shell. |
| DECK-008 | Setup | Template assets materialize through server | Create a deck from a template with images, inspect slide iframe URLs. | Images and other slide assets load through local project asset routes, not directly from `templates` imports in web code. |

## Slide Rendering And Navigation

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-009 | Rendering | Active slide iframe loads | Open a deck with at least one slide. | The active slide iframe is visible, nonblank, scaled to fit the stage, and uses the manifest canvas aspect ratio. |
| DECK-010 | Rendering | Slide iframe document is prepared for editing | Inspect the active slide iframe after load. | Objects have runtime `data-ai-slide-object-id` values and selectable objects expose `[data-object="true"]`; editor-only style is injected. |
| DECK-011 | Rendering | Runtime asset references are rewritten | Open a slide containing relative image assets. | Visible iframe image URLs are rewritten to `/local-assets/projects/.../deck.slides/assets/...` while the slide renders correctly. |
| DECK-012 | Navigation | Filmstrip selects another slide | Open a multi-slide template, click another filmstrip thumbnail. | Active slide changes; thumbnail `aria-selected` moves; stage iframe title/content reflect the selected slide. |
| DECK-013 | Navigation | Arrow keys navigate slides while idle | Focus the deck stage with no active object and press ArrowDown/ArrowRight. | Active slide advances according to available slides and wraps or stops according to current navigation behavior. |
| DECK-014 | Navigation | Arrow keys do not navigate during text editing | Enter text edit mode in a textbox and press arrow keys. | Caret moves within text; active slide does not change. |
| DECK-015 | Navigation | Arrow keys do not navigate with object selected | Select an object and press arrow keys. | Slide selection remains on the current slide; no unexpected page navigation occurs. |
| DECK-016 | Navigation | Filmstrip auto-scroll keeps active thumbnail visible | Open a template with many slides, select a far thumbnail. | Filmstrip scrolls enough to keep the active thumbnail reachable and highlighted. |

## Object Selection And Overlay

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-017 | Selection | Click textbox object selects it | Click a visible textbox object on the slide. | A violet selection rectangle appears; object toolbar appears; toolbar block state is normal or heading according to selected text. |
| DECK-018 | Selection | Click image object selects it | Click a visible image object. | Selection rectangle and object toolbar appear; `Replace image` is enabled; text-only controls remain disabled. |
| DECK-019 | Selection | Click shape object selects it | Click a visible shape object. | Selection rectangle appears; fill color is enabled; text-only controls remain disabled unless the object contains editable text. |
| DECK-020 | Selection | Click empty slide area clears selection | Select an object, then click an empty slide area. | Overlay selection and object toolbar disappear; toolbar returns to default or inactive state. |
| DECK-021 | Selection | Selection survives toolbar click | Select an object, click `Fill color` or another enabled toolbar control. | Action targets the selected object; selection is not lost before the operation is applied. |
| DECK-022 | Selection | Object toolbar actions are visible near selected object | Select objects near slide edges. | Object toolbar remains reachable and does not render outside the usable viewport in a blocking way. |
| DECK-023 | Selection | Overlay matches scaled object bounds | Select a known object and compare overlay box to iframe object bounds. | Overlay bounds align with the object after applying stage scale. |
| DECK-024 | Selection | Switching slide clears object selection | Select an object, then switch slides. | Previous slide object selection clears; active slide changes without stale overlay controls. |

## Text Editing And Keyboard

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-025 | Text | Double-click textbox enters text mode | Double-click a textbox object. | A text target inside the object becomes `contenteditable="true"`; caret or selected text appears; selection mode becomes text. |
| DECK-026 | Text | Single-click text edit mode | Click `Single-click text edit`, then click a textbox. | Text edit mode starts from a single click and the button shows active state. |
| DECK-027 | Text | Type inside selected textbox | Enter text edit mode and type `Deck edit smoke`. | Text appears in the textbox only; header transitions to saving and then saved. |
| DECK-028 | Text | Insert line break in textbox | Type text, press Enter, type a second line where supported. | Textbox shows a second line or supported block break; saved slide HTML preserves the visible text structure. |
| DECK-029 | Text | Replace selected text inside textbox | Select a word inside a textbox and type a replacement. | Only the selected text changes; surrounding textbox content remains. |
| DECK-030 | Text | Backspace and Delete editing | Place caret in textbox text and use Backspace/Delete. | Expected adjacent characters are removed; editor remains in text mode and autosaves. |
| DECK-031 | Text | Copy and paste plain text | Select text inside a textbox, copy it, place caret elsewhere in the same textbox, paste. | Pasted text appears at the caret and saved slide HTML remains valid. |
| DECK-032 | Text | Text selection updates agent panel context | Select text inside a textbox. | Left conversation panel shows selected text context; deck runtime selection type is `text` or compatible. |
| DECK-033 | Text | Collapsed caret records write context | Enter text mode and click without selecting text. | Runtime selection is write-like with a deck text path; sending a prompt can target the caret/context. |
| DECK-034 | Text | Exit text mode by selecting another object | Enter text mode, then click another object. | Previous text target loses `contenteditable`; new object selection is active; no stale caret remains. |

## History

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-035 | History | Undo direct text edit | Type text in a textbox and click `Undo`. | Text returns toward the pre-typing state; `Redo` becomes enabled when history supports it. |
| DECK-036 | History | Redo direct text edit | After DECK-035, click `Redo`. | Text edit is restored and eventually saved. |
| DECK-037 | History | Undo toolbar format | Apply bold, color, or alignment, then click `Undo`. | Slide DOM returns to the pre-format state and toolbar state updates. |
| DECK-038 | History | Redo toolbar format | After DECK-037, click `Redo`. | Formatting is restored and saved. |
| DECK-039 | History | Undo object geometry move | Drag or update selected object geometry, then click `Undo`. | Object returns to previous position/size/rotation for that slide. |
| DECK-040 | History | New edit after undo truncates redo | Make an edit, undo, then make a different edit. | Redo no longer restores the abandoned branch. |
| DECK-041 | History | Per-slide history isolation | Edit slide 1, switch to slide 2 and edit, then undo on slide 2. | Undo affects slide 2 only; slide 1 remains as edited. |
| DECK-042 | History | Keyboard history shortcut | Use Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y where supported. | History applies to the active slide without browser navigation or app crash. |

## Text Formatting

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-043 | Formatting | Bold selected textbox text | Select text in a textbox and click `Bold`. | Selected text becomes bold; saved slide HTML contains equivalent inline formatting. |
| DECK-044 | Formatting | Italic selected textbox text | Select text in a textbox and click `Italic`. | Selected text becomes italic and persists. |
| DECK-045 | Formatting | Underline selected textbox text | Select text in a textbox and click `Underline`. | Selected text is underlined and persists. |
| DECK-046 | Formatting | Strikethrough selected textbox text | Select text in a textbox and click `Strikethrough`. | Selected text is struck through and persists. |
| DECK-047 | Formatting | Toggle inline format off | Apply Bold, select the formatted text, click `Bold` again. | Bold is removed without dropping text. |
| DECK-048 | Formatting | Mixed inline formatting | Apply bold and italic to overlapping or identical text ranges. | DOM remains valid; styles apply only to intended text. |
| DECK-049 | Formatting | Change font family | Select text in text mode, choose `Georgia`, `Arial`, or another font family. | Target text uses selected font family; toolbar reads it back. |
| DECK-050 | Formatting | Change font size | Select text in text mode, set `Font size` to a specific value. | Target text font size updates and persists as CSS. |
| DECK-051 | Formatting | Apply text color | Select text or a textbox target and change `Text color`. | Text color applies to intended text or textbox content only. |
| DECK-052 | Formatting | Apply fill color to object | Select textbox, shape, or image-backed object and change `Fill color`. | Object background/fill changes and persists. |
| DECK-053 | Formatting | Align textbox text | Select a textbox and click `Align left`, `Align center`, and `Align right`. | Text alignment updates for the textbox and persists. |
| DECK-054 | Formatting | Block style is display-only | Select different object types and inspect `Block style`; attempt changing the select. | Control reflects normal/heading/shape/image where possible but does not mutate content. |

## Object Geometry

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-055 | Geometry | Drag selected object | Select a movable object and drag the selection rectangle. | Object moves within canvas bounds; overlay follows; save state returns to saved. |
| DECK-056 | Geometry | Drag object snaps to guides | Drag an object near canvas center or another object edge. | Snap guides appear during drag and disappear after pointer release. |
| DECK-057 | Geometry | Resize object from corner | Drag `Resize bottom-right`. | Object width/height update; overlay follows; minimum size and canvas bounds are respected. |
| DECK-058 | Geometry | Resize object from side | Drag `Resize right` or `Resize bottom`. | Object size changes along the intended axis and persists. |
| DECK-059 | Geometry | Rotate object | Drag `Rotate object`. | Object rotation changes; overlay rotation follows; saved HTML contains transform changes. |
| DECK-060 | Geometry | Shift rotate snaps angle | Rotate while holding Shift. | Rotation snaps to supported increments, currently 15 degrees. |
| DECK-061 | Geometry | Open geometry panel | Select an object and click `Move panel`. | Geometry panel opens with alignment actions and W/H/X/Y controls. |
| DECK-062 | Geometry | Update X and Y in geometry panel | Open geometry panel and enter new X/Y values. | Object position updates to the requested coordinates and saves. |
| DECK-063 | Geometry | Update W and H in geometry panel | Open geometry panel and enter new W/H values. | Object size updates, with textbox wrapping behavior preserved. |
| DECK-064 | Geometry | Lock proportion while resizing numerically | Enable `Lock proportion`, change W or H. | Other dimension updates according to aspect ratio. |
| DECK-065 | Geometry | Align object horizontally | Use geometry panel `Align left`, `Align center`, and `Align right`. | Object moves to expected canvas alignment positions. |
| DECK-066 | Geometry | Align object vertically | Use geometry panel `Align top`, `Align middle`, and `Align bottom`. | Object moves to expected canvas alignment positions. |
| DECK-067 | Geometry | Duplicate object | Select object and click `Duplicate object`. | A copy appears offset from the original; duplicate has independent object identity; save persists it. |
| DECK-068 | Geometry | Delete object | Select object and click `Delete object`. | Object is removed from slide DOM; overlay clears; save persists deletion. |

## Images And Assets

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-069 | Image | Replace selected HTML image object | Select an image object, click `Replace image`, provide a fixture image file. | Existing image target updates to a project asset URL and saves. |
| DECK-070 | Image | Replace selected SVG image object | Select a slide object backed by an SVG `image`, replace it with a fixture image. | `href`/`xlink:href` or equivalent source updates and persists. |
| DECK-071 | Image | Replace background-image object | Select an image-like object represented by CSS background image and replace it. | Background image URL updates; sizing/position remain stable. |
| DECK-072 | Image | Non-image file is ignored or rejected | Use `Replace image` and provide a non-image file. | No image source changes; editor remains stable and save state does not falsely report success for a mutation. |
| DECK-073 | Image | Unsupported or oversized upload error | Upload a file outside the server-supported image type or size limits. | A recoverable error is surfaced; editor remains usable. |
| DECK-074 | Image | Asset references serialize back to relative paths | Replace an image, wait saved, fetch saved slide HTML. | Saved HTML uses deck-relative `../assets/...` references rather than local asset route URLs. |
| DECK-075 | Image | Reopen after image replacement | Replace image, wait for saved, reload or reopen. | Reopened slide renders the replacement image. |

## Persistence, Serialization, And Navigation

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-076 | Persistence | Autosave after text edit | Edit textbox text and wait past autosave delay. | Header returns to saved; slide API returns HTML containing the edit. |
| DECK-077 | Persistence | Autosave after object operation | Move, resize, duplicate, delete, or style an object and wait. | Slide API content reflects the object operation. |
| DECK-078 | Persistence | Reopen after multiple edits | Make text, format, geometry, and image edits; wait saved; go Home and reopen. | Reopened deck preserves all edits on the affected slides. |
| DECK-079 | Persistence | Browser reload on deck route | Open an edited deck and reload route. | Deck reloads from saved content without losing persisted edits. |
| DECK-080 | Serialization | Strip runtime-only deck attributes | Save after selecting objects and editing text. | Saved slide HTML does not contain `data-ai-slide-object-id`, `data-ai-slide-text-edit-id`, `data-ai-slide-selected`, `contenteditable`, or editor style nodes. |
| DECK-081 | Serialization | Preserve doctype/html/head/body | Seed slide HTML with document shell metadata and body content, edit, and save. | Saved slide HTML preserves valid document shell and intended content. |
| DECK-082 | Serialization | Preserve safe object styles | Apply toolbar and geometry edits, then save. | Saved HTML preserves intended object styles such as left/top/width/height/transform/color/background. |
| DECK-083 | Navigation | Home exits deck editor | Click Home/back from the conversation panel. | App returns to Home and the project appears in History when history view supports it. |
| DECK-084 | Navigation | Pending save Home guard | Make an edit and click Home before save completes. | App shows unsaved-changes confirmation; cancel keeps editor open with edit visible. |
| DECK-085 | Navigation | Pending save browser reload guard | Make an edit and trigger browser reload before save completes. | Browser shows native unsaved-changes confirmation instead of silently losing the edit. |
| DECK-086 | Navigation | Home after accepted save does not warn | Make an edit, wait until header returns to saved, click Home and reopen. | No unsaved prompt appears; reopened project contains edit. |
| DECK-087 | Navigation | Browser back guard while saving | Make an edit and use browser Back before save completes. | App prompts; cancel restores current route and keeps visible edit. |

## Export

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-088 | Export | Export deck to PPTX | Open a deck, choose export `PPTX`. | Export starts, hidden export iframes load each slide, a PPTX file is written through `/api/projects/:id/exports`, and export toast appears. |
| DECK-089 | Export | Export uses all manifest slides | Export a multi-slide deck. | Resulting PPTX contains all manifest slides in order. |
| DECK-090 | Export | Export after unsaved visible edit | Make a deck edit, wait saved, export PPTX. | Export includes the saved edit in the generated PPTX. |
| DECK-091 | Export | Export failure is recoverable | Force an export frame or writer failure where possible. | App stops exporting and editor remains usable; console/error state is diagnosable. |
| DECK-092 | Export | Open exported location | After a successful export, click the export toast open-location action. | App calls the server open exports endpoint without crashing. |

## AI Context And Conversation Panel

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-093 | AI Context | Slide-level context with no selection | Open deck, leave no object selected, send a prompt with deterministic/stub provider. | Request includes artifact type `deck`, current slide path such as `deck:<slideId>`, and write/slide context. |
| DECK-094 | AI Context | Object selection context | Select a textbox, image, or shape and send a prompt. | Request includes selection type `element`, object path, selected object HTML, and object text when available. |
| DECK-095 | AI Context | Text selection context | Select text inside a textbox and send a prompt. | Request includes selection type `text`, selected text, selected HTML, text range, and deck text path. |
| DECK-096 | AI Context | Collapsed text caret context | Place caret inside text without selecting text and send a prompt. | Request uses write mode with a deck text path rather than stale selected text. |
| DECK-097 | AI Context | Prompt flushes current slide HTML before run | Make an unsaved deck edit, then send an AI prompt. | Current slide HTML is PATCHed before `ai-edit` starts so the agent sees the latest visible content. |
| DECK-098 | AI Context | AI update reloads deck runtime | Simulate or run an AI-authored deck file update. | Project detail refreshes, artifact revision changes, slide iframe reloads new content, and stale selection clears. |
| DECK-099 | AI Context | AI running makes deck read-only | Start a run and interact with deck controls while accepted/running. | Deck editing controls are disabled or no-op safely; processing overlay is visible. |
| DECK-100 | AI Context | AI error is visible and recoverable | Force provider/API error while sending a deck prompt. | Error appears in conversation panel or app error area; editor remains usable afterward. |
| DECK-101 | AI Context | Cancel run restores editing | Start a run, cancel it, then edit a textbox. | Run becomes cancelled; read-only overlay clears; manual deck edit autosaves. |

## Toolbar And Responsive Behavior

| ID | Area | Case | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DECK-102 | Toolbar | Disabled controls do not mutate content | Open deck before selecting an object and click disabled actions where possible. | No slide HTML mutation occurs and no runtime crash happens. |
| DECK-103 | Toolbar | Toolbar works after stage scroll | Scroll/zoom-sized stage area, select an object, and use toolbar. | Toolbar remains usable and actions target the selected object. |
| DECK-104 | Toolbar | Narrow viewport toolbar wraps accessibly | Set a narrow viewport and run representative deck toolbar actions. | Controls remain reachable; no overlapping text or unusable controls block editing. |
| DECK-105 | Toolbar | Geometry panel positions within viewport | Select objects near stage edges and open `Move panel`. | Panel remains usable and does not block completing geometry changes. |
| DECK-106 | Toolbar | Object toolbar does not obscure editing badly | Select objects at desktop and mobile widths. | Duplicate/delete/move controls are reachable and do not prevent selecting or editing nearby objects. |
| DECK-107 | Toolbar | Selection overlay remains aligned after resize | Resize browser window with an object selected. | Slide scale recalculates; overlay stays aligned with selected object. |
| DECK-108 | Toolbar | Text does not overflow compact controls | Use longest current select labels and export/status states at narrow widths. | Toolbar controls remain visually coherent and text does not overlap adjacent controls. |

## Suggested Automation Order

1. DECK-001, DECK-004, DECK-009, DECK-010, DECK-076, DECK-079: prove creation, route loading, iframe rendering, editor preparation, autosave, and reload.
2. DECK-012 to DECK-024: stabilize filmstrip navigation, object hit testing, overlay selection, and toolbar selection preservation.
3. DECK-025 to DECK-034: cover textbox editing, direct text edit mode, keyboard editing, and selection context.
4. DECK-043 to DECK-054: cover current visible text and style toolbar behavior.
5. DECK-055 to DECK-068: cover overlay geometry, alignment, duplicate, and delete.
6. DECK-069 to DECK-075: cover image replacement, asset upload boundaries, and asset URL serialization.
7. DECK-035 to DECK-042: cover per-slide history after editing primitives are stable.
8. DECK-076 to DECK-087: cover serialization, navigation, unsaved-change protection, and reopen behavior.
9. DECK-088 to DECK-092: cover PPTX export when export dependencies are available.
10. DECK-093 to DECK-101: cover AI context only when a deterministic test/stub provider is available.
11. DECK-102 to DECK-108: cover disabled states, responsive behavior, and overlay alignment.

## Open Review Questions

- Should deck toolbar and overlay controls add stable `data-testid` values before broad automation, or is title/aria-label based targeting acceptable?
- Should deck browser tests create multi-slide fixtures through templates only, or should the app add a test-only API for seeded manifest plus slide HTML?
- Should AI context tests use a dedicated stub Agent Target to avoid relying on the machine's current Agent catalog?
- Should object geometry assertions compare exact CSS strings, or assert normalized numeric geometry through DOM APIs?
- Should export assertions inspect generated PPTX slide count/content directly, or treat successful server export plus file metadata as sufficient for browser coverage?
