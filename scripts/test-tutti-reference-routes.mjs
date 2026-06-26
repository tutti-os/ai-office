import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const now = new Date("2026-01-01T00:00:00.000Z").toISOString();

await testDocReferencesUseProjectTitle();
await testSlideReferencesUseProjectTitle();

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
    mkdirSync(join(appPaths.projectsDir, "doc-project-id", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "doc-project-id", "exports", "memo.pdf"), "pdf");

    await assertReferenceRoutes({
      registerTuttiReferenceRoutes,
      projectId: "doc-project-id",
      projectTitle: "Quarterly Strategy Memo",
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
    mkdirSync(join(appPaths.projectsDir, "slide-project-id", "exports"), { recursive: true });
    writeFileSync(join(appPaths.projectsDir, "slide-project-id", "exports", "deck.pdf"), "pdf");

    await assertReferenceRoutes({
      registerTuttiReferenceRoutes,
      projectId: "slide-project-id",
      projectTitle: "Board Readout Deck",
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

  const projectFilesBody = await callRoute(routes, "/tutti/references/list", { parentGroupId: input.projectId });
  assert.equal(projectFilesBody.items[0].reference.parentGroupLabel, input.projectTitle);

  const searchBody = await callRoute(routes, "/tutti/references/search", { query: "pdf" });
  assert.equal(searchBody.items[0].reference.parentGroupLabel, input.projectTitle);
}

async function callRoute(routes, route, body) {
  const handler = routes.get(route);
  assert.equal(typeof handler, "function", `Missing route ${route}`);
  return await handler({ body });
}
