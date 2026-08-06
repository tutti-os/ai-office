import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

await testDocReferencesUseAppDataRoot();
await testSlideReferencesUseAppDataRoot();
await testSheetReferencesIgnorePrivateState();

async function testDocReferencesUseAppDataRoot() {
  const home = mkdtempSync(join(tmpdir(), "ai-doc-references-"));
  process.env.AI_DOC_HOME = home;
  process.env.TSH_WORKSPACE_APP = "1";
  try {
    const [{ getDb }, { appPaths }, { recordWorkspaceReference }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/doc/server/src/db/database.ts"),
      import("../apps/doc/server/src/local/paths.ts"),
      import("../apps/doc/server/src/tutti/workspace-reference-catalog.ts"),
      import("../apps/doc/server/src/tutti/reference-routes.ts"),
    ]);
    getDb().prepare(`INSERT INTO projects (id, title, type, content, created_at, updated_at) VALUES (?, ?, 'html', '<p>private</p>', ?, ?)`).run("doc-private", "Private Doc", new Date().toISOString(), new Date().toISOString());
    const publicPath = join(appPaths.projectsDir, "doc-private", "exports", "public.html");
    mkdirSync(join(appPaths.projectsDir, "doc-private", "exports"), { recursive: true });
    writeFileSync(publicPath, "public");
    assert.equal(recordWorkspaceReference({
      projectId: "doc-private",
      kind: "html",
      absolutePath: publicPath,
      mimeType: "text/html",
    }), "projects/doc-private/exports/public.html");
    const privatePath = join(appPaths.databaseDir, "private.html");
    writeFileSync(privatePath, "private");
    assert.equal(recordWorkspaceReference({
      projectId: "doc-private",
      kind: "html",
      absolutePath: privatePath,
      mimeType: "text/html",
    }), null);
    const routes = registerRoutes(registerTuttiReferenceRoutes);
    const listed = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-private" });
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].reference.location.type, "app-data-relative");
    assert.equal(listed.items[0].reference.location.path, "projects/doc-private/exports/public.html");
  } finally { rmSync(home, { force: true, recursive: true }); }
}

async function testSlideReferencesUseAppDataRoot() {
  const home = mkdtempSync(join(tmpdir(), "ai-slide-references-"));
  process.env.AI_SLIDE_HOME = home;
  try {
    const [{ getDb }, { appPaths }, { recordWorkspaceReference }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/slide/server/src/db/database.ts"),
      import("../apps/slide/server/src/local/paths.ts"),
      import("../apps/slide/server/src/tutti/workspace-reference-catalog.ts"),
      import("../apps/slide/server/src/tutti/reference-routes.ts"),
    ]);
    getDb().prepare(`INSERT INTO projects (id, title, active_artifact_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run("slide-private", "Private Deck", "artifact", new Date().toISOString(), new Date().toISOString());
    const publicPath = join(appPaths.projectsDir, "slide-private", "exports", "public.pdf");
    mkdirSync(join(appPaths.projectsDir, "slide-private", "exports"), { recursive: true });
    writeFileSync(publicPath, "public");
    assert.equal(recordWorkspaceReference({
      projectId: "slide-private",
      kind: "pdf",
      absolutePath: publicPath,
      mimeType: "application/pdf",
    }), "projects/slide-private/exports/public.pdf");
    const privatePath = join(appPaths.databaseDir, "private.pdf");
    writeFileSync(privatePath, "private");
    assert.equal(recordWorkspaceReference({
      projectId: "slide-private",
      kind: "pdf",
      absolutePath: privatePath,
      mimeType: "application/pdf",
    }), null);
    const routes = registerRoutes(registerTuttiReferenceRoutes);
    const listed = await callRoute(routes, "/tutti/references/list", { parentGroupId: "slide-private" });
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].reference.location.type, "app-data-relative");
    assert.equal(listed.items[0].reference.location.path, "projects/slide-private/exports/public.pdf");
  } finally { rmSync(home, { force: true, recursive: true }); }
}

async function testSheetReferencesIgnorePrivateState() {
  const home = mkdtempSync(join(tmpdir(), "ai-sheet-references-"));
  process.env.AI_SHEET_HOME = home;
  try {
    const [{ getDb }, { appPaths }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/sheet/server/src/db/database.ts"),
      import("../apps/sheet/server/src/local/paths.ts"),
      import("../apps/sheet/server/src/tutti/reference-routes.ts"),
    ]);
    getDb().prepare(`INSERT INTO projects (id, title, active_artifact_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run("sheet-private", "Private Workbook", "artifact", new Date().toISOString(), new Date().toISOString());
    mkdirSync(join(appPaths.projectsDir, "sheet-private", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "sheet-private", "exports", "private.xlsx"), "private");
    await assertNoReferences(registerTuttiReferenceRoutes);
  } finally { rmSync(home, { force: true, recursive: true }); }
}

async function assertNoReferences(registerTuttiReferenceRoutes) {
  const routes = registerRoutes(registerTuttiReferenceRoutes);
  assert.deepEqual(await callRoute(routes, "/tutti/references/list", {}), { items: [], nextCursor: null });
  assert.deepEqual(await callRoute(routes, "/tutti/references/search", { query: "private" }), { items: [], nextCursor: null });
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
