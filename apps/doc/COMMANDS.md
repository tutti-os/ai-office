# AI Doc Commands

AI Doc exposes the `doc` CLI scope to Tutti apps and agents.

Help:

- `doc --help`: show the AI Doc command list.
- `doc open --help`: show inputs for opening an existing document file.

## `doc status`

Returns app health, project count, runtime provider count, and whether `TUTTI_CLI` is available to the app runtime.

## `doc list-projects`

Lists recent document projects. Optional input:

- `limit`: maximum number of rows to return.

## `doc open`

Imports an HTML, Markdown, or DOCX file into AI Doc. Inputs:

- `path`: absolute path, `~/...` path, or path relative to `AI_DOC_WORKSPACE_ROOT` / `TUTTI_WORKSPACE_ROOT`.
- `title`: optional project title override.

The command returns JSON with the imported project, `/doc/<projectId>` route, full URL, source path, focused workspace file path, and project `AGENTS.md` path for follow-up agent edits.

Example:

```bash
doc open --path ./brief.md --title "Brief"
```

## `doc create`

Creates a new document project. Inputs:

- `title`: optional project title.
- `type`: `html` or `markdown`; defaults to `html`.
- `content`: optional initial document content.

The command returns the created project as JSON.
