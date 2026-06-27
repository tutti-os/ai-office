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

## `doc projects create --title --type --prompt`

Create a new AI Doc project, request opening its app route through Tutti CLI, and optionally start the app's agent with prompt. Use prompt for generated document content; direct content input is not supported. For user requests to write a document, draft, article, report, or manuscript without an explicit file format, set type to html. If the user explicitly asks for DOCX or traditional Office Word format, set type to docx. Use markdown only when the user explicitly asks for Markdown. Do not present localhost URLs as the final open target; use the app open result/route. When a prompt starts app-owned editing, treat the returned run-id as the app-owned writer for that project and poll doc agent events until it reaches a terminal status.

Handler: `/tutti/cli/projects/create`

## `doc content get --project-id <required>`

Return one document project's current content and local workspace context. HTML and Markdown projects return inline content. DOCX projects return the focused local file path and manifest instead of inline document text. The response also includes focused paths, assets, exports, and guidance. To modify project content through CLI, start an app-owned agent edit.

Handler: `/tutti/cli/content/get`

## `doc exports list --project-id <required>`

List files already exported from one document project, including local paths, MIME types, sizes, and modification times.

Handler: `/tutti/cli/exports/list`

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

## `doc agent edit --project-id <required> --prompt <required> --session-id --mode`

Start an app-owned agent edit for a document project. External agents and other Tutti apps must use this command to modify document content, then poll agent events until the run reaches a terminal status.

Handler: `/tutti/cli/agent/edit`

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

Import an HTML, Markdown, or DOCX file into AI Doc, request opening its app route through Tutti CLI, and return workspace paths for agent editing. Do not present localhost URLs as the final open target; use the app open result/route.

Handler: `/tutti/cli/open`
