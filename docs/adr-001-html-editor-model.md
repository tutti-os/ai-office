# ADR 001: HTML Editing Uses a Model-Based Editor Runtime

## Status

Accepted.

## Context

`ai-office` has three editable artifact surfaces:

- Markdown documents.
- HTML documents.
- Deck text and objects.

The shared app structure, server APIs, template flow, agent runtime contracts, and Tutti packaging should stay aligned across doc, slide, and sheet apps. The editor core is different: selection, marks, undo, tables, links, and input composition are editor-domain problems with long tails. We should not keep expanding bespoke DOM `Range` code for these concerns.

The HTML editor had been implemented as an iframe-hosted `contenteditable` document with toolbar commands that directly mutate DOM ranges. This repeatedly fails around inline boundaries such as mixed colors, links, nested spans, and normalized nodes. Patching the range restoration logic only moves the bug surface.

Genspark has been verified to host the document canvas in an iframe with an external toolbar. Its exact editor library has not been conclusively identified, so we should not claim package-level parity from bundle inference alone. The product-level architecture to align with is: iframe-hosted document surface, external controls, and an editor model that owns selection and formatting semantics.

Tiptap is built on ProseMirror, whose transaction model tracks document and selection updates together. That matches the behavior we need: toolbar commands should update editor state, and the DOM should be rendered from that state.

## Decision

HTML editing in `apps/doc` will use a model-based editor runtime, starting with Tiptap/ProseMirror for rich HTML body editing.

The HTML artifact boundary remains HTML-first:

- Server storage and exports continue to use `RuntimeDocument`.
- Agents continue to receive full HTML plus selected text/HTML.
- Template data still flows through server APIs.
- The document canvas remains iframe-hosted for product parity and style isolation.
- The iframe DOM is not the editing source of truth; Tiptap/ProseMirror owns the editor model.

The editing source of truth becomes the editor model:

- Text marks and inline styles are applied through editor commands and transactions.
- Selection is captured from editor state, not from mutated DOM paths.
- Toolbar commands restore ProseMirror selection bookmarks before applying transactions, so focus changes from iframe canvas to outer toolbar do not drop the active range.
- Undo/redo, keyboard behavior, composition, and mark mapping are delegated to the editor engine where possible.
- App-specific orchestration remains in `apps/doc/web/src/artifact/runtime` and `apps/doc/web/src/app`.

## Implementation Direction

First migration slice:

- Add a Tiptap HTML body editor for the doc app and mount it inside the iframe canvas.
- Keep `RuntimeDocument` as the persistence format by syncing Tiptap output into `document.bodyInnerHTML`.
- Route core toolbar commands through Tiptap transactions: headings, bold, italic, underline, strike, lists, alignment, font family, font size, foreground color, background color, links, images, and tables.
- Do not add new toolbar behavior through bespoke DOM `Range` mutation. Missing behavior should be represented as Tiptap/ProseMirror commands, schema extensions, or explicit editor adapters.

Follow-up slices:

- Move image and table object editing to Tiptap nodes/extensions or explicit object-editing adapters.
- Replace iframe-selection based toolbar state with editor-state derived toolbar state.
- Use the same text-editor strategy inside deck text boxes.
- Remove legacy DOM range formatting helpers once no toolbar path depends on them.

## Consequences

Positive:

- Selection survives repeated formatting commands because transactions map state instead of repairing DOM paths.
- External toolbar focus does not clear formatting targets because commands restore editor bookmarks rather than reading the browser selection directly.
- Inline styles are represented as marks/attributes with established behavior.
- Markdown already uses MDXEditor/Lexical, so the repo strategy becomes "mature editor engines at the core, shared app shell around them."
- Future collaboration, history, and schema validation become tractable.

Tradeoffs:

- Arbitrary imported HTML may not map perfectly into a rich editor schema. We will treat this as an explicit import/export boundary and preserve unsupported structures as progressively enhanced content where possible.
- Some legacy controls need staged migration.
- Tiptap dependencies increase web bundle size.

## Non-Goals

- Rewriting server storage, template APIs, or agent APIs in this step.
- Forcing Markdown into HTML as its rich-text runtime.
- Making deck object layout depend on the HTML document editor.
