import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const now = new Date("2026-01-01T00:00:00.000Z").toISOString();
const older = new Date("2025-12-31T00:00:00.000Z").toISOString();

await testDocReferencesUseProjectTitle();
await testSlideReferencesUseProjectTitle();
await testSheetReferencesUseProjectTitle();

async function testDocReferencesUseProjectTitle() {
  const home = mkdtempSync(join(tmpdir(), "ai-doc-references-"));
  process.env.AI_DOC_HOME = home;
  try {
    const [{ getDb }, { appPaths }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/doc/server/src/db/database.ts"),
      import("../apps/doc/server/src/local/paths.ts"),
      import("../apps/doc/server/src/tutti/reference-routes.ts"),
    ]);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, type, content, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, 'html', '<p>draft</p>', NULL, NULL, 'system', ?, ?)`,
      )
      .run("doc-project-id", "Quarterly Strategy Memo", now, now);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, type, content, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, 'html', '<p>old</p>', NULL, NULL, 'system', ?, ?)`,
      )
      .run("doc-archive-id", "Archive Document", older, older);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, type, content, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, 'markdown', '# Notes', NULL, NULL, 'system', ?, ?)`,
      )
      .run("doc-markdown-id", "Markdown Notes", older, older);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, type, content, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, 'docx', '{}', NULL, NULL, 'system', ?, ?)`,
      )
      .run("doc-docx-id", "Word Notes", older, older);
    mkdirSync(join(appPaths.projectsDir, "doc-project-id", "assets"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "doc-project-id", "exports"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "doc-archive-id", "exports"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "doc-markdown-id"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "doc-docx-id"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "document.html"), "<p>draft</p>");
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "document.md"), "# stale sibling");
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "assets", "source.png"), "png");
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "exports", "memo.pdf"), "pdf");
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "exports", "debug.json"), "{}");
    writeFileSync(join(appPaths.projectsDir, "doc-archive-id", "document.html"), "<p>old</p>");
    writeFileSync(join(appPaths.projectsDir, "doc-archive-id", "exports", "archive.pdf"), "pdf");
    writeFileSync(join(appPaths.projectsDir, "doc-markdown-id", "document.md"), "# Notes");
    writeFileSync(join(appPaths.projectsDir, "doc-markdown-id", "document.html"), "<p>stale sibling</p>");
    writeFileSync(join(appPaths.projectsDir, "doc-docx-id", "document.docx"), "docx");
    writeFileSync(join(appPaths.projectsDir, "doc-docx-id", "document.json"), "{}");

    await assertReferenceRoutes({
      registerTuttiReferenceRoutes,
      projectId: "doc-project-id",
      projectTitle: "Quarterly Strategy Memo",
      expectedPaths: ["projects/doc-project-id/document.html"],
      searchQuery: "Quarterly Strategy Memo",
      hiddenSearchQuery: "pdf",
    });

    const routes = registerRoutes(registerTuttiReferenceRoutes);
    const markdownFilesBody = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-markdown-id" });
    assert.deepEqual(referencePaths(markdownFilesBody), ["projects/doc-markdown-id/document.md"]);
    const docxFilesBody = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-docx-id" });
    assert.deepEqual(referencePaths(docxFilesBody), ["projects/doc-docx-id/document.docx"]);
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

async function testSlideReferencesUseProjectTitle() {
  const home = mkdtempSync(join(tmpdir(), "ai-slide-references-"));
  process.env.AI_SLIDE_HOME = home;
  try {
    const [{ getDb }, { appPaths }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/slide/server/src/db/database.ts"),
      import("../apps/slide/server/src/local/paths.ts"),
      import("../apps/slide/server/src/tutti/reference-routes.ts"),
    ]);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, active_artifact_id, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, 'artifact-id', NULL, NULL, 'system', ?, ?)`,
      )
      .run("slide-project-id", "Board Readout Deck", now, now);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, active_artifact_id, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, 'archive-artifact-id', NULL, NULL, 'system', ?, ?)`,
      )
      .run("slide-archive-id", "Archive Deck", older, older);
    getDb()
      .prepare(
        `INSERT INTO artifacts (id, project_id, type, file_ref, mime_type, revision, updated_by, created_at, updated_at)
         VALUES (?, ?, 'deck', 'deck.slides', 'application/vnd.ai-slide.deck', 1, 'system', ?, ?)`,
      )
      .run("artifact-id", "slide-project-id", now, now);
    getDb()
      .prepare(
        `INSERT INTO artifacts (id, project_id, type, file_ref, mime_type, revision, updated_by, created_at, updated_at)
         VALUES (?, ?, 'pptx', 'slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 1, 'system', ?, ?)`,
      )
      .run("archive-artifact-id", "slide-archive-id", older, older);
    mkdirSync(join(appPaths.projectsDir, "slide-project-id", "deck.slides", "slides"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "slide-project-id", "exports"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "slide-archive-id", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "deck.slides", "manifest.json"), JSON.stringify({
      slides: [
        { id: "slide-001", file: "slides/01-cover.html" },
        { id: "slide-002", file: "slides/02-results.html" },
      ],
    }));
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "deck.slides", "slides", "01-cover.html"), "<section></section>");
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "deck.slides", "slides", "02-results.html"), "<section></section>");
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "deck.slides", "slides", "99-orphan.html"), "<section></section>");
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "exports", "deck.pdf"), "pdf");
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "exports", "deck.html"), "<html></html>");
    writeFileSync(join(appPaths.projectsDir, "slide-archive-id", "slides.pptx"), "pptx");
    writeFileSync(join(appPaths.projectsDir, "slide-archive-id", "exports", "archive.pdf"), "pdf");

    await assertReferenceRoutes({
      registerTuttiReferenceRoutes,
      projectId: "slide-project-id",
      projectTitle: "Board Readout Deck",
      expectedPaths: [
        "projects/slide-project-id/deck.slides/slides/01-cover.html",
        "projects/slide-project-id/deck.slides/slides/02-results.html",
      ],
      searchQuery: "Board Readout Deck",
      hiddenSearchQuery: "pdf",
    });

    const routes = registerRoutes(registerTuttiReferenceRoutes);
    const pptxFilesBody = await callRoute(routes, "/tutti/references/list", { parentGroupId: "slide-archive-id" });
    assert.deepEqual(referencePaths(pptxFilesBody), ["projects/slide-archive-id/slides.pptx"]);
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

