import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageTuttiApp as packageSharedTuttiApp } from "@ai-app/tutti-packager";
import { createArtifactCliManifest, renderArtifactCommandsGuide } from "./cli-manifests.mjs";

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
export TUTTI_APP_ID="\${TUTTI_APP_ID:-ai-doc}"
export AI_DOC_APP_VERSION="${version}"
export AI_DOC_WEB_DIST="$package_dir/dist"
export AI_DOC_HOME="\${TUTTI_APP_DATA_DIR:-$package_dir/.data}"
export TUTTI_APP_DATABASE_DIR="\${TUTTI_APP_DATABASE_DIR:-$AI_DOC_HOME/data}"
export AI_DOC_RUNTIME_ROOT="\${TUTTI_APP_RUNTIME_DIR:-$AI_DOC_HOME/.runtime}"
export AI_DOC_LOG_ROOT="\${TUTTI_APP_LOG_DIR:-$AI_DOC_RUNTIME_ROOT/logs}"
export AI_DOC_TEMPLATE_ROOT="\${AI_DOC_TEMPLATE_ROOT:-$TUTTI_APP_DATABASE_DIR/templates/tutti}"
export AI_DOC_TUTTI_CLI="\${TUTTI_CLI:-}"
# TSH sandboxes always expose OfficeCLI at the managed runtime path.
if [ "\${TSH_WORKSPACE_APP:-}" = "1" ] && [ -z "\${TUTTI_APP_OFFICECLI_PATH:-}" ]; then
  export TUTTI_APP_OFFICECLI_PATH=/usr/local/bin/officecli
fi

base_url="\${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_DOC_SERVER_URL="$base_url"

node_bin="\${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_DOC_HOME" "$TUTTI_APP_DATABASE_DIR" "$AI_DOC_RUNTIME_ROOT" "$AI_DOC_LOG_ROOT"
legacy_db="$AI_DOC_HOME/data/ai-doc.db"
database_db="$TUTTI_APP_DATABASE_DIR/ai-doc.db"
if [ "$legacy_db" != "$database_db" ] && [ ! -e "$database_db" ] && [ -f "$legacy_db" ]; then
  database_tmp="$database_db.migrate-$$"
  wal_tmp="$database_db-wal.migrate-$$"
  rm -f "$database_tmp" "$wal_tmp"
  if [ -f "$legacy_db-wal" ]; then
    cp "$legacy_db-wal" "$wal_tmp"
    mv "$wal_tmp" "$database_db-wal"
  fi
  cp "$legacy_db" "$database_tmp"
  mv "$database_tmp" "$database_db"
fi

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

- \`bootstrap.sh\` maps app-owned \`TUTTI_APP_*\` paths and \`TUTTI_CLI\` into \`AI_DOC_*\` variables.
- \`server/server.js\` is the bundled Fastify server.
- \`dist/\` is the built React/Vite frontend.
- \`tutti.app.json\` declares the app runtime, localized metadata, CLI surface, and references endpoints.
- \`tutti.cli.json\` exposes project commands such as \`doc projects list\`, \`doc projects get\`, and \`doc projects create\` for other Tutti apps and agents.
- Private app state (SQLite, sidecars, template cache) uses \`TUTTI_APP_DATABASE_DIR\` when provided.
- Public user artifacts live under \`TUTTI_APP_DATA_DIR\` (\`/workspace\` on TSH). Do not persist private state under \`TUTTI_APP_DATA_DIR\` / \`.tsh\`.
- Runtime scratch data is stored under \`AI_DOC_RUNTIME_ROOT\`, which defaults to \`TUTTI_APP_RUNTIME_DIR\`.
- Backend logs, if added later, must stay under \`AI_DOC_LOG_ROOT\`, which defaults to \`TUTTI_APP_LOG_DIR\`.
- OfficeCLI auto-install uses the shared AI Office toolchain cache, not \`AI_DOC_HOME\`; override with \`AI_DOC_OFFICECLI_PATH\`, \`TUTTI_APP_OFFICECLI_PATH\`, or an \`*_OFFICECLI_INSTALL_ROOT\` env var.

I18n:

- Default manifest metadata is in \`tutti.app.json\`.
- Additional manifest metadata lives under \`locales/<locale>/manifest.json\`.
- Browser copy dictionaries live under \`locales/<locale>/app.json\`.
- When adding or renaming a browser copy key, update every locale and run \`pnpm check:i18n\` from the repository root before packaging.

Endpoints:

- \`GET /api/health\` is the runtime healthcheck.
- \`POST /tutti/cli/*\` implements the CLI manifest, including resource-style project commands.
- \`POST /tutti/references/list\` and \`POST /tutti/references/search\` expose app-data-relative user-visible exports remembered by the app.

Runtime composition:

- Use \`AI_DOC_TUTTI_CLI\` for app-to-app calls. It is populated from \`TUTTI_CLI\` by \`bootstrap.sh\`.
- CLI integrations must be optional and fail softly so AI Doc still works in a normal browser or development shell.
- The \`doc open\` command imports the file and returns the focused workspace file path, project \`AGENTS.md\` path, and an internal \`openTarget\` command. It does not open the app automatically; use \`doc projects open\` only after the user confirms they want AI Doc opened directly.
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
    serverExtraEntries: [
      {
        entry: "apps/doc/server/src/agent-tools-mcp.ts",
        outfile: "build/tutti-app/package/server/agent-tools-mcp.js",
      },
    ],
    cliManifestFile: "tutti.cli.json",
    cliManifest: createArtifactCliManifest("doc"),
    commandsGuide: renderArtifactCommandsGuide("doc"),
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
