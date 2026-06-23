# AI Sheet Commands

AI Sheet exposes the `sheet` CLI scope to Tutti apps and agents.

## `sheet status`

Returns app health, project count, runtime provider count, and whether `TUTTI_CLI` is available to the app runtime.

## `sheet list-projects`

Lists recent workbook projects. Optional input:

- `limit`: maximum number of rows to return.

## `sheet create`

Creates a new workbook project by importing an existing XLSX file. Inputs:

- `path`: required path to an `.xlsx` file.
- `title`: optional project title.

The command returns the created project and artifact as JSON.
