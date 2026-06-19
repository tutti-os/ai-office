# HTML Blocked Manual Test Plan

This document covers the 43 cases that were blocked by browser-use limitations in Run 5. These are intended for manual testing in the local doc app.

## Environment

- Start app: `pnpm dev:doc`
- Open web: `http://localhost:5174`
- Prefer fresh API-seeded HTML projects or fresh blank HTML documents.
- Wait for the header save state to return to `Saved` before checking persistence.
- For persistence checks, reload the page or go Home and reopen the same project from History.

## 1. Prompt Creation

Covered cases: `HTML-002`

Steps:
1. On Home, keep output type as HTML.
2. Enter a short prompt, for example `Create a one page onboarding checklist`.
3. Submit/create the document.
4. Wait for the editor to open and the AI run to finish or visibly update.

Expected:
- A new HTML project opens in the editor.
- The iframe contains editable generated content related to the prompt.
- The project appears in History.
- No stale loading/error state remains.

## 2. Direct Keyboard Editing

Covered cases: `HTML-009`, `HTML-010`, `HTML-012`, `HTML-017`, `HTML-018`, `HTML-019`

Steps:
1. Open a fresh HTML document with a visible paragraph.
2. Click inside the iframe paragraph.
3. Type `Hello HTML world`.
4. Press Enter and type `Second line`.
5. Place the caret inside a word and use Backspace/Delete.
6. Wait for `Saved`.
7. Reload, or go Home and reopen the project.

Expected:
- Typed text appears at the caret.
- Enter creates a second editable paragraph/block.
- Backspace/Delete remove the expected adjacent characters.
- Word/element stats update after edits.
- Saved/reopened content preserves the direct edits.

## 3. Text Selection And Replacement

Covered cases: `HTML-011`, `HTML-013`, `HTML-020`, `HTML-024`, `HTML-035`, `HTML-108`

Steps:
1. Open or seed content containing `alpha beta gamma`.
2. Select `beta` with mouse drag or keyboard selection.
3. Confirm the left conversation panel shows selected text context.
4. Type `delta` over the selected text.
5. Undo, then redo if needed.

Expected:
- Active selection context reflects `beta`.
- Replacement changes text to `alpha delta gamma`.
- Toolbar clicks preserve the selected range when applying actions.
- Undo/redo restores both DOM and usable selection/target state without throwing.

## 4. Clipboard And Rich Paste

Covered cases: `HTML-014`, `HTML-015`

Steps:
1. Select text in the iframe and copy it.
2. Place the caret in another paragraph and paste.
3. Copy simple rich HTML from another source, such as bold text or a small list.
4. Paste it into the iframe.
5. Wait for `Saved`, then reload.

Expected:
- Plain copied text pastes at the caret.
- Rich pasted content keeps safe structure/styles.
- Saved HTML is valid and does not persist runtime-only editor attributes.

## 5. Collapsed Typing Style

Covered cases: `HTML-016`

Steps:
1. Place the caret in a paragraph without selecting text.
2. Change font size, text color, or font family.
3. Type a short word.
4. Repeat once but do not type after changing the style.
5. Wait for `Saved` and inspect by reload.

Expected:
- Newly typed text receives the chosen style.
- If no text is typed after setting a typing style, unused placeholder markers should be cleaned up and should not remain visible or pollute saved content.

## 6. Direct Typing History

Covered cases: `HTML-028`, `HTML-029`, `HTML-032`

Steps:
1. Click in a paragraph and type several characters continuously.
2. Click `Undo`.
3. Click `Redo`.
4. Repeat with a rapid typing burst such as `abcdef`.

Expected:
- Undo removes the typed text and enables Redo.
- Redo restores the typed text.
- Rapid continuous typing should merge into a sensible undo batch rather than requiring one undo per character.

## 7. Repeated Style History

Covered cases: `HTML-033`

Steps:
1. Select text or activate a paragraph.
2. Change text color/fill color or Spacing values repeatedly within a short interval.
3. Click `Undo`.

Expected:
- The repeated style changes apply visibly.
- One undo returns to the pre-change state when changes happen within the merge window.

## 8. Inline Formatting On Selected Text

Covered cases: `HTML-040`, `HTML-041`, `HTML-042`, `HTML-043`, `HTML-044`, `HTML-045`

