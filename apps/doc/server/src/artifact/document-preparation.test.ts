import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DocumentProject } from "@ai-doc/shared";
import { ProjectPreparationError } from "@ai-app/shared/project-preparation";
import { materializeDocumentProjectCore, prepareDocumentAgentContext } from "./document-preparation.js";

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
