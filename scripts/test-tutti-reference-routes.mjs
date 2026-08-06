import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

await testDocReferencesIgnorePrivateState();
await testSlideReferencesIgnorePrivateState();
await testSheetReferencesIgnorePrivateState();

async function testDocReferencesIgnorePrivateState() {
  const home = mkdtempSync(join(tmpdir(), "ai-doc-references-"));
  process.env.AI_DOC_HOME = home;
  process.env.TSH_WORKSPACE_APP = "1";
  try {
    const [{ getDb }, { appPaths }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/doc/server/src/db/database.ts"),
      import("../apps/doc/server/src/local/paths.ts"),
      import("../apps/doc/server/src/tutti/reference-routes.ts"),
    ]);
    getDb().prepare(`INSERT INTO projects (id, title, type, content, created_at, updated_at) VALUES (?, ?, 'html', '<p>private</p>', ?, ?)`).run("doc-private", "Private Doc", new Date().toISOString(), new Date().toISOString());
    mkdirSync(join(appPaths.projectsDir, "doc-private", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "doc-private", "exports", "private.html"), "private");
    await assertNoReferences(registerTuttiReferenceRoutes);
  } finally { rmSync(home, { force: true, recursive: true }); }
}

async function testSlideReferencesIgnorePrivateState() {
  const home = mkdtempSync(join(tmpdir(), "ai-slide-references-"));
  process.env.AI_SLIDE_HOME = home;
  try {
    const [{ getDb }, { appPaths }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/slide/server/src/db/database.ts"),
      import("../apps/slide/server/src/local/paths.ts"),
      import("../apps/slide/server/src/tutti/reference-routes.ts"),
    ]);
    getDb().prepare(`INSERT INTO projects (id, title, active_artifact_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run("slide-private", "Private Deck", "artifact", new Date().toISOString(), new Date().toISOString());
    mkdirSync(join(appPaths.projectsDir, "slide-private", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "slide-private", "exports", "private.pdf"), "private");
    await assertNoReferences(registerTuttiReferenceRoutes);
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
