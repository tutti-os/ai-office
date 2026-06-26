# AI Doc Local Debug Commands

This local debug wrapper exposes the same `doc` CLI scope as the packaged AI Doc app.

- `doc status`: returns health, project counts, runtime provider counts, and Tutti CLI availability.
- `doc list-projects`: lists recent document projects.
- `doc open`: imports an HTML, Markdown, or DOCX file and requests opening `/doc/<projectId>`.
- `doc create`: creates a new HTML or Markdown document project.

The handlers are implemented by `apps/doc/server/src/tutti/cli-routes.ts`.
