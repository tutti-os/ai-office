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
         VALUES (?, ?, 'html', '<p>body</p>', NULL, NULL, 'system', ?, ?)`,
      )
      .run("doc-project-id", "Quarterly Strategy Memo", now, now);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, type, content, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, 'html', '<p>old</p>', NULL, NULL, 'system', ?, ?)`,
      )
      .run("doc-archive-id", "Archive Document", older, older);
    mkdirSync(join(appPaths.projectsDir, "doc-project-id", "assets"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "doc-project-id", "exports"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "doc-archive-id", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "document.html"), "<p>draft</p>");
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "assets", "source.png"), "png");
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "exports", "memo.pdf"), "pdf");
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "exports", "debug.json"), "{}");
    writeFileSync(join(appPaths.projectsDir, "doc-archive-id", "exports", "archive.pdf"), "pdf");

    await assertReferenceRoutes({
      registerTuttiReferenceRoutes,
      projectId: "doc-project-id",
      projectTitle: "Quarterly Strategy Memo",
      expectedPath: "projects/doc-project-id/exports/memo.pdf",
      searchQuery: "memo",
      hiddenSearchQuery: "source",
    });
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
    mkdirSync(join(appPaths.projectsDir, "slide-project-id", "deck.slides", "slides"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "slide-project-id", "exports"), { recursive: true });
    mkdirSync(join(appPaths.projectsDir, "slide-archive-id", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "slides.pptx"), "pptx");
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "deck.slides", "slides", "01-cover.html"), "<section></section>");
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "exports", "deck.pdf"), "pdf");
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "exports", "deck.html"), "<html></html>");
    writeFileSync(join(appPaths.projectsDir, "slide-archive-id", "exports", "archive.pdf"), "pdf");

    await assertReferenceRoutes({
      registerTuttiReferenceRoutes,
      projectId: "slide-project-id",
      projectTitle: "Board Readout Deck",
      expectedPath: "projects/slide-project-id/exports/deck.pdf",
      searchQuery: "deck.",
      hiddenSearchQuery: "cover",
    });
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
      expectedPath: "projects/sheet-project-id/exports/forecast.xlsx",
      searchQuery: "forecast",
      hiddenSearchQuery: "workbook-source",
    });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

async function assertReferenceRoutes(input) {
  const routes = new Map();
  input.registerTuttiReferenceRoutes({
    post(route, handler) {
      routes.set(route, handler);
    },
  });

  const groupsBody = await callRoute(routes, "/tutti/references/list", {});
  assert.equal(groupsBody.items[0].id, input.projectId);
  assert.equal(groupsBody.items[0].displayName, input.projectTitle);

  const groupByIdBody = await callRoute(routes, "/tutti/references/list", { filterText: input.projectId });
  assert.deepEqual(groupByIdBody.items.map((item) => item.id), [input.projectId]);

  const projectFilesBody = await callRoute(routes, "/tutti/references/list", { parentGroupId: input.projectId });
  assert.equal(projectFilesBody.items[0].reference.parentGroupLabel, input.projectTitle);
  assert.deepEqual(projectFilesBody.items.map((item) => item.reference.location.path), [input.expectedPath]);

  const searchBody = await callRoute(routes, "/tutti/references/search", { query: input.searchQuery });
  assert.equal(searchBody.items[0].reference.parentGroupLabel, input.projectTitle);
  assert.deepEqual(searchBody.items.map((item) => item.reference.location.path), [input.expectedPath]);

  const hiddenSearchBody = await callRoute(routes, "/tutti/references/search", { query: input.hiddenSearchQuery });
  assert.deepEqual(hiddenSearchBody.items, []);

  const projectIdSearchBody = await callRoute(routes, "/tutti/references/search", { query: input.projectId });
  assert.deepEqual(projectIdSearchBody.items.map((item) => item.reference.location.path), [input.expectedPath]);

  const displayNameSearchBody = await callRoute(routes, "/tutti/references/search", { query: input.projectTitle });
  assert.deepEqual(displayNameSearchBody.items.map((item) => item.reference.location.path), [input.expectedPath]);
}

async function callRoute(routes, route, body) {
  const handler = routes.get(route);
  assert.equal(typeof handler, "function", `Missing route ${route}`);
  return await handler({ body });
}
