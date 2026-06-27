# AI Artifact Apps

This monorepo hosts local AI artifact apps. `doc` and `slide` should stay structurally aligned so shared logic can move up without forcing domain code into packages too early.

Core constraints:

- The doc app lives in `apps/doc` and runs as a local server app through `apps/doc/tutti.app.json` and `apps/doc/bootstrap.sh`.
- The slide app lives in `apps/slide`.
- Each app should use the same internal shape:
  - `shared/src` for app-domain contracts and DTOs, published as `@ai-doc/shared` or `@ai-slide/shared`.
  - `server/src/artifact` for app-domain persistence and artifact orchestration.
  - `server/src/local` for app-local filesystem paths.
  - `web/src/app` for product screens and workflows.
  - `web/src/artifact` for artifact runtime/adapters/editing implementation.
  - `web/src/api` for client API bindings.
  - `templates` for local template source data and generated template assets. This directory is gitignored and must not be imported by web code directly.
- Template data must flow through server APIs. Web clients should call `/api/templates`; local servers read from `apps/{app}/templates` or env-configured roots, and future production servers can swap that provider for AWS/S3 without changing web code.
- Keep the rich document runtime HTML-first, with iframe-hosted editing.
- Use local ACP providers through `@tutti-os/agent-acp-kit` for Codex/Claude Code.
- Treat Markdown and DOCX as import/export boundaries, not the first rich-text runtime.
- Keep AI document edits structured around current HTML, selected content, selection path, and intent.
- Tutti CLI read commands may return simple text content directly, such as HTML or Markdown. For large, directory-backed, or binary artifacts such as DOCX, PPTX, slide decks, assets, and exports, CLI commands should return local workspace paths and enough metadata to guide agents to inspect the files with local tools.
- When an external agent or another Tutti app needs to modify AI Doc or AI Slide project content through CLI, the modification path must trigger the owning app's agent run instead of exposing raw content update commands. The app-owned agent is responsible for applying edits, refreshing workspace state, recording run events, and preserving app invariants.
- Do not add broad CLI commands such as `doc content update` or direct slide/deck mutation commands for external agents unless they are explicitly framed as app-agent orchestration commands. Deterministic non-content operations may exist only when they preserve the app's ownership of project state.
- Tutti CLI create, import, and agent-edit flows must not open AI Doc or AI Slide automatically. They should return a structured `openTarget` for the app route, and callers should present that as the final user-facing link/action after the task completes.
- Keep artifact domain code inside its owning app until there is proven cross-app reuse. Prefer app-local `shared`, `server/src/artifact`, and `web/src/artifact` over packages like `@ai-doc/artifact` or `@ai-slide/artifact`.
- Shared app infrastructure lives under `@ai-app/shared` subpaths: `types`, `local-paths`, `event-hub`, and `project-store`.
- Agent infrastructure lives under `@ai-app/agent` subpaths. Server code must import only server-safe subpaths such as `@ai-app/agent/runtime` and `@ai-app/agent/local-agent-runtime`.
- `@ai-app/agent/conversation-ui` depends on React and is frontend-only. Do not import `@ai-app/agent` package root from server code; use explicit subpaths to keep React out of server bundles.
- Tutti packaging utilities live in `@ai-app/tutti-packager`; app-specific package scripts should provide configuration and app branding only.