async function testSheetReferencesUseProjectTitle() {
  const home = mkdtempSync(join(tmpdir(), "ai-sheet-references-"));
  process.env.AI_SHEET_HOME = home;
  try {
    const [{ getDb }, { appPaths }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/sheet/server/src/db/database.ts"),
      import("../apps/sheet/server/src/local/paths.ts"),
      import("../apps/sheet/server/src/tutti/reference-routes.ts"),
    ]);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, active_artifact_id, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, 'artifact-id', NULL, NULL, 'system', ?, ?)`,
      )
      .run("sheet-project-id", "Revenue Forecast Workbook", now, now);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, active_artifact_id, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, 'archive-artifact-id', NULL, NULL, 'system', ?, ?)`,
      )
      .run("sheet-archive-id", "Archive Workbook", older, older);
    mkdirSync(join(appPaths.projectsDir, "sheet-project-id", "exports"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "sheet-archive-id", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "sheet-project-id", "workbook.xlsx"), "xlsx");
    writeFileSync(join(appPaths.projectsDir, "sheet-project-id", "exports", "forecast.xlsx"), "xlsx");
    writeFileSync(join(appPaths.projectsDir, "sheet-project-id", "exports", "forecast.csv"), "csv");
    writeFileSync(join(appPaths.projectsDir, "sheet-archive-id", "exports", "archive.xlsx"), "xlsx");

    await assertReferenceRoutes({
      registerTuttiReferenceRoutes,
      projectId: "sheet-project-id",
      projectTitle: "Revenue Forecast Workbook",
      expectedPaths: ["projects/sheet-project-id/exports/forecast.xlsx"],
      searchQuery: "forecast",
      hiddenSearchQuery: "workbook-source",
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

async function assertReferenceRoutes(input) {
  const routes = registerRoutes(input.registerTuttiReferenceRoutes);

  const groupsBody = await callRoute(routes, "/tutti/references/list", {});
  assert.equal(groupsBody.items[0].id, input.projectId);
  assert.equal(groupsBody.items[0].displayName, input.projectTitle);

  const groupByIdBody = await callRoute(routes, "/tutti/references/list", { filterText: input.projectId });
  assert.deepEqual(groupByIdBody.items.map((item) => item.id), [input.projectId]);

  const projectFilesBody = await callRoute(routes, "/tutti/references/list", { parentGroupId: input.projectId });
  assert.equal(projectFilesBody.items[0].reference.parentGroupLabel, input.projectTitle);
  assert.deepEqual(referencePaths(projectFilesBody), input.expectedPaths);

  const searchBody = await callRoute(routes, "/tutti/references/search", { query: input.searchQuery });
  assert.equal(searchBody.items[0].reference.parentGroupLabel, input.projectTitle);
  assert.deepEqual(referencePaths(searchBody).sort(), input.expectedPaths.slice().sort());

  const hiddenSearchBody = await callRoute(routes, "/tutti/references/search", { query: input.hiddenSearchQuery });
  assert.deepEqual(hiddenSearchBody.items, []);

  const projectIdSearchBody = await callRoute(routes, "/tutti/references/search", { query: input.projectId });
  assert.deepEqual(referencePaths(projectIdSearchBody).sort(), input.expectedPaths.slice().sort());

  const displayNameSearchBody = await callRoute(routes, "/tutti/references/search", { query: input.projectTitle });
  assert.deepEqual(referencePaths(displayNameSearchBody).sort(), input.expectedPaths.slice().sort());
}

function registerRoutes(registerTuttiReferenceRoutes) {
  const routes = new Map();
  registerTuttiReferenceRoutes({
    post(route, handler) {
      routes.set(route, handler);
    },
  });
  return routes;
}

function referencePaths(body) {
  return body.items.map((item) => item.reference.location.path);
}

async function callRoute(routes, route, body) {
  const handler = routes.get(route);
  assert.equal(typeof handler, "function", `Missing route ${route}`);
  return await handler({ body });
}
