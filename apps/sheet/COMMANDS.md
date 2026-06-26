# AI Sheet CLI Commands

Scope: `sheet`

These commands expose AI Sheet to Tutti apps and agents. Command outputs use `CliCommandOutput` envelopes.

## `sheet status`

Return app health, project counts, runtime provider counts, and Tutti CLI availability for AI Sheet.

Handler: `/tutti/cli/status`

## `sheet projects list --limit`

List recent workbook projects as JSON for agents and other Tutti apps.

Handler: `/tutti/cli/projects/list`

## `sheet projects get --project-id <required>`

Return one workbook project by project-id.

Handler: `/tutti/cli/projects/get`

## `sheet projects create --title --prompt --runtime-profile-id`

Create a new AI Sheet workbook project directly, including a blank workbook.xlsx in the project workspace. When prompt is provided, the app creates the project and starts an agent run to initialize or edit the workbook.

Handler: `/tutti/cli/projects/create`

## `sheet sessions list --project-id <required>`

List agent conversation sessions for a workbook project.

Handler: `/tutti/cli/sessions/list`

## `sheet sessions create --project-id <required> --title`

Create a new agent conversation session for a workbook project.

Handler: `/tutti/cli/sessions/create`

## `sheet messages list --project-id <required> --session-id <required>`

List messages in one agent conversation session.

Handler: `/tutti/cli/messages/list`

## `sheet messages create --project-id <required> --session-id <required> --role <required> --content <required>`

Append a text-only user or assistant message to one conversation session.

Handler: `/tutti/cli/messages/create`

## `sheet agent run --project-id <required> --prompt <required> --session-id --mode --runtime-profile-id`

Start an agent run for a workbook project. Pass session-id to attach messages to an existing session; otherwise the project default session is used. Poll events with agent events.

Handler: `/tutti/cli/agent/run`

## `sheet agent events --run-id <required>`

Return one agent run and its persisted events by run-id.

Handler: `/tutti/cli/agent/events`

## `sheet agent cancel --run-id <required>`

Cancel an active agent run by run-id.

Handler: `/tutti/cli/agent/cancel`

## `sheet officecli install`

Install or repair the managed OfficeCLI toolchain used for XLSX import, export, and agent editing.

Handler: `/tutti/cli/officecli/install`

## `sheet open --path <required> --title`

Import an XLSX file into AI Sheet, request opening its app route through Tutti CLI, and return workspace paths for agent editing.

Handler: `/tutti/cli/open`
