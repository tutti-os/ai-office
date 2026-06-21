# AI Doc Commands

AI Doc exposes the `doc` CLI scope to Tutti apps and agents.

## `doc status`

Returns app health, project count, runtime provider count, and whether `TUTTI_CLI` is available to the app runtime.

## `doc list-projects`

Lists recent document projects. Optional input:

- `limit`: maximum number of rows to return.

## `doc create`

Creates a new document project. Inputs:

- `title`: optional project title.
- `type`: `html` or `markdown`; defaults to `html`.
- `content`: optional initial document content.

The command returns the created project as JSON.
