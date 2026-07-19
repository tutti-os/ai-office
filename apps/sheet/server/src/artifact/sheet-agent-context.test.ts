import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SheetProject } from "@ai-sheet/shared";
import { AgentContextPreparationCoordinator } from "@ai-app/shared/project-preparation";
import { sheetAgentContextVersion, writeSheetProjectAgentInstructions } from "./sheet-repository.js";

test("ready v1 agent context is migrated to relative workbook instructions", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-sheet-context-migration-"));
  const now = "2026-07-19T00:00:00.000Z";
  const project: SheetProject = {
    id: "project-migration",
    title: "Workbook",
    activeArtifactId: "artifact-migration",
    templateId: null,
    templateName: null,
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  const oldVersion = "ai-sheet-agent-context-v1:0";
  let stored: { state: "ready" | "preparing" | "failed"; version: string | null } = { state: "ready", version: oldVersion };
  const coordinator = new AgentContextPreparationCoordinator({
    read: () => stored,
    markPreparing: (_projectId, version) => { stored = { state: "preparing", version }; },
    markReady: (_projectId, version) => { stored = { state: "ready", version }; },
    markFailed: (_projectId, version) => { stored = { state: "failed", version }; },
  });
  try {
    await writeFile(join(root, "AGENTS.md"), `Current focused file: ${join(root, "workbook.xlsx")}`);
    const nextVersion = `${sheetAgentContextVersion}:0`;
    await coordinator.ensure({
      projectId: project.id,
      version: nextVersion,
      prepare: () => writeSheetProjectAgentInstructions(root, project),
    });

    const instructions = await readFile(join(root, "AGENTS.md"), "utf8");
    assert.equal(stored.version, "ai-sheet-agent-context-v2:0");
    assert.notEqual(stored.version, oldVersion);
    assert.match(instructions, /Current focused file: workbook\.xlsx \(relative to this project directory\)\./);
    assert.doesNotMatch(instructions, new RegExp(escapeRegExp(root)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
