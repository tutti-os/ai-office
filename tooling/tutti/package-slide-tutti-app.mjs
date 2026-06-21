import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageTuttiApp as packageSharedTuttiApp } from "@ai-app/tutti-packager";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");
const appDir = path.join(rootDir, "apps", "slide");

const APP_ID = "ai-slide";

export function renderBootstrap({ version = "0.0.0" } = {}) {
  return `#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="\${TUTTI_APP_PACKAGE_DIR:-$script_dir}"

export HOST="\${TUTTI_APP_HOST:-127.0.0.1}"
export PORT="\${TUTTI_APP_PORT:-8791}"
export AI_SLIDE_APP_VERSION="${version}"
export AI_SLIDE_WEB_DIST="$package_dir/dist"
export AI_SLIDE_HOME="\${TUTTI_APP_DATA_DIR:-$package_dir/.data}"
export AI_SLIDE_RUNTIME_ROOT="\${TUTTI_APP_RUNTIME_DIR:-$AI_SLIDE_HOME/.runtime}"
export AI_SLIDE_LOG_ROOT="\${TUTTI_APP_LOG_DIR:-$AI_SLIDE_RUNTIME_ROOT/logs}"
export AI_SLIDE_WORKSPACE_ROOT="\${TUTTI_WORKSPACE_ROOT:-$AI_SLIDE_HOME}"
export AI_SLIDE_TEMPLATE_ROOT="\${AI_SLIDE_TEMPLATE_ROOT:-$package_dir/templates/source}"
export AI_SLIDE_TEMPLATE_ASSET_ROOT="\${AI_SLIDE_TEMPLATE_ASSET_ROOT:-$package_dir/templates/generated/templates}"

base_url="\${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_SLIDE_SERVER_URL="$base_url"

node_bin="\${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_SLIDE_HOME" "$AI_SLIDE_RUNTIME_ROOT" "$AI_SLIDE_LOG_ROOT"

exec "$node_bin" "$package_dir/server/server.js"
`;
}

export function renderIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="AI Slide">
  <rect width="1024" height="1024" rx="208" fill="#EAF3F8"/>
  <rect x="184" y="230" width="656" height="464" rx="38" fill="#FFFFFF" stroke="#1F2933" stroke-width="36"/>
  <path d="M252 330h520" stroke="#2A6F97" stroke-width="42" stroke-linecap="round"/>
  <path d="M282 440h220M282 526h164" stroke="#1F2933" stroke-width="34" stroke-linecap="round"/>
  <rect x="578" y="420" width="176" height="140" rx="22" fill="#F4A261" stroke="#1F2933" stroke-width="28"/>
  <path d="M512 694v94M390 788h244" stroke="#1F2933" stroke-width="36" stroke-linecap="round"/>
  <path d="M744 628l54 26-54 26-26 54-26-54-54-26 54-26 26-54z" fill="#E76F51"/>
</svg>
`;
}

export function renderPackageGuide() {
  return `# AI Slide Tutti Package

This package runs AI Slide as a local Tutti workspace app.

- \`bootstrap.sh\` maps \`TUTTI_APP_*\` variables into \`AI_SLIDE_*\` variables.
- \`server/server.js\` is the bundled Fastify server.
- \`dist/\` is the built React/Vite frontend.
- Durable app data is stored under \`AI_SLIDE_HOME\`.
`;
}

export async function packageTuttiApp() {
  const templateSourceRoot = slideTemplateSourceRoot();
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
    packageAssets: [
      ...(templateSourceRoot ? [{ source: templateSourceRoot, target: "templates/source", required: true }] : []),
      { source: path.join(appDir, "templates", "generated"), target: "templates/generated", required: false },
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
