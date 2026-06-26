# AI Slide CLI Commands

Scope: `slide`

These commands expose AI Slide to Tutti apps and agents. Command outputs use `CliCommandOutput` envelopes.

## `slide status`

Return app health, project counts, runtime provider counts, and Tutti CLI availability for AI Slide.

Handler: `/tutti/cli/status`

## `slide projects list --limit`

List recent slide projects as JSON for agents and other Tutti apps.

Handler: `/tutti/cli/projects/list`

## `slide projects get --project-id <required>`

Return one slide project by project-id.

Handler: `/tutti/cli/projects/get`

## `slide projects create --title --artifact-type --prompt --runtime-profile-id`

Create a new AI Slide project, request opening its app route through Tutti CLI, and optionally start the app-owned async agent with prompt. For user requests to make a PPT, slides, slide deck, or presentation without an explicit traditional Office file format, set artifact-type to deck. If the user explicitly asks for PPTX or traditional Office PowerPoint format, set artifact-type to pptx. Do not present localhost URLs as the final open target; use the app open result/route. When a prompt starts an agent run, treat the returned run as the only writer for that project until it reaches a terminal status. Poll slide agent events by run-id until run.status is completed, failed, or cancelled; accepted/running means the app is still working. Do not inspect deck.slides and write fallback slide files while the app run is accepted or running. If it is still running after several polls, report that generation is still in progress instead of creating content yourself.

Handler: `/tutti/cli/projects/create`

## `slide sessions list --project-id <required>`

List agent conversation sessions for a slide project.

Handler: `/tutti/cli/sessions/list`

## `slide sessions create --project-id <required> --title`

Create a new agent conversation session for a slide project.

Handler: `/tutti/cli/sessions/create`

## `slide messages list --project-id <required> --session-id <required>`

List messages in one agent conversation session.

Handler: `/tutti/cli/messages/list`

## `slide messages create --project-id <required> --session-id <required> --role <required> --content <required>`

Append a text-only user or assistant message to one conversation session.

Handler: `/tutti/cli/messages/create`

## `slide agent run --project-id <required> --prompt <required> --session-id --mode --runtime-profile-id`

Start an app-owned async agent run for a slide project. Pass session-id to attach messages to an existing session; otherwise the project default session is used. Poll events with slide agent events until run.status is completed, failed, or cancelled. accepted/running means the app is still working, including when events are temporarily empty or contain reconnect/request-timeout status messages. Do not inspect deck.slides and write fallback slide files while this run is accepted or running; report that generation is still in progress if it has not reached a terminal status.

Handler: `/tutti/cli/agent/run`

## `slide agent events --run-id <required>`

Return one agent run and its persisted events by run-id. Use run.status as the source of truth: accepted/running are in-progress states, completed is success, and failed/cancelled are terminal failures. Empty event lists or reconnect/request-timeout status events are not failures by themselves. While a run is accepted or running, callers must not mutate the project workspace as a fallback writer.

Handler: `/tutti/cli/agent/events`

## `slide agent cancel --run-id <required>`

Cancel an active agent run by run-id.

Handler: `/tutti/cli/agent/cancel`

## `slide officecli install`

Install or repair the managed OfficeCLI toolchain used for PPTX import, export, and agent editing.

Handler: `/tutti/cli/officecli/install`

## `slide open --path <required> --title`

Import a PPTX file into AI Slide, request opening its app route through Tutti CLI, and return workspace paths for agent editing. Do not present localhost URLs as the final open target; use the app open result/route.

Handler: `/tutti/cli/open`
