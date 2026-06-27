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

## `doc projects create --title --type --prompt --provider`

Create a new AI Doc project, return an openTarget for the app route, and optionally start the app's agent with prompt. This command must not open the app automatically. Use prompt for generated document content; direct content input is not supported. For user requests to write a document, draft, article, report, or manuscript without an explicit file format, set type to html. If the user explicitly asks for DOCX or traditional Office Word format, set type to docx. Use markdown only when the user explicitly asks for Markdown. Do not present localhost URLs as the final open target; when the task is complete, include the returned openTarget as the final user-facing link/action. When a prompt starts app-owned editing, treat the returned run-id as the app-owned writer for that project and poll doc agent events until it reaches a terminal status.

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

## `doc agent edit --project-id <required> --prompt <required> --session-id --mode --provider`

Start an app-owned agent edit for a document project and return openTarget for the project. External agents and other Tutti apps must use this command to modify document content, then poll agent events until the run reaches a terminal status. This command must not open the app automatically; include openTarget as the final user-facing link/action only after the task is complete.

Handler: `/tutti/cli/agent/edit`

## `doc agent events --run-id <required>`

Return one agent run, its persisted events, and the project openTarget by run-id. When the run reaches completed, include openTarget as the final user-facing link/action.

Handler: `/tutti/cli/agent/events`

## `doc agent cancel --run-id <required>`

Cancel an active agent run by run-id.

Handler: `/tutti/cli/agent/cancel`

## `doc officecli install`

Install or repair the managed OfficeCLI toolchain used for DOCX import, export, and agent editing.

Handler: `/tutti/cli/officecli/install`

## `doc open --path <required> --title`

Import an HTML, Markdown, or DOCX file into AI Doc and return workspace paths plus openTarget for the imported project. This command must not open the app automatically. Do not present localhost URLs as the final open target; include openTarget as the final user-facing link/action when the user should open the project.

Handler: `/tutti/cli/open`
