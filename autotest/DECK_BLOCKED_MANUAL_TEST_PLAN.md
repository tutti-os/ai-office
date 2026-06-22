# Deck Blocked Manual Test Plan

This document covers deck cases that are likely to be blocked or flaky under browser-use automation. These are intended for manual testing in the local slide app.

## Environment

- Start app: `pnpm dev:slide`
- Open web: the slide web URL, usually `http://localhost:5175` for Vite.
- Prefer fresh deck projects created from templates that contain textboxes, images, shapes, and multiple slides.
- Wait for the header save state to return to `Saved` before checking persistence.
- For persistence checks, reload the page or go Home and reopen the same project from History when available.
- For saved HTML checks, fetch `/api/projects/<projectId>/deck/slides/<slideId>`.

## 1. Prompt Creation

Covered cases: `DECK-002`

Steps:
1. On Home, select `Deck`.
2. Enter a short prompt, for example `Create a 5 slide product launch deck`.
3. Click `Create`.
4. Wait for the deck editor to open and for any AI run activity to finish, update, or visibly fail.

Expected:
- A new deck project opens at `/slide/<id>`.
- The deck runtime remains usable after the run completes or fails.
- Any generated or updated content is related to the prompt, or the error state is clear and recoverable.
- The project appears in History when the history panel supports it.

## 2. Template Creation And Multi-Slide Navigation

Covered cases: `DECK-003`, `DECK-012`, `DECK-016`

Steps:
1. Open a template preview with multiple slides.
2. Use the template to create a deck project.
3. Click several filmstrip thumbnails, including one near the far end if available.
4. Use ArrowDown or ArrowRight while no object is selected.

Expected:
- Template slides render in the stage and filmstrip.
- The active thumbnail receives selected styling.
- The stage iframe changes to the selected slide.
- Keyboard navigation works only while the deck is idle.

## 3. Precise Object Selection

Covered cases: `DECK-017`, `DECK-018`, `DECK-019`, `DECK-020`, `DECK-023`, `DECK-024`

Steps:
1. Open a deck slide containing a textbox, image, and shape.
2. Click each object type.
3. Confirm the selection rectangle, toolbar state, and object toolbar.
4. Click empty slide space.
5. Switch to another slide.

Expected:
- Each object can be selected without selecting the wrong nearby object.
- Overlay bounds visually match the selected object.
- Empty slide clicks clear selection.
- Switching slides clears stale selection and overlay state.

## 4. Textbox Editing And Replacement

Covered cases: `DECK-025`, `DECK-027`, `DECK-028`, `DECK-029`, `DECK-030`, `DECK-034`

Steps:
1. Double-click a textbox.
2. Type `Deck edit smoke`.
3. Press Enter and type `Second line` where the textbox allows line breaks.
4. Select one word and type a replacement.
5. Use Backspace and Delete near the middle of a word.
6. Click another object to leave text mode.
7. Wait for `Saved`, then reload.

Expected:
- Text editing occurs inside the intended textbox only.
- Replacement affects only selected text.
- Backspace/Delete remove the expected adjacent characters.
- Text mode exits cleanly when another object is selected.
- Saved/reopened slide preserves the visible text edits.

## 5. Single-Click Text Edit Mode

Covered cases: `DECK-026`, `DECK-033`

Steps:
1. Click `Single-click text edit`.
2. Click a textbox once.
3. Place the caret without selecting text.
4. Type a short word and wait for `Saved`.
5. Disable `Single-click text edit` and click the same textbox again.

Expected:
- Single-click mode enters text editing from one click.
- Collapsed caret context is write-like and does not show stale selected text in the agent panel.
- Disabling the mode restores ordinary object selection behavior.

## 6. Text Selection And Agent Context

Covered cases: `DECK-032`, `DECK-096`

Steps:
1. Enter text mode in a textbox.
2. Select a phrase.
3. Confirm the conversation panel shows the selected phrase.
4. Send a simple AI prompt if a deterministic or manually acceptable provider is available.
5. Repeat with a collapsed caret and no selected text.

Expected:
- Selected text context appears before sending.
- Prompt with selected text uses text selection context.
- Prompt with collapsed caret does not reuse stale selected text.
- Editor remains usable after the run completes or fails.

## 7. Inline Formatting

Covered cases: `DECK-043`, `DECK-044`, `DECK-045`, `DECK-046`, `DECK-047`, `DECK-048`

Steps:
1. Select text inside a textbox.
2. Apply Bold, Italic, Underline, and Strikethrough one at a time.
3. Select already-bold text and click Bold again.
4. Apply Bold and Italic to the same phrase.
5. Wait for `Saved`, then reload.

