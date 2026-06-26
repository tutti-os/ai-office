# AI Doc CLI Commands

Scope: `doc`

These commands expose AI Doc to Tutti apps and agents. Command outputs use `CliCommandOutput` envelopes.

## `doc status`

Return app health, project counts, runtime provider counts, and Tutti CLI availability for AI Doc.

Handler: `/tutti/cli/status`

## `doc projects list --limit`

List recent document projects as JSON for agents and other Tutti apps.

Handler: `/tutti/cli/projects/list`

## `doc projects get --project-id <required>`

Return one document project by project-id.

Handler: `/tutti/cli/projects/get`

## `doc projects create --title --type --content --prompt --runtime-profile-id`

Create a new AI Doc project directly. Use type html, markdown, or docx; html is used when type is omitted. When prompt is provided, the app creates the project and starts an agent run to initialize or edit the document.

Handler: `/tutti/cli/projects/create`

## `doc sessions list --project-id <required>`

List agent conversation sessions for a document project.

Handler: `/tutti/cli/sessions/list`

## `doc sessions create --project-id <required> --title`

Create a new agent conversation session for a document project.

Handler: `/tutti/cli/sessions/create`

## `doc messages list --project-id <required> --session-id <required>`

List messages in one agent conversation session.

Handler: `/tutti/cli/messages/list`

## `doc messages create --project-id <required> --session-id <required> --role <required> --content <required>`

Append a text-only user or assistant message to one conversation session.

Handler: `/tutti/cli/messages/create`

## `doc agent run --project-id <required> --prompt <required> --session-id --mode --runtime-profile-id`

Start an agent run for a document project. Pass session-id to attach messages to an existing session; otherwise the project default session is used. Poll events with agent events.

Handler: `/tutti/cli/agent/run`

## `doc agent events --run-id <required>`

Return one agent run and its persisted events by run-id.

Handler: `/tutti/cli/agent/events`

## `doc agent cancel --run-id <required>`

Cancel an active agent run by run-id.

Handler: `/tutti/cli/agent/cancel`

## `doc officecli install`

Install or repair the managed OfficeCLI toolchain used for DOCX import, export, and agent editing.

Handler: `/tutti/cli/officecli/install`

## `doc open --path <required> --title`

Import an HTML, Markdown, or DOCX file into AI Doc, request opening its app route through Tutti CLI, and return workspace paths for agent editing.

Handler: `/tutti/cli/open`
