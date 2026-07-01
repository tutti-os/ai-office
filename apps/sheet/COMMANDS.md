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

## `sheet projects open --project-id <required>`

Explicitly request Tutti to open one workbook project in AI Sheet. Use this only after the user confirms they want you to open the app directly; create, import, and agent-edit commands must not call it automatically.

Handler: `/tutti/cli/projects/open`

## `sheet projects create --title --prompt --provider`

Create a new AI Sheet workbook project, return an internal openTarget command, and optionally start app-owned async editing with prompt. This command must not open the app automatically. Do not present localhost URLs or raw routes as final links. When the task is complete, tell the user they can view the result in AI Sheet and ask whether they want you to open it directly; if they confirm, call sheet projects open with the project-id.

Handler: `/tutti/cli/projects/create`

## `sheet workbook get --project-id <required>`

Return one workbook project's current XLSX manifest and local workspace context. XLSX content is returned as a focused local file path instead of inline workbook data. To modify workbook content through CLI, start an app-owned edit with sheet agent edit.

Handler: `/tutti/cli/workbook/get`

## `sheet workspace get --project-id <required>`

Return local workspace paths, focused artifact paths, assets, exports, and guidance for one workbook project in AI Sheet. Local paths are for inspection; content modifications through CLI must trigger the app-owned agent run.

Handler: `/tutti/cli/workspace/get`

## `sheet exports list --project-id <required>`

List files already exported from one workbook project, including local paths, MIME types, sizes, and modification times.

Handler: `/tutti/cli/exports/list`

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

## `sheet agent edit --project-id <required> --prompt <required> --session-id --mode --provider`

Start an app-owned agent edit for a workbook project and return an internal openTarget command. External agents and other Tutti apps must use this command to modify workbook content, then poll agent events until the run reaches a terminal status. This command must not open the app automatically. After completion, tell the user they can view the result in AI Sheet and ask whether they want you to open it directly; if they confirm, call sheet projects open.

Handler: `/tutti/cli/agent/edit`

## `sheet agent events --run-id <required>`

Return one agent run, its persisted events, and the internal project openTarget command by run-id. When the run reaches completed, ask whether the user wants you to open the project directly; if they confirm, call sheet projects open.

Handler: `/tutti/cli/agent/events`

## `sheet agent cancel --run-id <required>`

Cancel an active agent run by run-id.

Handler: `/tutti/cli/agent/cancel`

## `sheet officecli install`

Install or repair the managed OfficeCLI toolchain used for XLSX import, export, and agent editing.

Handler: `/tutti/cli/officecli/install`

## `sheet open --path <required> --title`

Import an XLSX file into AI Sheet and return workspace paths plus an internal openTarget command for the imported project. This command must not open the app automatically. Do not present localhost URLs or raw routes as final links. Ask whether the user wants you to open the project directly; if they confirm, call sheet projects open with the project-id.

Handler: `/tutti/cli/open`
