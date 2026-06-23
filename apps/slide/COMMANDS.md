# AI Slide Commands

AI Slide exposes the `slide` CLI scope to Tutti apps and agents.

## `slide status`

Returns app health, project count, runtime provider count, and whether `TUTTI_CLI` is available to the app runtime.

## `slide list-projects`

Lists recent slide projects. Optional input:

- `limit`: maximum number of rows to return.

## `slide create`

Creates a new presentation project. Inputs:

- `title`: optional project title.
- `artifact-type`: `deck` or `pptx`; defaults to `deck`.

The command returns the created project and artifact as JSON.
