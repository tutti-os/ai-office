import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SlideArtifact, SlideProject } from "@ai-slide/shared";
import { AgentContextPreparationCoordinator, ProjectPreparationError } from "@ai-app/shared/project-preparation";
import { materializeDeckProject, materializeTemplateDeckSource, prepareProjectAgentFiles, projectAgentInstructionsVersion, writeProjectAgentInstructions } from "./project-materialization.js";

test("core deck stays usable when auxiliary agent context preparation fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-slide-preparation-"));
  const now = "2026-07-17T00:00:00.000Z";
  const project: SlideProject = {
    id: "project-1",
    title: "Deck",
    activeArtifactId: "artifact-1",
    artifactType: "deck",
    templateId: null,
    templateName: null,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  const artifact: SlideArtifact = {
    id: "artifact-1",
    projectId: project.id,
    type: "deck",
    fileRef: "deck.slides",
    mimeType: "application/vnd.tutti.slide-deck+json",
    revision: 1,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await materializeDeckProject(root, project, artifact);
    await mkdir(join(root, "AGENTS.md"));
    await assert.rejects(
      prepareProjectAgentFiles(root, project, artifact),
      (error: ProjectPreparationError) => error.phase === "agent_instructions" && error.path === join(root, "AGENTS.md"),
    );
    const manifest = JSON.parse(await readFile(join(root, artifact.fileRef, "manifest.json"), "utf8")) as { slides: unknown[] };
    assert.equal(manifest.slides.length, 1);
    assert.match(await readFile(join(root, artifact.fileRef, "slides", "01-cover.html"), "utf8"), /<section/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deck materialization repairs a partial FabricFS core without replacing existing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-slide-core-recovery-"));
  const now = "2026-07-18T00:00:00.000Z";
  const project: SlideProject = {
    id: "project-recovery",
    title: "Recovered Deck",
    activeArtifactId: "artifact-recovery",
    artifactType: "deck",
    templateId: null,
    templateName: null,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  const artifact: SlideArtifact = {
    id: "artifact-recovery",
    projectId: project.id,
    type: "deck",
    fileRef: "deck.slides",
    mimeType: "application/vnd.tutti.slide-deck+json",
    revision: 1,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await materializeDeckProject(root, project, artifact);
    const deckRoot = join(root, artifact.fileRef);
    const manifest = JSON.parse(await readFile(join(deckRoot, "manifest.json"), "utf8")) as { title: string; slides: unknown[] };
    await rm(join(deckRoot, "assets", "styles.css"));
    await writeFile(join(deckRoot, "slides", "01-cover.html"), "");
    await materializeDeckProject(root, project, artifact);
    assert.deepEqual(
      JSON.parse(await readFile(join(deckRoot, "manifest.json"), "utf8")) as { title: string; slides: unknown[] },
      manifest,
    );
    assert.match(await readFile(join(deckRoot, "assets", "styles.css"), "utf8"), /font-family/);
    assert.match(await readFile(join(deckRoot, "slides", "01-cover.html"), "utf8"), /<section/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("template materialization restores a missing file without deleting its completed deck", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-slide-template-recovery-"));
  const now = "2026-07-18T00:00:00.000Z";
  const project: SlideProject = {
    id: "project-template",
    title: "Template Deck",
    activeArtifactId: "artifact-template",
    artifactType: "deck",
    templateId: "template-1",
    templateName: "Template",
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  const source = {
    title: "Template",
    canvas: { width: 1920, height: 1080 },
    slides: [{ fileName: "01-cover.html", html: "<section>Template</section>" }],
    assets: [{ path: "images/hero.txt", bytes: Buffer.from("hero") }],
  };
  const deckRoot = join(root, "deck.slides");
  try {
    await materializeTemplateDeckSource(deckRoot, project, source);
    const manifest = JSON.parse(await readFile(join(deckRoot, "manifest.json"), "utf8")) as { title: string; slides: unknown[] };
    await rm(join(deckRoot, "slides", "01-cover.html"));
    await materializeTemplateDeckSource(deckRoot, project, source);
    const repairedManifest = JSON.parse(await readFile(join(deckRoot, "manifest.json"), "utf8")) as { title: string; slides: unknown[] };
    assert.equal(repairedManifest.title, manifest.title);
    assert.deepEqual(repairedManifest.slides, manifest.slides);
    assert.equal(await readFile(join(deckRoot, "slides", "01-cover.html"), "utf8"), source.slides[0]!.html);
    assert.equal(await readFile(join(deckRoot, "assets", "images", "hero.txt"), "utf8"), "hero");

    // Recovery is allowed to fill in missing files, but it must never replace
    // edits that have already been persisted for this project.
    await writeFile(join(deckRoot, "slides", "01-cover.html"), "<section>User edit</section>");
    await writeFile(join(deckRoot, "assets", "images", "hero.txt"), "user asset");
    await materializeTemplateDeckSource(deckRoot, project, source);
    assert.equal(await readFile(join(deckRoot, "slides", "01-cover.html"), "utf8"), "<section>User edit</section>");
    assert.equal(await readFile(join(deckRoot, "assets", "images", "hero.txt"), "utf8"), "user asset");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ready v2 agent context is migrated to relative deck instructions", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-slide-context-migration-"));
  const now = "2026-07-19T00:00:00.000Z";
  const project: SlideProject = {
    id: "project-migration",
    title: "Deck",
    activeArtifactId: "artifact-migration",
    artifactType: "deck",
    templateId: null,
    templateName: null,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  const artifact: SlideArtifact = {
    id: "artifact-migration",
    projectId: project.id,
    type: "deck",
    fileRef: "deck.slides",
    mimeType: "application/vnd.tutti.slide-deck+json",
    revision: 1,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  const oldVersion = "slide-agent-context-v2::artifact-migration:deck:deck.slides:0";
  let stored: { state: "ready" | "preparing" | "failed"; version: string | null } = { state: "ready", version: oldVersion };
  const coordinator = new AgentContextPreparationCoordinator({
    read: () => stored,
    markPreparing: (_projectId, version) => { stored = { state: "preparing", version }; },
    markReady: (_projectId, version) => { stored = { state: "ready", version }; },
    markFailed: (_projectId, version) => { stored = { state: "failed", version }; },
  });
  try {
    await writeFile(join(root, "AGENTS.md"), `Current focused directory: ${join(root, artifact.fileRef)}`);
    const nextVersion = `${projectAgentInstructionsVersion(project, artifact)}:0`;
    await coordinator.ensure({
      projectId: project.id,
      version: nextVersion,
      prepare: () => writeProjectAgentInstructions(root, artifact),
    });

    const instructions = await readFile(join(root, "AGENTS.md"), "utf8");
    assert.equal(stored.version, "slide-agent-context-v3::artifact-migration:deck:deck.slides:0");
    assert.notEqual(stored.version, oldVersion);
    assert.match(instructions, /Current focused directory: deck\.slides \(relative to this project directory\)\./);
    assert.doesNotMatch(instructions, new RegExp(escapeRegExp(root)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
