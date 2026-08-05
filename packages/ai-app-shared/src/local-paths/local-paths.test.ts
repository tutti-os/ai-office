import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { resolve } from "node:path";
import {
  createAppPaths,
  privateProjectsParentDir,
  projectLocalAgentStateRoot,
  projectPrivateStateRoot,
} from "./index.js";

const originalDatabaseDir = process.env.TUTTI_APP_DATABASE_DIR;
const originalHome = process.env.TEST_APP_HOME;

afterEach(() => {
  if (originalDatabaseDir === undefined) delete process.env.TUTTI_APP_DATABASE_DIR;
  else process.env.TUTTI_APP_DATABASE_DIR = originalDatabaseDir;
  if (originalHome === undefined) delete process.env.TEST_APP_HOME;
  else process.env.TEST_APP_HOME = originalHome;
});

test("keeps private project state under the injected database directory", () => {
  process.env.TEST_APP_HOME = "/workspace/.tsh/apps/data/install-1";
  process.env.TUTTI_APP_DATABASE_DIR = "/var/lib/tutti-app/databases/install-1";

  const paths = createAppPaths({
    homeEnvVar: "TEST_APP_HOME",
    defaultHomeDirName: ".test-app",
    dbFileName: "test-app.db",
  });

  assert.equal(paths.root, resolve("/workspace/.tsh/apps/data/install-1"));
  assert.equal(paths.databaseDir, resolve("/var/lib/tutti-app/databases/install-1"));
  assert.equal(paths.projectsDir, resolve("/workspace/.tsh/apps/data/install-1/projects"));
  assert.equal(paths.dbPath, resolve("/var/lib/tutti-app/databases/install-1/test-app.db"));
  assert.equal(
    projectLocalAgentStateRoot(paths, "proj-1"),
    resolve("/var/lib/tutti-app/databases/install-1/local-agent-state/proj-1"),
  );
  assert.equal(
    projectPrivateStateRoot(paths, "proj-1"),
    resolve("/var/lib/tutti-app/databases/install-1/project-private/proj-1"),
  );
  assert.equal(
    privateProjectsParentDir(paths),
    resolve("/var/lib/tutti-app/databases/install-1/project-private"),
  );
});

test("falls back to the legacy data directory when no database directory is injected", () => {
  process.env.TEST_APP_HOME = "/tmp/test-app";
  delete process.env.TUTTI_APP_DATABASE_DIR;

  const paths = createAppPaths({
    homeEnvVar: "TEST_APP_HOME",
    defaultHomeDirName: ".test-app",
    dbFileName: "test-app.db",
  });

  assert.equal(paths.dbPath, resolve("/tmp/test-app/data/test-app.db"));
  assert.equal(
    projectPrivateStateRoot(paths, "proj-1"),
    resolve("/tmp/test-app/projects/proj-1"),
  );
});
