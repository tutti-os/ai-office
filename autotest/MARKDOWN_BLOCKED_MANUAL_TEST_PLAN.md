# Markdown Blocked Manual Test Plan

This document covers the 15 Markdown cases that were blocked by browser-use limitations. These are intended for manual testing in the local doc app.

## Environment

- Start app: `pnpm dev:doc`
- Open web: `http://localhost:5174`
- Prefer fresh Markdown projects for each section.
- Wait for the header save state to return to `Saved` before checking persistence.
- For persistence checks, reload the page or go Home and reopen the same project from History.

## 1. Prompt Creation

Covered cases: `MD-002`

Steps:
1. On Home, select Markdown output type.
2. Enter a short prompt, for example `Create a Markdown onboarding checklist`.
3. Submit/create the document.
4. Wait for the editor to open and for any AI run activity to finish or visibly fail.

Expected:
- A new Markdown project opens in the editor.
- The document contains prompt-related Markdown content or a clear recoverable run state.
- The editor remains usable after the run completes or fails.
- The project appears in History.

## 2. Precise Text Selection And Replacement

Covered cases: `MD-011`

Steps:
1. Open a fresh Markdown document.
2. Type or seed `alpha beta gamma`.
3. Select only `beta` with the mouse or keyboard.
4. Type `delta`.
5. Wait for `Saved`, then reload or reopen the project.

Expected:
- The visible editor content becomes `alpha delta gamma`.
- Saved Markdown no longer contains `beta`.
- Saved/reopened content preserves the replacement.
- The selection replacement does not replace the whole document.

## 3. Image File Input

Covered cases: `MD-055`, `MD-056`, `MD-059`, `MD-060`

Steps:
1. Place the caret in a Markdown document.
2. Click `Image`.
3. Choose an image file, for example `sample-chart.png`.
4. Wait for `Saved`, then reload or reopen.
5. Repeat once with a non-image file.

Expected:
- Image insertion creates Markdown image syntax with a data URL or the current expected local image representation.
- The rendered editor shows the inserted image.
- Alt text is inferred from the file name, for example `sample chart`, or follows the current product behavior.
- Reopened content still renders the image.
- A non-image file is ignored/rejected without inserting broken Markdown or destabilizing the editor.

## 4. Image Replacement

Covered cases: `MD-058`

Steps:
1. Open or create a Markdown document containing an image.
2. Select the image in the editor.
3. Click `Replace image`.
4. Choose a different image file.
5. Wait for `Saved`, then reload or reopen.

Expected:
- The selected image target is replaced rather than inserting a second unrelated image.
- The replacement image renders in the editor.
- Saved/reopened Markdown remains valid and points to the replacement image.

## 5. AI Prompt With No Selection

Covered cases: `MD-084`

Steps:
1. Open a Markdown document with several paragraphs.
2. Make sure no text is selected.
3. Send an AI prompt using the available local provider/profile.
4. Observe the conversation panel and editor until the run completes, updates, or fails.

Expected:
- The request uses the current Markdown document as context.
- The UI shows an accepted/running/completed state, or a clear error state.
- The editor remains usable after the run.
- If the run updates content, the Markdown editor reloads the updated content.

## 6. AI Prompt With Text Selection

Covered cases: `MD-085`

Steps:
1. Open a Markdown document containing a phrase such as `rewrite this sentence`.
2. Select that phrase.
3. Confirm the agent panel shows the selected context.
4. Send an AI prompt such as `Make this more concise`.
5. Observe the conversation panel and editor until the run completes, updates, or fails.

Expected:
- The request includes selected text and the current Markdown content.
- The UI keeps a clear selected-context state when the prompt is sent.
- If content is updated, the update targets the selected text or otherwise follows the provider response.
- The editor remains usable after completion or failure.

## 7. AI Update Reload

Covered cases: `MD-086`

Steps:
1. Open a Markdown project.
2. Trigger an AI edit or otherwise cause the project to receive an AI-authored content update.
3. Wait for the update to finish.
4. Continue editing manually after the update.

Expected:
- Markdown runtime reloads the updated content.
- The visible editor content matches the saved project content.
- Stale selection/context is cleared or updated appropriately.
- Manual editing after the AI update still autosaves.

## 8. AI Error Recovery

Covered cases: `MD-087`

Steps:
1. Configure or choose a provider/profile that is expected to fail, or disconnect the provider in a controlled way.
2. Send an AI prompt from a Markdown document.
3. Observe the conversation panel and editor after failure.
4. Continue editing the document manually.

Expected:
- Error is visible in the conversation panel.
- Run state is no longer stuck in accepted/running.
- Editor remains usable after the failed run.
- Manual edits still autosave.

## 9. Narrow Viewport Toolbar

Covered cases: `MD-090`

Steps:
1. Resize the app window to a narrow mobile-like width, around 390px.
2. Open a Markdown document and focus the editor.
3. Use representative toolbar actions, such as Bold, Bulleted list, Block style, Table, and Code block.
4. Scroll vertically if the toolbar wraps.

Expected:
- Toolbar controls remain reachable after wrapping.
- Buttons and labels do not overlap in a way that blocks use.
- Actions still target the editor correctly.
- The editor remains editable after resizing.

## 10. Link Popover On Narrow Viewport

Covered cases: `MD-091`

Steps:
1. Use a narrow viewport or narrow app window.
2. Select text near the top of the document.
3. Click `Create link`.
4. Enter `https://example.com` and apply.
5. Repeat after scrolling so the toolbar/popover appears near viewport edges.

Expected:
- Link popover stays within viewport margins.
- Inputs and Apply button remain reachable.
- Applying the link saves valid Markdown link syntax.
- The popover does not cover controls in a way that prevents completing the action.

## 11. Code Block On Narrow Viewport

Covered cases: `MD-092`

Steps:
1. Use a narrow viewport or narrow app window.
2. Open a Markdown document.
3. Click `Code block`.
4. Type several lines of code into the code block editor.
5. Wait for `Saved`, then reload or reopen.

Expected:
- Code block editor remains reachable and usable on the narrow viewport.
- Code text does not overflow controls in a blocking way.
- Saved/reopened Markdown preserves the fenced code block.

## 12. Image Replacement Toolbar On Responsive Widths

Covered cases: `MD-093`

Steps:
1. Open or create a Markdown document containing an image.
2. Select the image at desktop width and confirm the replacement control is reachable.
3. Resize to a narrow mobile-like width.
4. Select the image again and confirm the replacement control remains reachable.
5. Continue editing text after interacting with the image.

Expected:
- Replacement control is reachable at desktop and narrow widths.
- The control does not overlap the image/editor in a way that blocks continuing.
- The document remains editable after selecting/deselecting the image.

## 13. Pending Table Cell Browser Reload Guard

Covered cases: `MD-096`

Steps:
1. Open a Markdown document containing a table.
2. Click a body cell and edit its text.
3. Keep focus inside the cell; do not press Tab/Enter and do not click outside the table.
4. Confirm the header does not say `Saved` while the edit is pending.
5. Use the browser reload command.

Expected:
- The browser shows a native unsaved-changes confirmation.
- Canceling the confirmation keeps the document open with the visible cell edit intact.
- The edit is not silently lost on reload.
