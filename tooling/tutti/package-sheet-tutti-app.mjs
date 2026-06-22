import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageTuttiApp as packageSharedTuttiApp } from "@ai-app/tutti-packager";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");
const appDir = path.join(rootDir, "apps", "sheet");

const APP_ID = "ai-sheet";

export function renderBootstrap({ version = "0.0.0" } = {}) {
  return `#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="\${TUTTI_APP_PACKAGE_DIR:-$script_dir}"

export HOST="\${TUTTI_APP_HOST:-127.0.0.1}"
export PORT="\${TUTTI_APP_PORT:-8792}"
export AI_SHEET_APP_VERSION="${version}"
export AI_SHEET_WEB_DIST="$package_dir/dist"
export AI_SHEET_HOME="\${TUTTI_APP_DATA_DIR:-$package_dir/.data}"
export AI_SHEET_RUNTIME_ROOT="\${TUTTI_APP_RUNTIME_DIR:-$AI_SHEET_HOME/.runtime}"
export AI_SHEET_LOG_ROOT="\${TUTTI_APP_LOG_DIR:-$AI_SHEET_RUNTIME_ROOT/logs}"
export AI_SHEET_WORKSPACE_ROOT="\${TUTTI_WORKSPACE_ROOT:-$AI_SHEET_HOME}"

base_url="\${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_SHEET_SERVER_URL="$base_url"

node_bin="\${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_SHEET_HOME" "$AI_SHEET_RUNTIME_ROOT" "$AI_SHEET_LOG_ROOT"

exec "$node_bin" "$package_dir/server/server.js"
`;
}

export function renderIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="AI Sheet">
  <rect width="1024" height="1024" rx="208" fill="#E8F4EE"/>
  <rect x="190" y="206" width="644" height="612" rx="48" fill="#FFFFFF" stroke="#1F2933" stroke-width="36"/>
  <path d="M190 344h644M190 484h644M190 624h644M350 206v612M512 206v612M674 206v612" stroke="#1F2933" stroke-width="24"/>
  <rect x="218" y="236" width="588" height="108" rx="26" fill="#5C6B50"/>
  <path d="M276 290h168M560 290h184" stroke="#F4EFE6" stroke-width="34" stroke-linecap="round"/>
  <path d="M718 674l44 22-44 22-22 44-22-44-44-22 44-22 22-44z" fill="#F4A261"/>
</svg>
`;
}

export function renderPackageGuide() {
  return `# AI Sheet Tutti Package

This package runs AI Sheet as a local Tutti workspace app.

- \`bootstrap.sh\` maps \`TUTTI_APP_*\` variables into \`AI_SHEET_*\` variables.
- \`server/server.js\` is the bundled Fastify server.
- \`dist/\` is the built React/Vite frontend.
- Durable app data is stored under \`AI_SHEET_HOME\`.
- OfficeCLI auto-install uses the shared AI Office toolchain cache, not \`AI_SHEET_HOME\`; override with \`AI_SHEET_OFFICECLI_PATH\`, \`TUTTI_APP_OFFICECLI_PATH\`, or an \`*_OFFICECLI_INSTALL_ROOT\` env var.
- AI Sheet currently supports XLSX display only. The editable source file for a project is \`workbook.xlsx\` under the app-owned project workspace.
`;
}

export async function packageTuttiApp() {
  return packageSharedTuttiApp({
    appId: APP_ID,
    rootDir,
    appDir,
    buildRoot: path.join(rootDir, "build", "tutti-sheet-app"),
    packageRoot: path.join(rootDir, "build", "tutti-sheet-app", "package"),
    versionEnvVar: "AI_SHEET_TUTTI_APP_VERSION",
    webBuildFilter: "@ai-sheet/web",
    webDistDir: path.join(appDir, "web", "dist"),
    serverEntry: "apps/sheet/server/src/main.ts",
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