Steps:
1. Select a word or phrase in iframe text.
2. Apply Bold, Italic, Underline, and Strikethrough one at a time.
3. Select already-bold text and click Bold again.
4. Apply Bold and Italic to the same selection.
5. Wait for `Saved`, then reload.

Expected:
- Each inline format applies only to the selected text.
- Active toolbar state reflects the selected format.
- Toggling Bold off removes bold without dropping text.
- Mixed formatting produces valid saved HTML and renders correctly after reload.

## 9. Font Size Input And Color Inputs

Covered cases: `HTML-047`, `HTML-049`, `HTML-050`

Steps:
1. Select text or activate a paragraph.
2. Enter `22` in `Font size`.
3. Use `Text color` to choose `#336699`.
4. Use `Fill color` to choose `#ffeeaa`.
5. Wait for `Saved`, then reload.

Expected:
- Font size changes to 22px on the intended target.
- Text color and fill/background color apply to the intended target only.
- Saved/reopened HTML preserves the expected styles.

## 10. Spacing Numeric Inputs

Covered cases: `HTML-053`, `HTML-054`

Steps:
1. Activate a paragraph.
2. Open `Spacing`.
3. Set `Line height value` to `1.8`.
4. Set `Letter spacing value` to `2`.
5. Wait for `Saved`, then reload.

Expected:
- Line height changes visibly and persists.
- Letter spacing changes visibly and persists.
- The floating menu remains usable while editing values.

## 11. Layout Margin And Padding Inputs

Covered cases: `HTML-056`, `HTML-057`

Steps:
1. Activate a paragraph or block.
2. Open `Layout`.
3. In the Margin section, set Top/Right/Bottom/Left values.
4. In the Padding section, set Top/Right/Bottom/Left values.
5. Wait for `Saved`, then reload.

Expected:
- Margin values apply to the target element and persist.
- Padding values apply to the target element and persist.
- Margin and Padding controls do not cross-apply values to the wrong section.

## 12. Link From Selected Text

Covered cases: `HTML-068`, `HTML-110`

Steps:
1. Select text in a paragraph.
2. Click `Create link`.
3. Enter `https://example.com` and click `Apply`.
4. Send a deterministic/manual AI prompt while the same selection is active, if an appropriate test provider is available.

Expected:
- Selected text becomes a link.
- AI request context, if tested, includes selected text, selected HTML, selection type, and selection path.

## 13. Image File Input

Covered cases: `HTML-074`, `HTML-076`, `HTML-078`

Steps:
1. Place the caret in the iframe and click `Image`.
2. Choose an image file.
3. Select the inserted image, click `Replace image`, and choose a different image.
4. Try choosing a non-image file.

Expected:
- Image insertion creates an image with data URL `src`, inferred alt text, and max-width styling.
- Replace image updates the existing image target without destabilizing the editor.
- Non-image file is rejected with an error and does not insert/replace an image.

## 14. Table Cell Typing And Multi-Cell Selection

Covered cases: `HTML-084`, `HTML-085`, `HTML-111`

Steps:
1. Insert or seed a table.
2. Click a cell and type text.
3. Drag across multiple cells.
4. Apply a table action or formatting to the selected cells.
5. If testing AI context, send a prompt while table cell selection is active.

Expected:
- Typed text appears only in the active cell and autosaves.
- Dragged cells show selected state.
- Table toolbar actions target selected cells correctly.
- AI context identifies the relevant table selection/target path when a deterministic provider is available.

## 15. AI Error Recovery

Covered cases: `HTML-113`

Steps:
1. Configure or choose a provider/profile that deterministically fails.
2. Send an AI edit prompt.
3. Observe the conversation panel and editor after failure.
4. Continue editing the document manually.

Expected:
- Error is visible in the conversation panel.
- Run state is no longer stuck in accepted/running.
- Editor remains usable after the failed run.

## 16. Pending Save Navigation And Reload Guard

Covered cases: `HTML-119`, `HTML-120`

Steps:
1. Open an HTML document.
2. Make an edit that triggers autosave, such as direct text typing, inserting a table, or applying a toolbar transform.
3. Before the header returns to `Saved`, click Home from the left panel.
4. Repeat by making another edit and using the browser reload command before `Saved`.

Expected:
- Home during a pending save shows an unsaved-changes confirmation; canceling keeps the editor open and the edit visible.
- Browser reload during a pending save shows a native unsaved-changes confirmation.
- After waiting for `Saved`, Home navigation no longer prompts and reopening preserves the edit.