Expected:
- Each inline format applies only to the selected text.
- Toggling Bold off removes the bold style without dropping text.
- Mixed formatting renders correctly and persists after reload.

## 8. Font, Size, Color, And Alignment

Covered cases: `DECK-049`, `DECK-050`, `DECK-051`, `DECK-052`, `DECK-053`, `DECK-054`

Steps:
1. Select text inside a textbox.
2. Change `Font family` to `Georgia` or `Arial`.
3. Set `Font size` to `28`.
4. Change `Text color` to a recognizable color.
5. Select the whole textbox or a shape and change `Fill color`.
6. Use `Align left`, `Align center`, and `Align right`.
7. Try changing `Block style`.
8. Wait for `Saved`, then reload.

Expected:
- Font family, font size, text color, fill color, and alignment apply to intended targets only.
- Saved/reopened slide preserves expected styles.
- `Block style` does not unexpectedly mutate slide content.

## 9. Drag, Snap, And Canvas Bounds

Covered cases: `DECK-055`, `DECK-056`

Steps:
1. Select a movable object.
2. Drag it a short distance.
3. Drag it near the canvas center or another object edge.
4. Drag it near each canvas boundary.
5. Wait for `Saved`, then reload.

Expected:
- Object follows the pointer and remains inside the canvas.
- Snap guides appear near snap targets and disappear after release.
- Saved/reopened slide preserves the final position.

## 10. Resize

Covered cases: `DECK-057`, `DECK-058`

Steps:
1. Select a textbox, image, or shape.
2. Drag `Resize bottom-right`.
3. Drag a side handle such as `Resize right`.
4. Try shrinking toward a very small size.
5. Wait for `Saved`, then reload.

Expected:
- Width and height change according to the dragged handle.
- Minimum size is respected.
- Textbox content wraps instead of overflowing in a blocking way.
- Saved/reopened slide preserves final size.

## 11. Rotation

Covered cases: `DECK-059`, `DECK-060`

Steps:
1. Select an object.
2. Drag `Rotate object`.
3. Repeat while holding Shift.
4. Wait for `Saved`, then reload.

Expected:
- Object rotates smoothly and overlay follows.
- Shift rotation snaps to the expected angle increment.
- Saved/reopened slide preserves rotation.

## 12. Geometry Panel

Covered cases: `DECK-061`, `DECK-062`, `DECK-063`, `DECK-064`, `DECK-065`, `DECK-066`

Steps:
1. Select an object.
2. Click `Move panel`.
3. Change `X`, `Y`, `W`, and `H` values.
4. Toggle proportion lock and change one dimension.
5. Use horizontal and vertical alignment actions.
6. Wait for `Saved`, then reload.

Expected:
- Numeric geometry changes apply to the selected object.
- Proportion lock updates the paired dimension.
- Alignment actions move the object to expected canvas positions.
- Saved/reopened slide preserves geometry.

## 13. Duplicate And Delete Object

Covered cases: `DECK-067`, `DECK-068`

Steps:
1. Select an object.
2. Click `Duplicate object`.
3. Confirm the duplicate appears offset from the original.
4. Select the duplicate and click `Delete object`.
5. Wait for `Saved`, then reload.

Expected:
- Duplicate is independently selectable and slightly offset.
- Delete removes only the selected object.
- Saved/reopened slide reflects the duplicate/delete operations.

## 14. Image Replacement

Covered cases: `DECK-069`, `DECK-070`, `DECK-071`, `DECK-075`

Steps:
1. Select an image object.
2. Click `Replace image`.
3. Choose a small local image file.
4. Repeat on another image representation if the template has SVG image or background-image objects.
5. Wait for `Saved`, then reload.

Expected:
- Existing image target is replaced rather than inserting a new unrelated object.
- Replacement image renders on the slide.
- Saved/reopened slide preserves the replacement.

## 15. Image Upload Rejection

Covered cases: `DECK-072`, `DECK-073`

Steps:
1. Select an image object.
2. Click `Replace image`.
3. Choose a non-image file.
4. If practical, try an unsupported or oversized file.
5. Continue editing text afterward.

Expected:
- Non-image or unsupported files do not replace the selected image.
- Any error state is recoverable.
- The deck remains editable and later manual edits still autosave.

## 16. Asset Serialization

Covered cases: `DECK-074`, `DECK-080`

Steps:
1. Replace an image with a local fixture image.
2. Select an object and enter/exit text mode.
3. Wait for `Saved`.
4. Fetch the saved slide HTML from the deck slide API or inspect the workspace slide file.

Expected:
- Saved HTML uses relative `../assets/...` references rather than `/local-assets/projects/...` URLs.
- Runtime-only attributes are absent: `data-ai-slide-object-id`, `data-ai-slide-text-edit-id`, `data-ai-slide-selected`, and `contenteditable`.
- Editor-only style nodes are not persisted.

