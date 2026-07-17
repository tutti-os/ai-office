import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SlideArtifact, SlideProject } from "@ai-slide/shared";
import { ProjectPreparationError } from "@ai-app/shared/project-preparation";
import { materializeDeckProject, prepareProjectAgentFiles } from "./project-materialization.js";

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
