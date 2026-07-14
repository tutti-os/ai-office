# AI Slide CLI Commands

Scope: `slide`

These commands expose AI Slide to Tutti apps and agents. Command outputs use `CliCommandOutput` envelopes.

## `slide status`

Return app health, project counts, Agent Target counts, and Tutti CLI availability for AI Slide.

Handler: `/tutti/cli/status`

## `slide projects list --limit`

List recent slide projects as JSON for agents and other Tutti apps.

Handler: `/tutti/cli/projects/list`

## `slide projects get --project-id <required>`

Return one slide project by project-id.

Handler: `/tutti/cli/projects/get`

## `slide projects open --project-id <required>`

Explicitly request Tutti to open one slide project in AI Slide. Use this only after the user confirms they want you to open the app directly; create, import, and agent-edit commands must not call it automatically.

Handler: `/tutti/cli/projects/open`

## `slide projects create --title --artifact-type --prompt --agent-id --provider`

Create a new AI Slide project, return an internal openTarget command, and optionally start app-owned async editing with prompt. This command must not open the app automatically. For user requests to make a PPT, slides, slide deck, or presentation without an explicit traditional Office file format, set artifact-type to deck. If the user explicitly asks for PPTX or traditional Office PowerPoint format, set artifact-type to pptx. Do not present localhost URLs or raw routes as final links. When the task is complete, tell the user they can view the result in AI Slide and ask whether they want you to open it directly; if they confirm, call slide projects open with the project-id. When a prompt starts app-owned editing, treat the returned run-id as the only writer for that project until it reaches a terminal status. Poll slide agent events by run-id until run.status is completed, failed, or cancelled; accepted/running means the app is still working. Do not inspect deck.slides and write fallback slide files while app-owned editing is accepted or running. If it is still running after several polls, report that generation is still in progress instead of creating content yourself.

Handler: `/tutti/cli/projects/create`

## `slide deck get --project-id <required> --slide-id --include-html`

Return the active deck manifest, slide ids, and local slide HTML paths. Pass slide-id to narrow to one slide, and include-html true to include slide HTML inline. PPTX artifacts return focused file metadata and guidance instead of deck HTML. To modify project content through CLI, start an app-owned edit with slide agent edit.

Handler: `/tutti/cli/deck/get`

## `slide slides get --project-id <required> --slide-id <required>`

Return one deck slide's HTML, metadata, and local path by slide-id. This is a read-only command. To modify project content through CLI, start an app-owned edit with slide agent edit.

Handler: `/tutti/cli/slides/get`

## `slide workspace get --project-id <required>`

Return local workspace paths, focused artifact paths, assets, exports, and guidance for one slide project in AI Slide. Local paths are for inspection; content modifications through CLI must trigger the app-owned agent run.

Handler: `/tutti/cli/workspace/get`

## `slide exports list --project-id <required>`

List files already exported from one slide project, including local paths, MIME types, sizes, and modification times.

Handler: `/tutti/cli/exports/list`

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

## `slide agent edit --project-id <required> --prompt <required> --session-id --mode --agent-id --provider`

Start an app-owned async agent edit for a slide project and return an internal openTarget command. External agents and other Tutti apps must use this command to modify slide content, then poll slide agent events until run.status is completed, failed, or cancelled. This command must not open the app automatically. After completion, tell the user they can view the result in AI Slide and ask whether they want you to open it directly; if they confirm, call slide projects open.

Handler: `/tutti/cli/agent/edit`

## `slide agent events --run-id <required>`

Return one agent run, its persisted events, and the internal project openTarget command by run-id. Use run.status as the source of truth: accepted/running are in-progress states, completed is success, and failed/cancelled are terminal failures. Empty event lists or reconnect/request-timeout status events are not failures by themselves. While a run is accepted or running, callers must not mutate the project workspace as a fallback writer. When run.status is completed, ask whether the user wants you to open the project directly; if they confirm, call slide projects open.

Handler: `/tutti/cli/agent/events`

## `slide agent cancel --run-id <required>`

Cancel an active agent run by run-id.

Handler: `/tutti/cli/agent/cancel`

## `slide officecli install`

Install or repair the managed OfficeCLI toolchain used for PPTX import, export, and agent editing.

Handler: `/tutti/cli/officecli/install`

## `slide open --path <required> --title`

Import a PPTX file into AI Slide and return workspace paths plus an internal openTarget command for the imported project. This command must not open the app automatically. Do not present localhost URLs or raw routes as final links. Ask whether the user wants you to open the project directly; if they confirm, call slide projects open with the project-id.

Handler: `/tutti/cli/open`
