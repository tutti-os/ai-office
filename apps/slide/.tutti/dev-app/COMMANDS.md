# AI Slide Local Debug Commands

This local debug wrapper exposes the same `slide` CLI scope as the packaged AI Slide app.

- `slide status`: returns health, project counts, runtime provider counts, and Tutti CLI availability.
- `slide list-projects`: lists recent slide projects.
- `slide open`: imports a PPTX file and requests opening `/slide/<projectId>`.
- `slide create`: creates a new editable deck or PPTX presentation project.

The handlers are implemented by `apps/slide/server/src/tutti/cli-routes.ts`.
