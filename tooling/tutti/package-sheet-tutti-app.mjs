import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { packageTuttiApp as packageSharedTuttiApp } from "@ai-app/tutti-packager";
import { createArtifactCliManifest, renderArtifactCommandsGuide } from "./cli-manifests.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");
const appDir = path.join(rootDir, "apps", "sheet");
const buildRoot = path.join(rootDir, "build", "tutti-sheet-app");
const packageRoot = path.join(buildRoot, "package");
const serverRequire = createRequire(path.join(appDir, "server", "package.json"));
const formulaCalcAssetDir = path.dirname(serverRequire.resolve("@tutti-os/office-formula-calc/ooxml-calc/tsh_ooxml_calc.js"));
const formulaCalcWorkerEntry = path.join(formulaCalcAssetDir, "..", "worker.js");
const colorfulSheetIconPath = path.join(
  rootDir,
  "tooling",
  "tutti",
  "assets",
  "ai-sheet-sheet-colorful.png",
);

const APP_ID = "ai-sheet";

export function renderBootstrap({ version = "0.0.0" } = {}) {
  return `#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="\${TUTTI_APP_PACKAGE_DIR:-$script_dir}"

export HOST="\${TUTTI_APP_HOST:-127.0.0.1}"
export PORT="\${TUTTI_APP_PORT:-8792}"
export TUTTI_APP_ID="\${TUTTI_APP_ID:-ai-sheet}"
export AI_SHEET_APP_VERSION="${version}"
export AI_SHEET_WEB_DIST="$package_dir/dist"
export AI_SHEET_HOME="\${TUTTI_APP_DATA_DIR:-$package_dir/.data}"
export AI_SHEET_RUNTIME_ROOT="\${TUTTI_APP_RUNTIME_DIR:-$AI_SHEET_HOME/.runtime}"
export AI_SHEET_LOG_ROOT="\${TUTTI_APP_LOG_DIR:-$AI_SHEET_RUNTIME_ROOT/logs}"
export AI_SHEET_WORKSPACE_ROOT="\${TUTTI_WORKSPACE_ROOT:-$AI_SHEET_HOME}"
export AI_SHEET_TUTTI_CLI="\${TUTTI_CLI:-}"
export TSH_OOXML_CALC_WASM_JS="\${TSH_OOXML_CALC_WASM_JS:-$package_dir/assets/office-formula-calc/tsh_ooxml_calc.js}"

base_url="\${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_SHEET_SERVER_URL="$base_url"

node_bin="\${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_SHEET_HOME" "$AI_SHEET_RUNTIME_ROOT" "$AI_SHEET_LOG_ROOT"

exec "$node_bin" "$package_dir/server/server.js"
`;
}

export function renderIcon() {
  const colorfulSheetIcon = readFileSync(colorfulSheetIconPath).toString("base64");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="AI Sheet">
  <image href="data:image/png;base64,${colorfulSheetIcon}" width="1024" height="1024" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
}

export function renderPackageGuide() {
  return `# AI Sheet Tutti Package

This package runs AI Sheet as a local Tutti workspace app.

- \`bootstrap.sh\` maps \`TUTTI_APP_*\` variables into \`AI_SHEET_*\` variables.
- \`server/server.js\` is the bundled Fastify server.
- \`dist/\` is the built React/Vite frontend.
- \`tutti.app.json\` declares the app runtime, localized metadata, CLI surface, and references endpoints.
- \`tutti.cli.json\` exposes project commands such as \`sheet projects list\`, \`sheet projects get\`, and \`sheet projects create\` for other Tutti apps and agents.
- Durable app data is stored under \`AI_SHEET_HOME\`.
- Runtime scratch data is stored under \`AI_SHEET_RUNTIME_ROOT\`.
- Backend logs, if added later, must stay under \`AI_SHEET_LOG_ROOT\`.
- OfficeCLI auto-install uses the shared AI Office toolchain cache, not \`AI_SHEET_HOME\`; override with \`AI_SHEET_OFFICECLI_PATH\`, \`TUTTI_APP_OFFICECLI_PATH\`, or an \`*_OFFICECLI_INSTALL_ROOT\` env var.
- Formula recalculation runs through \`@tutti-os/office-formula-calc\`, the packaged \`server/worker.js\`, and the packaged \`assets/office-formula-calc/tsh_ooxml_calc.js\` wasm module; override with \`TSH_OOXML_CALC_WASM_JS\` for development.
- AI Sheet renders XLSX directly. The editable source file for a project is \`workbook.xlsx\` under the app-owned project workspace.
- Use \`AI_SHEET_TUTTI_CLI\` for app-to-app calls. It is populated from \`TUTTI_CLI\` by \`bootstrap.sh\`.
- The \`sheet open\` command imports a file and returns the focused workbook path, project \`AGENTS.md\` path, and an internal \`openTarget\` command. It does not open the app automatically; use \`sheet projects open\` only after the user confirms they want AI Sheet opened directly.
- The \`sheet projects create\` command creates a blank workbook project directly and returns the focused workbook path, project \`AGENTS.md\` path, and an internal \`openTarget\` command for follow-up edits.
- The \`sheet agent edit\` command is the app-owned workbook modification path for external agents and other Tutti apps.

Endpoints:

- \`GET /api/health\` is the runtime healthcheck.
- \`POST /tutti/cli/*\` implements the CLI manifest, including resource-style project commands.
- \`POST /tutti/references/list\` and \`POST /tutti/references/search\` expose app-data-relative workbook files and exports.
`;
}

export async function packageTuttiApp() {
  return packageSharedTuttiApp({
    appId: APP_ID,
    rootDir,
    appDir,
    buildRoot,
    packageRoot,
    versionEnvVar: "AI_SHEET_TUTTI_APP_VERSION",
    webBuildFilter: "@ai-sheet/web",
    webDistDir: path.join(appDir, "web", "dist"),
    serverEntry: "apps/sheet/server/src/main.ts",
    serverExtraEntries: [
      {
        entry: formulaCalcWorkerEntry,
        outfile: path.join(path.relative(rootDir, packageRoot), "server", "worker.js"),
      },
      {
        entry: "apps/sheet/server/src/agent-tools-mcp.ts",
        outfile: path.join(path.relative(rootDir, packageRoot), "server", "agent-tools-mcp.js"),
      },
    ],
    cliManifestFile: "tutti.cli.json",
    cliManifest: createArtifactCliManifest("sheet"),
    commandsGuide: renderArtifactCommandsGuide("sheet"),
    packageAssets: [
      { source: path.join(appDir, "locales"), target: "locales", required: true },
      {
        source: process.env.AI_SHEET_CALC_WASM_ASSET_DIR || formulaCalcAssetDir,
        target: "assets/office-formula-calc",
        required: true,
      },
    ],
    renderBootstrap,
    renderIcon,
    renderPackageGuide,
  });
}

if (process.argv[1] === scriptPath) {
  packageTuttiApp().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
