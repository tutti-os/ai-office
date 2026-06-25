# AI Slide Commands

AI Slide exposes the `slide` CLI scope to Tutti apps and agents.

Help:

- `slide --help`: show the AI Slide command list.
- `slide open --help`: show inputs for opening an existing presentation file.

## `slide status`

Returns app health, project count, runtime provider count, and whether `TUTTI_CLI` is available to the app runtime.

## `slide list-projects`

Lists recent slide projects. Optional input:

- `limit`: maximum number of rows to return.

## `slide open`

Imports a PPTX file into AI Slide. Inputs:

- `path`: absolute path, `~/...` path, or path relative to `AI_SLIDE_WORKSPACE_ROOT` / `TUTTI_WORKSPACE_ROOT`.
- `title`: optional project title override.

The command returns JSON with the imported project, artifact, `/slide/<projectId>` route, full URL, source path, focused workspace path, and project `AGENTS.md` path for follow-up agent edits.

Example:

```bash
slide open --path ./deck.pptx --title "Quarterly Review"
```

## `slide create`

Creates a new presentation project. Inputs:

- `title`: optional project title.
- `artifact-type`: `deck` or `pptx`; defaults to `deck`.

The command returns the created project and artifact as JSON.
