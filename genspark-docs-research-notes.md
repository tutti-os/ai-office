# Genspark Docs Research Notes

Date: 2026-06-13

This document records the current research findings about Genspark's document editing capability, especially the relationship between Rich Text, Markdown, DOCX, templates, and the apparent runtime protocol.

## 1. Current Understanding

Genspark's AI Docs appears to expose three document-related modes or formats:

- Rich Text
- Markdown
- DOCX

However, based on direct UI observation:

- The live editor input format dropdown showed Rich Text and Markdown.
- DOCX appears more likely to be an import/export or boundary format, not the main live runtime.
- After selecting a template, the document is forced into Rich Text mode.
- Templates appear to be Rich Text-first, not Markdown-first.

This corrected an earlier mistaken assumption that templates could stay in Markdown mode. The observed behavior is: once a template is selected, the runtime becomes Rich Text.

## 2. Rich Text Runtime

The Rich Text editor appears to use an iframe-hosted HTML document runtime.

More precisely:

```txt
Parent app: Vue/Nuxt app, toolbar, AI panel, project state
        |
        | manipulates iframe.contentDocument
        v
iframe.editor-iframe
        |
        | browser-native HTML/CSS rendering
        v
editable document canvas
```

The iframe is not obviously loading an external document URL. The observed iframe has:

```html
<iframe class="editor-iframe" sandbox="allow-scripts allow-same-origin">
```

Its `src` is empty or absent in the observed DOM. This suggests the parent app initializes and updates the iframe document directly, instead of loading a separate page.

## 3. Evidence From DOM And Source

The Rich Text editor DOM includes:

- `editor-container`
- `editor-wrapper docs_agent`
- `editor-toolbar-wrapper`
- `editor-toolbar-container`
- `editor-iframe`

The loaded source contains many direct iframe/document operations:

```js
iframe.contentDocument
iframe.contentWindow.document
document.body.innerHTML
querySelector('[contenteditable="true"]')
document.execCommand(...)
getSelection()
Range
```

This strongly suggests the editor uses browser-native DOM editing inside an iframe, rather than a React/Vue-rendered document tree in the parent page.

It does not look like canvas rendering, and it does not look like Markdown rendering.

## 4. Persistence Shape

The project save path appears to use:

```txt
/api/project/update
```

The saved project payload includes a structure like:

```ts
{
  id: projectId,
  session_state: {
    docs_agent: {
      content: string,
      type: "html" | "markdown" | "docx"
    }
  },
  is_manual: true,
  request_not_update_permission: true
}
```

For Rich Text, the type appears to be `html`, and the content appears to be an HTML string. The fallback empty document is a full HTML document:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <style>
    body {
      max-width: 880px;
      margin: 0 auto;
      padding: 2rem 80px;
      position: relative;
    }
  </style>
</head>
<body>
  <p><br/></p>
