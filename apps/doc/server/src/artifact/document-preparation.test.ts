import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DocumentProject } from "@ai-doc/shared";
import { AgentContextPreparationCoordinator, ProjectPreparationError } from "@ai-app/shared/project-preparation";
import {
  documentAgentContextVersion,
  materializeDocumentArtifactFile,
  materializeDocumentProjectCore,
  prepareDocumentAgentContext,
} from "./document-preparation.js";

test("TSH single-file materialize writes html next to a private sidecar root", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-doc-tsh-file-"));
  const privateRoot = join(root, "private");
  const artifactPath = join(root, "Quarterly_Plan-abcd1234.html");
  const project = documentProject("project-tsh-file");
  try {
    await materializeDocumentArtifactFile(artifactPath, privateRoot, project);
    assert.equal(await readFile(artifactPath, "utf8"), project.content);
    await assert.rejects(readFile(join(privateRoot, "document.html"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("TSH single-file docx materialize keeps private manifest and does not invent a binary", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-doc-tsh-docx-"));
  const privateRoot = join(root, "private");
  const artifactPath = join(root, "2026-08-06-abcd1234.docx");
  const now = "2026-08-06T00:00:00.000Z";
  const project: DocumentProject = {
    id: "project-tsh-docx",
    title: "Letter",
    type: "docx",
    content: JSON.stringify({
      kind: "docx",
      fileName: "document.docx",
      sha256: null,
      sizeBytes: 0,
      updatedAt: null,
    }),
    templateId: null,
    templateName: null,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await materializeDocumentArtifactFile(artifactPath, privateRoot, project);
    assert.equal(await readFile(join(privateRoot, "document.json"), "utf8"), project.content);
    await assert.rejects(readFile(artifactPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("core document stays usable when auxiliary AGENTS preparation fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-doc-preparation-"));
  const now = "2026-07-17T00:00:00.000Z";
  const project: DocumentProject = {
    id: "project-1",
    title: "Document",
    type: "html",
    content: "<article>Ready</article>",
    templateId: null,
    templateName: null,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await materializeDocumentProjectCore(root, project);
    await mkdir(join(root, "AGENTS.md"));
    await assert.rejects(
      prepareDocumentAgentContext(root, project),
      (error: ProjectPreparationError) => error.phase === "agent_instructions" && error.path === join(root, "AGENTS.md"),
    );
    assert.equal(await readFile(join(root, "document.html"), "utf8"), project.content);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ready v2 agent context is migrated to relative project instructions", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-doc-context-migration-"));
  const project = documentProject("project-migration");
  const oldVersion = "doc-agent-context-v2:html:0";
  let stored: { state: "ready" | "preparing" | "failed"; version: string | null } = { state: "ready", version: oldVersion };
  const coordinator = new AgentContextPreparationCoordinator({
    read: () => stored,
    markPreparing: (_projectId, version) => { stored = { state: "preparing", version }; },
    markReady: (_projectId, version) => { stored = { state: "ready", version }; },
    markFailed: (_projectId, version) => { stored = { state: "failed", version }; },
  });
  try {
    await writeFile(join(root, "AGENTS.md"), `Current focused file: ${join(root, "document.html")}`);
    const nextVersion = `${documentAgentContextVersion(project)}:0`;
    await coordinator.ensure({
      projectId: project.id,
      version: nextVersion,
      prepare: () => prepareDocumentAgentContext(root, project),
    });

    const instructions = await readFile(join(root, "AGENTS.md"), "utf8");
    assert.equal(stored.version, "doc-agent-context-v3:html:0");
    assert.notEqual(stored.version, oldVersion);
    assert.match(instructions, /Current focused file: document\.html \(relative to this project directory\)\./);
    assert.doesNotMatch(instructions, new RegExp(escapeRegExp(root)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function documentProject(id: string): DocumentProject {
  const now = "2026-07-19T00:00:00.000Z";
  return {
    id,
    title: "Document",
    type: "html",
    content: "<article>Ready</article>",
    templateId: null,
    templateName: null,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
