import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageTuttiApp as packageSharedTuttiApp } from "@ai-app/tutti-packager";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");
const appDir = path.join(rootDir, "apps", "doc");
const blueDocumentIconPath = path.join(
  rootDir,
  "tooling",
  "tutti",
  "assets",
  "ai-doc-blue-document.png",
);

const APP_ID = "ai-doc";

export function renderBootstrap({ version = "0.0.0" } = {}) {
  return `#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="\${TUTTI_APP_PACKAGE_DIR:-$script_dir}"

export HOST="\${TUTTI_APP_HOST:-127.0.0.1}"
export PORT="\${TUTTI_APP_PORT:-8790}"
export AI_DOC_APP_VERSION="${version}"
export AI_DOC_WEB_DIST="$package_dir/dist"
export AI_DOC_HOME="\${TUTTI_APP_DATA_DIR:-$package_dir/.data}"
export AI_DOC_RUNTIME_ROOT="\${TUTTI_APP_RUNTIME_DIR:-$AI_DOC_HOME/.runtime}"
export AI_DOC_LOG_ROOT="\${TUTTI_APP_LOG_DIR:-$AI_DOC_RUNTIME_ROOT/logs}"
export AI_DOC_WORKSPACE_ROOT="\${TUTTI_WORKSPACE_ROOT:-$AI_DOC_HOME}"
export AI_DOC_TEMPLATE_ROOT="\${AI_DOC_TEMPLATE_ROOT:-$AI_DOC_HOME/templates/tutti}"
export AI_DOC_TUTTI_CLI="\${TUTTI_CLI:-}"

base_url="\${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_DOC_SERVER_URL="$base_url"

node_bin="\${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_DOC_HOME" "$AI_DOC_RUNTIME_ROOT" "$AI_DOC_LOG_ROOT"

exec "$node_bin" "$package_dir/server/server.js"
`;
}

export function renderIcon() {
  const blueDocumentIcon = readFileSync(blueDocumentIconPath).toString("base64");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="AI Doc">
  <image href="data:image/png;base64,${blueDocumentIcon}" width="1024" height="1024" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
}

export function renderPackageGuide() {
  return `# AI Doc Tutti Package

This package runs AI Doc as a local Tutti workspace app.

- \`bootstrap.sh\` maps \`TUTTI_APP_*\`, \`TUTTI_WORKSPACE_ROOT\`, and \`TUTTI_CLI\` into \`AI_DOC_*\` variables.
- \`server/server.js\` is the bundled Fastify server.
- \`dist/\` is the built React/Vite frontend.
- \`tutti.app.json\` declares the app runtime, localized metadata, CLI surface, and references endpoints.
- \`tutti.cli.json\` exposes \`doc status\`, \`doc list-projects\`, and \`doc create\` for other Tutti apps and agents.
- Durable app data is stored under \`AI_DOC_HOME\`, which defaults to \`TUTTI_APP_DATA_DIR\`.
- Runtime scratch data is stored under \`AI_DOC_RUNTIME_ROOT\`, which defaults to \`TUTTI_APP_RUNTIME_DIR\`.
- Backend logs, if added later, must stay under \`AI_DOC_LOG_ROOT\`, which defaults to \`TUTTI_APP_LOG_DIR\`.

I18n:

- Default manifest metadata is in \`tutti.app.json\`.
- Additional manifest metadata lives under \`locales/<locale>/manifest.json\`.
- Browser copy dictionaries live under \`locales/<locale>/app.json\`.
- When adding or renaming a browser copy key, update every locale and run \`pnpm check:i18n\` from the repository root before packaging.

Endpoints:

- \`GET /api/health\` is the runtime healthcheck.
- \`POST /tutti/cli/status\`, \`POST /tutti/cli/list-projects\`, and \`POST /tutti/cli/create\` implement the CLI manifest.
- \`POST /tutti/references/list\` and \`POST /tutti/references/search\` expose app-data-relative project files and exports.

Runtime composition:

- Use \`AI_DOC_TUTTI_CLI\` for app-to-app calls. It is populated from \`TUTTI_CLI\` by \`bootstrap.sh\`.
- CLI integrations must be optional and fail softly so AI Doc still works in a normal browser or development shell.
`;
}

export async function packageTuttiApp() {
  return packageSharedTuttiApp({
    appId: APP_ID,
    rootDir,
    appDir,
    buildRoot: path.join(rootDir, "build", "tutti-app"),
    packageRoot: path.join(rootDir, "build", "tutti-app", "package"),
    versionEnvVar: "AI_DOC_TUTTI_APP_VERSION",
    webBuildFilter: "@ai-doc/web",
    webDistDir: path.join(appDir, "web", "dist"),
    serverEntry: "apps/doc/server/src/main.ts",
    cliManifestFile: "tutti.cli.json",
    documentationFiles: ["COMMANDS.md"],
    packageAssets: [{ source: path.join(appDir, "locales"), target: "locales", required: true }],
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