## 17. Per-Slide History

Covered cases: `DECK-035`, `DECK-036`, `DECK-037`, `DECK-038`, `DECK-039`, `DECK-041`, `DECK-042`

Steps:
1. Edit text on slide 1.
2. Undo and redo the edit using toolbar buttons.
3. Apply a style and undo/redo it.
4. Move an object and undo/redo it.
5. Switch to slide 2, make a different edit, and undo.
6. Repeat at least one undo with Cmd/Ctrl+Z.

Expected:
- Undo/redo restores text, style, and geometry changes.
- History applies to the active slide and does not undo unrelated changes on another slide.
- Keyboard shortcuts do not trigger browser navigation or corrupt the deck.

## 18. Pending Save Navigation And Reload Guard

Covered cases: `DECK-084`, `DECK-085`, `DECK-086`, `DECK-087`

Steps:
1. Make a visible edit that triggers autosave.
2. Before the header returns to `Saved`, click Home from the left panel.
3. Cancel the confirmation.
4. Repeat with browser reload before `Saved`.
5. Repeat with browser Back before `Saved`.
6. Make another edit, wait for `Saved`, click Home, and reopen.

Expected:
- Home, reload, and browser Back during pending save show an unsaved-changes confirmation.
- Canceling keeps the editor open and the visible edit intact.
- After `Saved`, Home navigation does not prompt.
- Reopened project contains the saved edit.

## 19. PPTX Export

Covered cases: `DECK-088`, `DECK-089`, `DECK-090`, `DECK-091`, `DECK-092`

Steps:
1. Open a multi-slide deck.
2. Make a small edit and wait for `Saved`.
3. Use the header export menu and choose `PPTX`.
4. Wait for the export toast.
5. Open the exported location from the toast if available.
6. Open the generated PPTX in a local viewer.

Expected:
- Export completes without leaving the app stuck in exporting state.
- Export toast shows a written PPTX path.
- Generated PPTX contains all deck slides in order.
- The recent saved edit appears in the generated PPTX.
- Opening export location does not crash the app.

## 20. AI Prompt With Slide Context

Covered cases: `DECK-093`, `DECK-097`, `DECK-098`

Steps:
1. Open a deck and make a small visible edit.
2. Do not select any object.
3. Send an AI prompt using the available local provider/profile.
4. Observe the conversation panel, save state, and slide content until completion or failure.

Expected:
- The visible edit is saved or flushed before the AI run begins.
- Request uses deck artifact context and active slide context.
- If the agent updates deck files, the runtime reloads updated content and clears stale selection.
- Editor remains usable after completion or failure.

## 21. AI Prompt With Object Selection

Covered cases: `DECK-094`

Steps:
1. Select a textbox, shape, or image object.
2. Send an AI prompt such as `Improve this element`.
3. Observe run state and editor after completion or failure.

Expected:
- Request context includes the selected object path and object HTML.
- Read-only overlay prevents conflicting manual edits while the run is active.
- Editor returns to editable state after the run completes, fails, or is cancelled.

## 22. AI Prompt With Text Selection

Covered cases: `DECK-095`

Steps:
1. Enter text mode inside a textbox.
2. Select a phrase.
3. Send an AI prompt such as `Make this more concise`.
4. Observe run state and content afterward.

Expected:
- Request includes selected text, selected HTML, text range, and deck text selection path.
- If content changes, it targets the intended deck/text context or otherwise follows provider output.
- Editor remains usable afterward.

## 23. AI Error Recovery And Cancel

Covered cases: `DECK-099`, `DECK-100`, `DECK-101`

Steps:
1. Configure or choose a provider/profile that is expected to fail, or start a run and cancel it.
2. Observe the read-only overlay and conversation panel.
3. After failure or cancellation, edit a textbox manually.
4. Wait for `Saved`.

Expected:
- Error or cancellation is visible in the conversation panel.
- Run state is no longer stuck in accepted/running.
- Read-only overlay clears.
- Manual edits after the run still autosave.

## 24. Responsive Toolbar And Overlay

Covered cases: `DECK-104`, `DECK-105`, `DECK-106`, `DECK-107`, `DECK-108`

Steps:
1. Resize the app window to a narrow mobile-like width, around 390px.
2. Select a textbox, image, and shape across representative slides.
3. Use toolbar controls, object toolbar, and `Move panel`.
4. Resize the browser while an object is selected.
5. Continue editing text afterward.

Expected:
- Toolbar controls remain reachable after wrapping.
- Object toolbar and geometry panel remain usable and do not block selection.
- Selection overlay stays aligned after resize.
- Text labels do not overlap controls in a way that blocks use.
- The deck remains editable after responsive interactions.
