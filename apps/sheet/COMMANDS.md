# AI Sheet Commands

AI Sheet exposes the `sheet` CLI scope to Tutti apps and agents.

Help:

- `sheet --help`: show the AI Sheet command list.
- `sheet open --help`: show inputs for opening an existing workbook file.

## `sheet status`

Returns app health, project count, runtime provider count, and whether `TUTTI_CLI` is available to the app runtime.

## `sheet list-projects`

Lists recent workbook projects. Optional input:

- `limit`: maximum number of rows to return.

## `sheet open`

Imports an XLSX file into AI Sheet. Inputs:

- `path`: absolute path, `~/...` path, or path relative to `AI_SHEET_WORKSPACE_ROOT` / `TUTTI_WORKSPACE_ROOT`.
- `title`: optional project title override.

The command returns JSON with the imported project, artifact, `/sheet/<projectId>` route, full URL, source path, focused workbook path, and project `AGENTS.md` path for follow-up agent edits.

Example:

```bash
sheet open --path ./workbook.xlsx --title "Model"
```

## `sheet create`

Creates a new workbook project by importing an existing XLSX file. Inputs:

- `path`: required path to an `.xlsx` file.
- `title`: optional project title.

This command is kept for compatibility. New agent integrations should prefer `sheet open` because it also returns the route and workspace paths needed for follow-up edits.
