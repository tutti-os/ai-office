import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createTuttiCliClient } from "./index.js";

const APP_ENV = "AI_TEST_TUTTI_CLI";
const previousAppCli = process.env[APP_ENV];
const previousTuttiCli = process.env.TUTTI_CLI;

afterEach(() => {
  restoreEnv(APP_ENV, previousAppCli);
  restoreEnv("TUTTI_CLI", previousTuttiCli);
});

test("prefers the app-specific native CLI path and exposes it to child processes", () => {
  process.env[APP_ENV] = String.raw`C:\Program Files\Tutti\tutti.exe`;
  process.env.TUTTI_CLI = String.raw`C:\legacy\tutti.cmd`;
  const client = createTuttiCliClient(APP_ENV);

  assert.equal(
    client.configuredTuttiCliPath(),
    String.raw`C:\Program Files\Tutti\tutti.exe`,
  );
  assert.deepEqual(client.tuttiCliEnv(), {
    TUTTI_CLI: String.raw`C:\Program Files\Tutti\tutti.exe`,
  });
});

test("executes the configured file directly and parses JSON output", async () => {
  process.env[APP_ENV] = process.execPath;
  delete process.env.TUTTI_CLI;
  const client = createTuttiCliClient(APP_ENV);

  const result = await client.runTuttiCli([
    "-e",
    'process.stdout.write(JSON.stringify({ok:true}))',
  ]);

  assert.deepEqual(result, { ok: true });
});

test("returns an unconfigured app-open result without spawning", async () => {
  delete process.env[APP_ENV];
  delete process.env.TUTTI_CLI;
  const client = createTuttiCliClient(APP_ENV);

  await assert.doesNotReject(async () => {
    assert.deepEqual(await client.openTuttiAppRoute("ai-doc", "/projects"), {
      attempted: false,
      configured: false,
      appId: "ai-doc",
      route: "/projects",
      result: null,
      error: "TUTTI_CLI is not configured",
    });
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
