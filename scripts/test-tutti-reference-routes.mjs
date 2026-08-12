import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

await testDocReferencesUseBoundAndLegacyRoots();
await testSlideReferencesUseBoundAndLegacyRoots();

async function testDocReferencesUseBoundAndLegacyRoots() {
  const home = mkdtempSync(join(tmpdir(), "ai-doc-references-"));
  process.env.AI_DOC_HOME = home;
  delete process.env.TUTTI_APP_DATABASE_DIR;
  try {
    const [{ getDb }, { appPaths, clearProjectWorkspaceRootBindings }, { recordWorkspaceReference }, { registerTuttiReferenceRoutes }] = await Promise.all([
      import("../apps/doc/server/src/db/database.ts"),
      import("../apps/doc/server/src/local/paths.ts"),
      import("../apps/doc/server/src/tutti/workspace-reference-catalog.ts"),
      import("../apps/doc/server/src/tutti/reference-routes.ts"),
    ]);
    const now = new Date().toISOString();
    const boundRoot = join(home, "doc-bound-root");
    mkdirSync(join(boundRoot, "exports"), { recursive: true });
    const boundPath = join(boundRoot, "exports", "bound.html");
    writeFileSync(boundPath, "bound");
    getDb().prepare(`
      INSERT INTO projects (id, title, type, content, workspace_root, created_at, updated_at)
      VALUES (?, ?, 'html', '<p>bound</p>', ?, ?, ?)
    `).run("doc-bound", "Bound Doc", resolve(boundRoot), now, now);

    const singleFileRoot = join(home, "doc-single-file-root");
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
    getDb().prepare(`
      INSERT INTO projects (id, title, type, content, workspace_root, created_at, updated_at)
      VALUES (?, ?, 'html', '', ?, ?, ?)
    `).run("doc-invalid-root", "Invalid Root", resolve(home, "..", "outside-doc-root"), now, now);

    const orphanPath = join(appPaths.projectsDir, "orphan", "exports", "orphan.html");
    mkdirSync(join(appPaths.projectsDir, "orphan", "exports"), { recursive: true });
    writeFileSync(orphanPath, "orphan");

    const catalogPath = join(home, "custom-exports", "named.pdf");
    mkdirSync(join(home, "custom-exports"), { recursive: true });
    writeFileSync(catalogPath, "catalog");
    assert.ok(recordWorkspaceReference({
      projectId: "doc-bound",
      kind: "pdf",
      absolutePath: catalogPath,
      displayName: "Named document export",
      mimeType: "application/pdf",
    }));

    const routes = registerRoutes(registerTuttiReferenceRoutes);
    const bound = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-bound" });
    const single = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-single" });
    const legacy = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-legacy" });
    const invalid = await callRoute(routes, "/tutti/references/list", { parentGroupId: "doc-invalid-root" });
    assert.deepEqual(bound.items.map((item) => item.reference.displayName).sort(), ["Named document export", "bound.html"]);
    assert.ok(bound.items.some((item) => resolve(appPaths.root, item.reference.location.path) === resolve(boundPath)));
    assert.ok(bound.items.some((item) => resolve(appPaths.root, item.reference.location.path) === resolve(catalogPath)));
    assert.deepEqual(
      single.items.map((item) => resolve(appPaths.root, item.reference.location.path)).sort(),
      [resolve(singleFilePath), resolve(singleFileExportPath)].sort(),
    );
    assertReferencePath(legacy.items[0], appPaths.root, fallbackPath);
    assert.deepEqual(invalid.items, []);
    assertLocatorsStayWithinAppData([...bound.items, ...single.items, ...legacy.items]);
    const roots = await callRoute(routes, "/tutti/references/list", {});
    assert.deepEqual(roots.items.map((item) => item.id).sort(), ["doc-bound", "doc-invalid-root", "doc-legacy", "doc-single"]);
    assert.equal(roots.items.find((item) => item.id === "doc-invalid-root").referenceCount, 0);
    clearProjectWorkspaceRootBindings();
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

async function testSlideReferencesUseBoundAndLegacyRoots() {
  const home = mkdtempSync(join(tmpdir(), "ai-slide-references-"));
  process.env.AI_SLIDE_HOME = home;
  delete process.env.TUTTI_APP_DATABASE_DIR;
  try {
    const [
      { getDb },
      { appPaths, clearProjectWorkspaceRootBindings },
      { materializeDeckProject },
      { ProjectRepository },
      { ProjectService },
      { recordWorkspaceReference },
      { registerTuttiReferenceRoutes },
      { EventHub },
    ] = await Promise.all([
      import("../apps/slide/server/src/db/database.ts"),
      import("../apps/slide/server/src/local/paths.ts"),
      import("../apps/slide/server/src/artifact/project-materialization.ts"),
      import("../apps/slide/server/src/artifact/project-repository.ts"),
      import("../apps/slide/server/src/artifact/project-service.ts"),
      import("../apps/slide/server/src/tutti/workspace-reference-catalog.ts"),
      import("../apps/slide/server/src/tutti/reference-routes.ts"),
      import("../apps/slide/server/src/ws/event-hub.ts"),
    ]);
    const now = new Date().toISOString();
    const boundRoot = join(home, "slide-bound-root");
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

    getDb().prepare(`
      INSERT INTO projects (id, title, active_artifact_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("slide-no-export", "Deck Without Export", "slide-no-export-artifact", now, now);
    getDb().prepare(`
      INSERT INTO artifacts (id, project_id, type, file_ref, mime_type, created_at, updated_at)
      VALUES (?, ?, 'deck', 'deck.slides', 'text/html', ?, ?)
    `).run("slide-no-export-artifact", "slide-no-export", now, now);
    const repo = new ProjectRepository();
    const noExportProject = repo.getProject("slide-no-export");
    const noExportArtifact = repo.getArtifact("slide-no-export-artifact");
    assert.ok(noExportProject);
    assert.ok(noExportArtifact);
    await materializeDeckProject(
      join(appPaths.projectsDir, "slide-no-export"),
      noExportProject,
      noExportArtifact,
    );
    const service = new ProjectService(repo, new EventHub());
    const firstPublication = await service.publishDeckReferences();
    const secondPublication = await service.publishDeckReferences();
    assert.ok(firstPublication.published.includes("slide-no-export"));
    assert.ok(secondPublication.published.includes("slide-no-export"));
    await service.updateProject("slide-no-export", {
      title: "Renamed Deck",
      updatedBy: "human",
    });
    getDb().prepare(`
      INSERT INTO projects (id, title, workspace_root, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("slide-invalid-root", "Invalid Root", resolve(home, "..", "outside-slide-root"), now, now);

    const catalogPath = join(home, "custom-exports", "named.pdf");
    mkdirSync(join(home, "custom-exports"), { recursive: true });
    writeFileSync(catalogPath, "catalog");
    assert.ok(recordWorkspaceReference({
      projectId: "slide-bound",
      kind: "pdf",
      absolutePath: catalogPath,
      displayName: "Named slide export",
      mimeType: "application/pdf",
    }));

    const routes = registerRoutes(registerTuttiReferenceRoutes);
    const bound = await callRoute(routes, "/tutti/references/list", { parentGroupId: "slide-bound" });
    const legacy = await callRoute(routes, "/tutti/references/list", { parentGroupId: "slide-legacy" });
    const published = await callRoute(routes, "/tutti/references/list", { parentGroupId: "slide-no-export" });
    const invalid = await callRoute(routes, "/tutti/references/list", { parentGroupId: "slide-invalid-root" });
    assert.deepEqual(bound.items.map((item) => item.reference.displayName).sort(), ["Named slide export", "bound.pptx"]);
    assert.ok(bound.items.some((item) => resolve(appPaths.root, item.reference.location.path) === resolve(boundPath)));
    assert.ok(bound.items.some((item) => resolve(appPaths.root, item.reference.location.path) === resolve(catalogPath)));
    assertReferencePath(legacy.items[0], appPaths.root, fallbackPath);
    assert.equal(published.items.length, 1);
    assert.equal(published.items[0].reference.displayName, "Renamed Deck.html");
    assertReferencePath(
      published.items[0],
      appPaths.root,
      join(appPaths.projectsDir, "slide-no-export", "exports", "tutti-reference", "index.html"),
    );
    assert.deepEqual(invalid.items, []);
    assertLocatorsStayWithinAppData([...bound.items, ...legacy.items, ...published.items]);
    const roots = await callRoute(routes, "/tutti/references/list", {});
    assert.deepEqual(roots.items.map((item) => item.id).sort(), ["slide-bound", "slide-invalid-root", "slide-legacy", "slide-no-export"]);
    assert.equal(roots.items.find((item) => item.id === "slide-invalid-root").referenceCount, 0);
    assert.equal(roots.items.find((item) => item.id === "slide-no-export").referenceCount, 1);
    clearProjectWorkspaceRootBindings();
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

function assertReferencePath(item, appDataRoot, expectedPath) {
  assert.equal(item.type, "reference");
  assert.equal(item.reference.location.type, "app-data-relative");
  assert.equal(item.reference.location.path, referencePath(appDataRoot, expectedPath));
  assert.equal(resolve(appDataRoot, item.reference.location.path), resolve(expectedPath));
}

function referencePath(appDataRoot, absolutePath) {
  return relative(resolve(appDataRoot), resolve(absolutePath)).split("\\").join("/");
}

function assertLocatorsStayWithinAppData(items) {
  for (const item of items) {
    assert.ok(!item.reference.location.path.startsWith(".."), item.reference.location.path);
  }
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
