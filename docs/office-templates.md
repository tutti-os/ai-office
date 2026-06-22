# Office Templates Storage

Office templates are published as static assets behind CloudFront and S3. The
same layout is shared by document, slide, and future sheet templates so server
providers can switch from local files to CDN manifests without changing product
surface contracts.

## S3 Layout

Use the dedicated office templates bucket with an `office-templates` prefix:

```text
s3://tsh-office-templates/office-templates/
  doc/
    template.json
    templates/
      {templateId}/
        metadata.json
        source.json
        document.html
        screenshot.png
        assets/
          ...

  slide/
    template.json
    templates/
      {templateId}/
        metadata.json
        source.json
        deck.json or slides.json
        screenshot.png
        assets/
          ...

  sheet/
    template.json
    templates/
      {templateId}/
        metadata.json
        source.json
        workbook.json or sheet.json
        screenshot.png
        assets/
          ...
```

There is intentionally no top-level `office-templates/template.json`. Each app
owns its own `template.json` under the app type directory.

## Manifest Contract

Each `{type}/template.json` is the allowlist for that type. Templates may exist
under `templates/` without being exposed to users until they are included and
enabled in the manifest.

For doc templates, the first public manifest is curated rather than full-list.
The selected template ids live in
`apps/doc/scripts/office-template-selection.json`; the publish script stages the
local template files but writes only the selected ids into
`office-templates/doc/template.json`.

For slide templates, publishing selects up to five templates per category and
uploads only that selected set under `office-templates/slide/templates/`. The
allowlist is written to `office-templates/slide/template.json`.

Public CloudFront base URL:

```text
https://d2ddkmrpvnj1wf.cloudfront.net
```

Doc manifest URL:

```text
/office-templates/doc/template.json
```

Slide manifest URL:

```text
/office-templates/slide/template.json
```

Doc template URLs:

```text
/office-templates/doc/templates/{templateId}/metadata.json
/office-templates/doc/templates/{templateId}/source.json
/office-templates/doc/templates/{templateId}/document.html
/office-templates/doc/templates/{templateId}/screenshot.png
/office-templates/doc/templates/{templateId}/assets/{assetName}
```

Example manifest shape:

```json
{
  "schemaVersion": 1,
  "type": "doc",
  "updatedAt": "2026-06-21T00:00:00.000Z",
  "templates": [
    {
      "id": "016bab43-cd7d-4fe6-abc8-661886fe3347",
      "enabled": true,
      "name": "Growth Marketing Strategist Resume",
      "classification": "Career & Portfolio",
      "metadataUrl": "/office-templates/doc/templates/016bab43-cd7d-4fe6-abc8-661886fe3347/metadata.json",
      "sourceUrl": "/office-templates/doc/templates/016bab43-cd7d-4fe6-abc8-661886fe3347/source.json",
      "documentUrl": "/office-templates/doc/templates/016bab43-cd7d-4fe6-abc8-661886fe3347/document.html",
      "screenshotUrl": "/office-templates/doc/templates/016bab43-cd7d-4fe6-abc8-661886fe3347/screenshot.png",
      "screenshot": {
        "width": 900,
        "height": 1200
      }
    }
  ]
}
```

## Publishing Notes

- Keep local template source under `apps/{app}/templates`; web clients must not
  import it directly.
- Local development defaults to CloudFront-backed templates. Set
  `AI_DOC_TEMPLATE_PROVIDER=local` only when explicitly testing local template
  source files.
- Server providers should fetch the relevant `{type}/template.json` from
  CloudFront for library display, then fetch individual template files by URL
  only when a user creates a project from a template.
- Template HTML must keep same-template relative asset references such as
  `./assets/photo.jpg`. When a doc template enters the workspace, the server
  downloads/copies those assets into the project's own `assets/` directory; from
  that point on it is project data, not template data.
- `template.json` is the availability gate. It should include only templates
  that are ready for users.
- Prefer relative CDN-root URLs in manifests, then combine them with the
  configured CloudFront base URL in server code.
- CloudFront should point at the dedicated office templates bucket. The
  distribution and bucket access policy are managed separately from this storage
  layout.
- Published `template.json` uses `Cache-Control: max-age=60, must-revalidate`.
  After 60 seconds, CloudFront can revalidate with S3 and start a fresh strong
  cache window. Use `pnpm --filter @ai-doc/app publish:office-templates --
  --invalidate` when an immediate manifest refresh is required.
- The doc manifest is currently curated to five representative templates per
  category: Business, Career & Portfolio, Education, Legal & Forms, Marketing,
  and Reports & Analysis.
