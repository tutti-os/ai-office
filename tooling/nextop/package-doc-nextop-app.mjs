import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageNextopApp as packageSharedNextopApp } from "@ai-app/nextop-packager";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");
const appDir = path.join(rootDir, "apps", "doc");

const APP_ID = "ai-doc";

export function renderBootstrap({ version = "0.0.0" } = {}) {
  return `#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="\${NEXTOP_APP_PACKAGE_DIR:-$script_dir}"

export HOST="\${NEXTOP_APP_HOST:-127.0.0.1}"
export PORT="\${NEXTOP_APP_PORT:-8790}"
export AI_DOC_APP_VERSION="${version}"
export AI_DOC_WEB_DIST="$package_dir/dist"
export AI_DOC_HOME="\${NEXTOP_APP_DATA_DIR:-$package_dir/.data}"
export AI_DOC_WORKSPACE_ROOT="\${NEXTOP_WORKSPACE_ROOT:-$AI_DOC_HOME}"
export AI_DOC_TEMPLATE_ROOT="\${AI_DOC_TEMPLATE_ROOT:-$AI_DOC_HOME/templates/tutti}"

base_url="\${NEXTOP_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_DOC_SERVER_URL="$base_url"

node_bin="\${NEXTOP_APP_NODE:-node}"
mkdir -p "$AI_DOC_HOME"

exec "$node_bin" "$package_dir/server/server.js"
`;
}

export function renderIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="AI Doc">
  <rect width="1024" height="1024" rx="208" fill="#F5F1E8"/>
  <path d="M278 156h346l122 126v586H278z" fill="#FFFFFF" stroke="#222222" stroke-width="36"/>
  <path d="M620 156v144h126" fill="#ECE7DB" stroke="#222222" stroke-width="36"/>
  <path d="M360 418h304M360 512h304M360 606h218" stroke="#2F4F4F" stroke-width="38" stroke-linecap="round"/>
  <path d="M718 620l58 28-58 28-28 58-28-58-58-28 58-28 28-58z" fill="#D95D39"/>
</svg>
`;
}

export function renderPackageGuide() {
  return `# AI Doc Nextop Package

This package runs AI Doc as a local Nextop workspace app.

- \`bootstrap.sh\` maps \`NEXTOP_APP_*\` variables into \`AI_DOC_*\` variables.
- \`server/server.js\` is the bundled Fastify server.
- \`dist/\` is the built React/Vite frontend.
- Durable app data is stored under \`AI_DOC_HOME\`.
`;
}

export async function packageNextopApp() {
  return packageSharedNextopApp({
    appId: APP_ID,
    rootDir,
    appDir,
    versionEnvVar: "AI_DOC_NEXTOP_APP_VERSION",
    webBuildFilter: "@ai-doc/web",
    webDistDir: path.join(appDir, "web", "dist"),
    serverEntry: "apps/doc/server/src/main.ts",
    renderBootstrap,
    renderIcon,
    renderPackageGuide,
  });
}

if (process.argv[1] === scriptPath) {
  packageNextopApp().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
