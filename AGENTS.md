# AI Document

This app follows the local server workspace-app shape used by `group-chat`.

Core constraints:

- Run as a local server app through `nextop.app.json` and `bootstrap.sh`.
- Keep the rich document runtime HTML-first, with iframe-hosted editing.
- Use local ACP providers through `@nextop-os/agent-acp-kit` for Codex/Claude Code.
- Treat Markdown and DOCX as import/export boundaries, not the first rich-text runtime.
- Keep AI document edits structured around current HTML, selected content, selection path, and intent.

