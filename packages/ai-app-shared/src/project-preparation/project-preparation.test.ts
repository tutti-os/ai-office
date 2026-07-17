import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import test from "node:test";
import { AgentContextPreparationCoordinator, ProjectPreparationError, SqliteProjectPreparationCoordinator, type AgentContextPreparationState } from "./index.js";

test("agent context preparation is singleflight per project and version", async () => {
  let calls = 0;
  let release!: () => void;
  const state: { state: AgentContextPreparationState; version: string | null } = { state: "pending", version: null };
  const coordinator = new AgentContextPreparationCoordinator({
    read: () => state,
    markPreparing: (_id, version) => { Object.assign(state, { state: "preparing", version }); },
    markReady: (_id, version) => { Object.assign(state, { state: "ready", version }); },
    markFailed: () => undefined,
  });
  const request = {
    projectId: "project-1",
    version: "v1",
    prepare: async () => {
      calls += 1;
      await new Promise<void>((resolve) => { release = resolve; });
    },
  };
  const first = coordinator.ensure(request);
  const second = coordinator.ensure(request);
  while (calls === 0) await Promise.resolve();
  assert.equal(calls, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test("a newer preparation version waits for and supersedes the in-flight version", async () => {
  let releaseFirst!: () => void;
  const calls: string[] = [];
  const state: { state: AgentContextPreparationState; version: string | null } = { state: "pending", version: null };
  const coordinator = new AgentContextPreparationCoordinator({
    read: () => state,
    markPreparing: (_id, version) => { Object.assign(state, { state: "preparing", version }); },
    markReady: (_id, version) => { Object.assign(state, { state: "ready", version }); },
    markFailed: () => undefined,
  });
  const first = coordinator.ensure({
    projectId: "project-1",
    version: "v1",
    prepare: async () => {
      calls.push("v1:start");
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      calls.push("v1:end");
    },
  });
  while (calls.length === 0) await Promise.resolve();
  const second = coordinator.ensure({
    projectId: "project-1",
    version: "v2",
    prepare: async () => { calls.push("v2"); },
  });
  const secondJoin = coordinator.ensure({
    projectId: "project-1",
    version: "v2",
    prepare: async () => { calls.push("v2:duplicate"); },
  });
  releaseFirst();
  await Promise.all([first, second, secondJoin]);
  assert.deepEqual(calls, ["v1:start", "v1:end", "v2"]);
  assert.deepEqual(state, { state: "ready", version: "v2" });
});

test("agent context preparation retries transient errors and preserves terminal diagnostics", async () => {
  let calls = 0;
  let failure: unknown;
  const coordinator = new AgentContextPreparationCoordinator({
    read: () => null,
    markPreparing: () => undefined,
    markReady: () => undefined,
    markFailed: (_id, _version, value) => { failure = value; },
  }, { retryDelaysMs: [0], sleep: async () => undefined });
  await assert.rejects(
    coordinator.ensure({
      projectId: "project-1",
      version: "v1",
      prepare: async () => {
        calls += 1;
        throw new ProjectPreparationError({ phase: "agents_write", path: "AGENTS.md", code: "EACCES", message: "denied" });
      },
    }),
    (error: ProjectPreparationError) => error.phase === "agents_write" && error.path === "AGENTS.md" && error.code === "EACCES",
  );
  assert.equal(calls, 2);
  assert.deepEqual(
    failure && {
      phase: (failure as ProjectPreparationError).phase,
      path: (failure as ProjectPreparationError).path,
      code: (failure as ProjectPreparationError).code,
      message: (failure as ProjectPreparationError).message,
    },
    { phase: "agents_write", path: "AGENTS.md", code: "EACCES", message: "denied" },
  );
});

test("sqlite preparation refuses agent context while the project core is not ready", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE project_preparation (
      project_id TEXT PRIMARY KEY, core_state TEXT NOT NULL, agent_context_state TEXT NOT NULL,
      agent_context_generation INTEGER NOT NULL DEFAULT 0, agent_context_version TEXT,
      last_error_phase TEXT, last_error_path TEXT, last_error_code TEXT, last_error_message TEXT,
      updated_at TEXT NOT NULL
    );
    INSERT INTO project_preparation (project_id, core_state, agent_context_state, updated_at)
    VALUES ('project-1', 'failed', 'pending', '2026-07-17T00:00:00.000Z');
  `);
  const coordinator = new SqliteProjectPreparationCoordinator(() => db, "test");
  let prepared = false;
  assert.throws(
    () => coordinator.ensureAgentContext({
      projectId: "project-1",
      baseVersion: "v1",
      prepare: async () => { prepared = true; },
    }),
    (error: ProjectPreparationError) => error.code === "CORE_PREPARATION_FAILED",
  );
  assert.equal(prepared, false);
});