</body>
</html>
```

This is an important signal: the Rich Text runtime is closer to HTML document state than to Markdown or a structured editor JSON format.

## 5. Undo / Redo Model

The editor appears to maintain undo/redo snapshots based on HTML content, selection state, and scroll state.

Observed shape:

```ts
{
  id: string,
  timestamp: number,
  htmlContent: {
    innerHTML: string,
    bodyAttributes: Record<string, string>
  },
  selectionState: unknown,
  scrollState: {
    scrollX: number,
    scrollY: number
  },
  operationType: "initial" | "manual" | "typing" | "formatting" | "delete" | "paste" | string,
  description: string,
  metadata: Record<string, unknown>
}
```

Restore logic appears to write HTML back into the iframe body:

```js
document.body.innerHTML = snapshot.htmlContent.innerHTML
```

or parse a full HTML document and then apply the parsed body.

This is another strong signal that HTML is the core runtime representation for Rich Text.

## 6. AI Editing Model

The AI rewrite/write features appear to call:

```txt
/api/docs_agent/ai_rewrite
/api/docs_agent/ai_write
```

The request payload includes fields like:

```ts
{
  selected_content: string,
  user_prompt: string,
  html_content: string,
  selection_type: "text" | "element" | "write",
  selection_content_path: string,
  mode: "rewrite" | "write"
}
```

The AI layer therefore seems to operate on:

- current HTML content
- selected text or selected element HTML
- a path to the selected content
- mode-specific instructions

This means the AI is not primarily editing Markdown in Rich Text mode. It is editing or rewriting against an HTML document context.

## 7. Export Model

The export component calls:

```txt
/api/docs_agent/export
```

The request includes:

```ts
{
  project_id: string,
  export_type: "docx" | "pdf" | "html" | "website" | string,
  html_content: string,
  canvas_history_id?: string
}
```

This suggests Rich Text export also uses HTML as the interchange boundary.

DOCX is likely generated from HTML server-side, rather than being the live editor format.

## 8. Open Source Signals

Markdown mode has strong evidence of using Vditor:

- CSS includes many `.vditor-*` classes.
- `MarkdownEditor` CSS contains Vditor-specific styles.

Rich Text mode does not show obvious signatures for:

- ProseMirror
- Tiptap
- Lexical
- Slate
- Quill
- CKEditor
- TinyMCE
- GrapesJS

Rich Text does appear to dynamically load Rangy, an open-source Selection/Range helper library. But Rangy is not the whole editor protocol. It seems to be used for selection, range manipulation, text formatting, and compatibility.

Current conclusion:

- Markdown editor: likely based on Vditor.
- Rich Text editor: likely custom/proprietary HTML document editor.
- Rich Text helper library: Rangy is used for selection/range handling.

## 9. Template Implication

Templates appear to belong to the Rich Text/HTML runtime.

This makes sense because templates need:

- precise typography
- spacing
- multi-column layout
- colors
- images
- absolute or semi-absolute visual structure
- resume/invoice/business-document style fidelity

Markdown cannot naturally preserve that level of template layout without embedding large amounts of HTML/CSS, at which point Markdown stops being the real runtime.

## 10. Runtime Format Implication For Our Product

If we want to replicate a similar human + AI document editing experience, Markdown should probably not be the only runtime format.

A better model may be:

```txt
Canonical runtime:
  HTML/CSS document

Human editing:
  iframe-hosted contenteditable document editor

AI editing:
  HTML + selection path + selected content + operation intent

Markdown:
  import/export/projection format

DOCX:
  import/export/projection format
