import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageTuttiApp as packageSharedTuttiApp } from "@ai-app/tutti-packager";
import { createArtifactCliManifest, renderArtifactCommandsGuide } from "./cli-manifests.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");
const appDir = path.join(rootDir, "apps", "slide");

const APP_ID = "ai-slide";
const colorfulPptIconPath = path.join(
  rootDir,
  "tooling",
  "tutti",
  "assets",
  "ai-slide-ppt-colorful.png",
);

export function renderBootstrap({ version = "0.0.0" } = {}) {
  return `#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="\${TUTTI_APP_PACKAGE_DIR:-$script_dir}"

export HOST="\${TUTTI_APP_HOST:-127.0.0.1}"
export PORT="\${TUTTI_APP_PORT:-8791}"
export TUTTI_APP_ID="\${TUTTI_APP_ID:-ai-slide}"
export AI_SLIDE_APP_VERSION="${version}"
export AI_SLIDE_WEB_DIST="$package_dir/dist"
export AI_SLIDE_HOME="\${TUTTI_APP_DATA_DIR:-$package_dir/.data}"
export AI_SLIDE_RUNTIME_ROOT="\${TUTTI_APP_RUNTIME_DIR:-$AI_SLIDE_HOME/.runtime}"
export AI_SLIDE_LOG_ROOT="\${TUTTI_APP_LOG_DIR:-$AI_SLIDE_RUNTIME_ROOT/logs}"
export AI_SLIDE_WORKSPACE_ROOT="\${TUTTI_WORKSPACE_ROOT:-$AI_SLIDE_HOME}"
export AI_SLIDE_TEMPLATE_ROOT="\${AI_SLIDE_TEMPLATE_ROOT:-$package_dir/templates/source}"
export AI_SLIDE_TEMPLATE_ASSET_ROOT="\${AI_SLIDE_TEMPLATE_ASSET_ROOT:-$package_dir/templates/generated/templates}"
export AI_SLIDE_TUTTI_CLI="\${TUTTI_CLI:-}"

base_url="\${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_SLIDE_SERVER_URL="$base_url"

node_bin="\${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_SLIDE_HOME" "$AI_SLIDE_RUNTIME_ROOT" "$AI_SLIDE_LOG_ROOT"

exec "$node_bin" "$package_dir/server/server.js"
`;
}

export function renderIcon() {
  const colorfulPptIcon = readFileSync(colorfulPptIconPath).toString("base64");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="AI Slide">
  <image href="data:image/png;base64,${colorfulPptIcon}" width="1024" height="1024" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
}

export function renderPackageGuide() {
  return `# AI Slide Tutti Package

This package runs AI Slide as a local Tutti workspace app.

- \`bootstrap.sh\` maps \`TUTTI_APP_*\` variables into \`AI_SLIDE_*\` variables.
- \`server/server.js\` is the bundled Fastify server.
- \`dist/\` is the built React/Vite frontend.
- \`tutti.app.json\` declares the app runtime, localized metadata, CLI surface, and references endpoints.
- \`tutti.cli.json\` exposes project commands such as \`slide projects list\`, \`slide projects get\`, and \`slide projects create\` for other Tutti apps and agents.
- Durable app data is stored under \`AI_SLIDE_HOME\`.
- Runtime scratch data is stored under \`AI_SLIDE_RUNTIME_ROOT\`.
- Backend logs, if added later, must stay under \`AI_SLIDE_LOG_ROOT\`.
- Templates load from CloudFront by default at \`/office-templates/slide/template.json\`; set \`AI_SLIDE_TEMPLATE_PROVIDER=local\` to use \`AI_SLIDE_TEMPLATE_ROOT\` and \`AI_SLIDE_TEMPLATE_ASSET_ROOT\`.
- OfficeCLI auto-install uses the shared AI Office toolchain cache, not \`AI_SLIDE_HOME\`; override with \`AI_SLIDE_OFFICECLI_PATH\`, \`TUTTI_APP_OFFICECLI_PATH\`, or an \`*_OFFICECLI_INSTALL_ROOT\` env var.
- Use \`AI_SLIDE_TUTTI_CLI\` for app-to-app calls. It is populated from \`TUTTI_CLI\` by \`bootstrap.sh\`.
- The \`slide open\` command imports the file and returns the focused workspace path, project \`AGENTS.md\` path, and an internal \`openTarget\` command. It does not open the app automatically; use \`slide projects open\` only after the user confirms they want AI Slide opened directly.

I18n:

- Default manifest metadata is in \`tutti.app.json\`.
- Additional manifest metadata lives under \`locales/<locale>/manifest.json\`.
- Browser copy dictionaries live under \`locales/<locale>/app.json\`.

Endpoints:

- \`GET /api/health\` is the runtime healthcheck.
- \`POST /tutti/cli/*\` implements the CLI manifest, including resource-style project commands.
- \`POST /tutti/references/list\` and \`POST /tutti/references/search\` expose app-data-relative project files and exports.
`;
}

export async function packageTuttiApp() {
  const templateSourceRoot = slideTemplateSourceRoot();
  const packageLocalTemplates = process.env.AI_SLIDE_TEMPLATE_PROVIDER === "local";
  return packageSharedTuttiApp({
    appId: APP_ID,
    rootDir,
    appDir,
    buildRoot: path.join(rootDir, "build", "tutti-slide-app"),
    packageRoot: path.join(rootDir, "build", "tutti-slide-app", "package"),
    versionEnvVar: "AI_SLIDE_TUTTI_APP_VERSION",
    webBuildFilter: "@ai-slide/web",
    webDistDir: path.join(appDir, "web", "dist"),
    serverEntry: "apps/slide/server/src/main.ts",
    serverExtraEntries: [
      {
        entry: "apps/slide/server/src/agent-tools-mcp.ts",
        outfile: "build/tutti-slide-app/package/server/agent-tools-mcp.js",
      },
    ],
    cliManifestFile: "tutti.cli.json",
    cliManifest: createArtifactCliManifest("slide"),
    commandsGuide: renderArtifactCommandsGuide("slide"),
    packageAssets: [
      { source: path.join(appDir, "locales"), target: "locales", required: true },
      ...(packageLocalTemplates && templateSourceRoot ? [{ source: templateSourceRoot, target: "templates/source", required: true }] : []),
      ...(packageLocalTemplates ? [{ source: path.join(appDir, "templates", "generated"), target: "templates/generated", required: false }] : []),
    ],
    renderBootstrap,
    renderIcon,
    renderPackageGuide,
  });
}

function slideTemplateSourceRoot() {
  const candidates = [
    process.env.AI_SLIDE_TEMPLATE_ROOT ? path.resolve(process.env.AI_SLIDE_TEMPLATE_ROOT) : "",
    path.join(appDir, "templates", "source"),
    path.resolve(rootDir, "../tutti/slide/template"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? "";
}

if (process.argv[1] === scriptPath) {
  packageTuttiApp().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
