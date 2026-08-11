import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

await testDocReferencesUseBoundAndLegacyRoots();
await testSlideReferencesUseBoundAndLegacyRoots();
await testSheetReferencesUseRepositoryProjectsAndLegacyRoot();

async function testDocReferencesUseBoundAndLegacyRoots() {
  const home = mkdtempSync(join(tmpdir(), "ai-doc-references-"));
  process.env.AI_DOC_HOME = home;
  delete process.env.TUTTI_APP_DATABASE_DIR;
  try {
    const [{ getDb }, { appPaths, clearProjectWorkspaceRootBindings }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/doc/server/src/db/database.ts"),
      import("../apps/doc/server/src/local/paths.ts"),
      import("../apps/doc/server/src/tutti/reference-routes.ts"),
    ]);
    const now = new Date().toISOString();
    const boundRoot = mkdtempSync(join(tmpdir(), "ai-doc-bound-root-"));
    mkdirSync(join(boundRoot, "exports"), { recursive: true });
    const boundPath = join(boundRoot, "exports", "bound.html");
    writeFileSync(boundPath, "bound");
    getDb().prepare(`
      INSERT INTO projects (id, title, type, content, workspace_root, created_at, updated_at)
      VALUES (?, ?, 'html', '<p>bound</p>', ?, ?, ?)
    `).run("doc-bound", "Bound Doc", resolve(boundRoot), now, now);

    const singleFileRoot = mkdtempSync(join(tmpdir(), "ai-doc-single-file-root-"));
    const singleFilePath = join(singleFileRoot, "single.docx");
    const singleFileExportPath = join(singleFileRoot, "exports", "single.pdf");
    mkdirSync(join(singleFileRoot, "exports"), { recursive: true });
    writeFileSync(singleFilePath, "docx");
    writeFileSync(singleFileExportPath, "pdf");
    getDb().prepare(`
      INSERT INTO projects (id, title, type, content, workspace_root, created_at, updated_at)
      VALUES (?, ?, 'docx', '', ?, ?, ?)
    `).run("doc-single", "Single-file Doc", resolve(singleFilePath), now, now);

    const fallbackPath = join(appPaths.projectsDir, "doc-legacy", "exports", "legacy.md");
    mkdirSync(join(appPaths.projectsDir, "doc-legacy", "exports"), { recursive: true });
    writeFileSync(fallbackPath, "legacy");
    getDb().prepare(`
      INSERT INTO projects (id, title, type, content, created_at, updated_at)
      VALUES (?, ?, 'markdown', '# legacy', ?, ?)
    `).run("doc-legacy", "Legacy Doc", now, now);

    const orphanPath = join(appPaths.projectsDir, "orphan", "exports", "orphan.html");
    mkdirSync(join(appPaths.projectsDir, "orphan", "exports"), { recursive: true });
    writeFileSync(orphanPath, "orphan");

    const routes = registerRoutes(registerTuttiReferenceRoutes);
    const bound = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-bound" });
    const single = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-single" });
    const legacy = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-legacy" });
    assertReferencePath(bound.items[0], boundPath);
    assert.deepEqual(
      single.items.map((item) => item.reference.location.path).sort(),
      [resolve(singleFilePath), resolve(singleFileExportPath)].sort(),
    );
    assertReferencePath(legacy.items[0], fallbackPath);
    const roots = await callRoute(routes, "/tutti/references/list", {});
    assert.deepEqual(roots.items.map((item) => item.id).sort(), ["doc-bound", "doc-legacy", "doc-single"]);
    clearProjectWorkspaceRootBindings();
    rmSync(boundRoot, { force: true, recursive: true });
    rmSync(singleFileRoot, { force: true, recursive: true });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

async function testSlideReferencesUseBoundAndLegacyRoots() {
  const home = mkdtempSync(join(tmpdir(), "ai-slide-references-"));
  process.env.AI_SLIDE_HOME = home;
  delete process.env.TUTTI_APP_DATABASE_DIR;
  try {
    const [{ getDb }, { appPaths, clearProjectWorkspaceRootBindings }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/slide/server/src/db/database.ts"),
      import("../apps/slide/server/src/local/paths.ts"),
      import("../apps/slide/server/src/tutti/reference-routes.ts"),
    ]);
    const now = new Date().toISOString();
    const boundRoot = mkdtempSync(join(tmpdir(), "ai-slide-bound-root-"));
    mkdirSync(join(boundRoot, "exports"), { recursive: true });
    const boundPath = join(boundRoot, "exports", "bound.pptx");
    writeFileSync(boundPath, "bound");
    getDb().prepare(`
      INSERT INTO projects (id, title, active_artifact_id, workspace_root, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("slide-bound", "Bound Deck", "slide-bound-artifact", resolve(boundRoot), now, now);
    getDb().prepare(`
      INSERT INTO artifacts (id, project_id, type, file_ref, mime_type, created_at, updated_at)
      VALUES (?, ?, 'pptx', 'slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ?, ?)
    `).run("slide-bound-artifact", "slide-bound", now, now);

    const fallbackPath = join(appPaths.projectsDir, "slide-legacy", "exports", "legacy", "index.html");
    mkdirSync(join(appPaths.projectsDir, "slide-legacy", "exports", "legacy"), { recursive: true });
    writeFileSync(fallbackPath, "legacy");
    getDb().prepare(`
      INSERT INTO projects (id, title, active_artifact_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("slide-legacy", "Legacy Deck", "slide-legacy-artifact", now, now);
    getDb().prepare(`
      INSERT INTO artifacts (id, project_id, type, file_ref, mime_type, created_at, updated_at)
      VALUES (?, ?, 'deck', 'deck', 'text/html', ?, ?)
    `).run("slide-legacy-artifact", "slide-legacy", now, now);

    const routes = registerRoutes(registerTuttiReferenceRoutes);
    const bound = await callRoute(routes, "/tutti/references/list", { parentGroupId: "slide-bound" });
    const legacy = await callRoute(routes, "/tutti/references/list", { parentGroupId: "slide-legacy" });
    assertReferencePath(bound.items[0], boundPath);
    assertReferencePath(legacy.items[0], fallbackPath);
    const roots = await callRoute(routes, "/tutti/references/list", {});
    assert.deepEqual(roots.items.map((item) => item.id).sort(), ["slide-bound", "slide-legacy"]);
    clearProjectWorkspaceRootBindings();
    rmSync(boundRoot, { force: true, recursive: true });
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

async function testSheetReferencesUseRepositoryProjectsAndLegacyRoot() {
  const home = mkdtempSync(join(tmpdir(), "ai-sheet-references-"));
  process.env.AI_SHEET_HOME = home;
  delete process.env.TUTTI_APP_DATABASE_DIR;
  try {
    const [{ getDb }, { appPaths, projectWorkspaceRoot }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/sheet/server/src/db/database.ts"),
      import("../apps/sheet/server/src/local/paths.ts"),
      import("../apps/sheet/server/src/tutti/reference-routes.ts"),
    ]);
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO projects (id, title, active_artifact_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("sheet-legacy", "Legacy Workbook", "sheet-legacy-artifact", now, now);
    getDb().prepare(`
      INSERT INTO artifacts (id, project_id, type, file_ref, mime_type, created_at, updated_at)
      VALUES (?, ?, 'xlsx', 'workbook.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ?, ?)
    `).run("sheet-legacy-artifact", "sheet-legacy", now, now);
    const root = projectWorkspaceRoot("sheet-legacy");
    mkdirSync(join(root, "exports"), { recursive: true });
    const workbookPath = join(root, "workbook.xlsx");
    writeFileSync(workbookPath, "workbook");
    const exportPath = join(root, "exports", "legacy.xlsx");
    writeFileSync(exportPath, "export");
    mkdirSync(join(appPaths.projectsDir, "orphan", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "orphan", "exports", "orphan.xlsx"), "orphan");

    const routes = registerRoutes(registerTuttiReferenceRoutes);
    const listed = await callRoute(routes, "/tutti/references/list", { parentGroupId: "sheet-legacy" });
    assert.equal(listed.items.length, 1);
    for (const item of listed.items) assert.equal(item.reference.location.type, "workspace-path");
    assert.ok(listed.items.some((item) => item.reference.location.path === resolve(exportPath)));
    const roots = await callRoute(routes, "/tutti/references/list", {});
    assert.deepEqual(roots.items.map((item) => item.id), ["sheet-legacy"]);
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

function assertReferencePath(item, expectedPath) {
  assert.equal(item.type, "reference");
  assert.equal(item.reference.location.type, "workspace-path");
  assert.equal(item.reference.location.path, resolve(expectedPath));
}

function registerRoutes(registerTuttiReferenceRoutes) {
  const routes = new Map();
  registerTuttiReferenceRoutes({ post(route, handler) { routes.set(route, handler); } });
  return routes;
}

async function callRoute(routes, route, body) {
  const handler = routes.get(route);
  assert.equal(typeof handler, "function", `Missing route ${route}`);
  return await handler({ body });
}
