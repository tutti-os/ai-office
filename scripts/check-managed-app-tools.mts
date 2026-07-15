import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appToolMcpServerConfig } from "../packages/ai-app-shared/src/agent-tools/index.ts";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = mkdtempSync(join(tmpdir(), "ai-office-managed-mcp-"));

try {
  const serverDir = join(fixtureRoot, "server");
  const bundledEntry = join(serverDir, "server", "agent-tools-mcp.js");
  mkdirSync(join(serverDir, "server"), { recursive: true });
  writeFileSync(bundledEntry, "", "utf8");

  const managedConfig = appToolMcpServerConfig({
    gatewayBaseUrl: "http://127.0.0.1:8791/api/agent-tools",
    token: "test-token",
    serverDir,
    requireSandboxEntrypoint: true,
  });
  assert.equal(managedConfig.command, "node");
  assert.deepEqual(managedConfig.args, [bundledEntry]);
  assert.deepEqual(managedConfig.env, {
    AI_APP_TOOL_GATEWAY_URL: "http://127.0.0.1:8791/api/agent-tools",
    AI_APP_TOOL_TOKEN: "test-token",
  });

  const localConfig = appToolMcpServerConfig({
    gatewayBaseUrl: "http://127.0.0.1:8791/api/agent-tools",
    token: "test-token",
    serverDir,
  });
  assert.equal(localConfig.command, process.execPath);
  assert.deepEqual(localConfig.args, [bundledEntry]);

  assert.throws(
    () =>
      appToolMcpServerConfig({
        gatewayBaseUrl: "http://127.0.0.1:8791/api/agent-tools",
        token: "test-token",
        serverDir: join(fixtureRoot, "missing"),
        requireSandboxEntrypoint: true,
      }),
    /Managed app tools require a packaged MCP entrypoint/,
  );

  const runtimeSource = readSource("packages/ai-app-agent/src/local-agent-runtime/index.ts");
  assert.match(runtimeSource, /mcpServers: this\.options\.buildMcpServers\?\.\(context\) \?\? \[\]/);
  assert.doesNotMatch(runtimeSource, /managedAgent/i);

  for (const app of ["doc", "slide", "sheet"]) {
    const toolSource = readSource(`apps/${app}/server/src/agent-tools.ts`);
    assert.doesNotMatch(toolSource, /requireSandboxEntrypoint/);
    assert.doesNotMatch(toolSource, /managedAgent/i);

    const providerSource = readSource(`apps/${app}/server/src/runtimes/local-agent-provider.ts`);
    assert.doesNotMatch(providerSource, /AI_APP_TOOL_(?:GATEWAY_URL|TOKEN)/);
    assert.doesNotMatch(providerSource, /build(?:Doc|Slide|Sheet)AppToolEnv/);
    assert.doesNotMatch(providerSource, /curl -sS -X POST/);

    assert.doesNotMatch(toolSource, /export function build(?:Doc|Slide|Sheet)AppToolEnv/);

    if (app === "slide") {
      const materializationSource = readSource("apps/slide/server/src/artifact/project-materialization.ts");
      assert.doesNotMatch(materializationSource, /AI_APP_TOOL_(?:GATEWAY_URL|TOKEN)/);
      assert.doesNotMatch(materializationSource, /HTTP fallback/);
    }

    const packagerSource = readSource(`tooling/tutti/package-${app}-tutti-app.mjs`);
    assert.match(packagerSource, /agent-tools-mcp\.js/);
  }

  console.log("App-tool MCP checks passed.");
} finally {
  rmSync(fixtureRoot, { force: true, recursive: true });
}

function readSource(relativePath: string) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}