```

This keeps the AI close to the actual rendered document, while still allowing Markdown as a simpler authoring or interchange mode.

## 11. Possible Internal Protocol Shape

A simplified inferred runtime schema could look like this:

```ts
type DocsAgentState = {
  docs_agent: {
    type: "html" | "markdown" | "docx";
    content: string;
  };
  canvas_history_id?: string;
  canvas_history?: unknown;
};
```

For Rich Text:

```ts
type RichTextContent = string; // full HTML document or body HTML
```

For editor local history:

```ts
type RichTextSnapshot = {
  htmlContent: {
    innerHTML: string;
    bodyAttributes: Record<string, string>;
  } | string;
  selectionState: unknown;
  scrollState: {
    scrollX: number;
    scrollY: number;
  };
  operationType: string;
  metadata?: Record<string, unknown>;
};
```

For AI operations:

```ts
type AiEditRequest = {
  html_content: string;
  selected_content?: string;
  selected_html?: string;
  selection_type?: "text" | "element" | "write";
  selection_content_path?: string;
  user_prompt: string;
  mode: "rewrite" | "write";
};
```

## 12. What Is Confirmed vs Inferred

Confirmed from UI and source inspection:

- Selecting a template leads to Rich Text mode.
- Rich Text page uses an `editor-iframe`.
- Rich Text editor manipulates `iframe.contentDocument`.
- Rich Text code uses native DOM APIs, selection/range APIs, and `execCommand`.
- Save/export/AI rewrite paths reference HTML content.
- Markdown mode has strong Vditor traces.
- Rich Text uses Rangy as a helper.

Inferred, but not fully proven:

- `docs_agent.content` is the canonical persisted HTML for Rich Text.
- `canvas_history` is related to multi-user/history synchronization around document content.
- DOCX is an import/export boundary rather than a live runtime.
- Rich Text is proprietary/custom rather than an OSS editor with hidden wrappers.

Not yet verified:

- Exact backend response shape of `/api/project?id=...`.
- Exact structure of `canvas_history`.
- Whether collaboration is OT/CRDT, polling version sync, or coordinator-based queueing.
- Whether iframe initialization uses `document.write`, parsed HTML insertion, or another internal helper.
- Whether there are additional hidden server-side transformations before export.

## 13. Research Direction

Useful next steps:

1. Inspect `/api/project?id=...` response shape if accessible in a safe read-only way.
2. Find the exact iframe initialization helper in the minified bundle.
3. Trigger a tiny local edit and inspect whether save payload sends full HTML or a patch.
4. Inspect multiplayer/coordinator code to understand collaboration model.
5. Compare a Markdown-created document vs template-created Rich Text document at the saved state level.
6. Test export behavior for HTML/DOCX/PDF and observe whether all exports originate from `html_content`.

## 14. Current Design Takeaway

For a Genspark-like document product, the safest architectural bet is:

```txt
Use HTML/CSS as the canonical runtime for visual/template documents.
Use Markdown as a projection/import/export format.
Use DOCX as an import/export format.
Let AI edit HTML through structured operations, not raw text-only diffs.
```

This is especially important for template-heavy documents such as resumes, invoices, reports, proposals, and visually structured business documents.

## 15. Follow-Up Discussion: Store HTML Directly

After discussion, we corrected an important point:

It is acceptable, and probably desirable, to store HTML directly as the canonical document runtime.

The earlier concern was not "do not store HTML". The more precise concern is:

```txt
Store HTML as canonical state.
Do not treat it as an opaque string during AI editing.
```

In other words, the persisted state can be very close to Genspark:

```ts
type DocsAgentContent = {
  type: "html";
  content: string; // full HTML document or body-oriented HTML
};
```

The editing layer can still use helper context:

- current selection
- selected text
- selected element HTML
- selector/path to the selected content
- operation mode such as rewrite/write
- undo/redo snapshots

This is consistent with the observed Genspark approach: HTML is the stored runtime, while selection paths, DOM operations, and AI rewrite/write requests provide structure at edit time.

## 16. Template Control: Updated Finding

Template control appears to happen before the Rich Text editor receives content.

The current evidence suggests this flow:

```txt
Template gallery
  -> template id / name / category / preview
  -> selected template becomes agent context
  -> backend or agent generates docs_agent.content
  -> Rich Text editor receives HTML content
```

The Rich Text editor itself does not appear to expose a rich template schema such as:

```ts
{
  html: string;
  slots: Slot[];
  editableRegions: Region[];
}
```

The front-end evidence points more toward templates being seed/context rather than a front-end editable schema.

Related source pattern seen in a nearby Genspark template flow:

```html
<template-context template_id="..." template_name="..." />
```

This exact pattern was observed in the AgentDB template flow. For Docs templates, the same exact hidden context was not fully confirmed, but the UI/source structure looks directionally similar:

- template gallery exposes categories and cards
- cards expose preview/name/category-style information
- no clear front-end slot/region schema was found
- after selection, the editable result is Rich Text HTML

Current inference:

```txt
Genspark templates are likely not live front-end schemas.
They are likely prompt/context seeds that produce initial HTML documents.
```

## 17. Product Decision: Align With Genspark

For our first version, align with Genspark instead of inventing a heavier template protocol.

Recommended first-version model:

```txt
Canonical document state:
  HTML

Template:
  id + name + category + preview + prompt/context

Template application:
  selected template instructs generation of initial HTML

Human editing:
  iframe-hosted HTML/contenteditable editor

AI editing:
  current HTML + selected content + selection path + instruction
```

Avoid building a complex slot DSL in the first version.

If AI editing becomes unstable later, add lightweight semantic annotations inside HTML, for example:

```html
<section data-ai-region="work_experience">
  ...
</section>
```

This keeps the architecture close to Genspark while preserving a path to stronger AI control later.

## 18. Revised Architecture Bias

The revised architecture bias is:

```txt
Do not start with Markdown as runtime.
Do not start with a complex custom template schema.
Do start with HTML as canonical runtime.
Do start with iframe-hosted rendering/editing.
Do treat templates as generation seeds.
Do add AI-facing structure only when needed.
```

This makes the first version smaller, closer to the observed Genspark behavior, and easier to iterate.
