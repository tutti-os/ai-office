import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..");
const buildRoot = path.join(rootDir, "build", "nextop-app");
const packageRoot = path.join(buildRoot, "package");

const APP_ID = "ai-document";

export function renderBootstrap({ version = "0.0.0" } = {}) {
  return `#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="\${NEXTOP_APP_PACKAGE_DIR:-$script_dir}"

export HOST="\${NEXTOP_APP_HOST:-127.0.0.1}"
export PORT="\${NEXTOP_APP_PORT:-8790}"
export AI_DOCUMENT_APP_VERSION="${version}"
export AI_DOCUMENT_WEB_DIST="$package_dir/dist"
export AI_DOCUMENT_HOME="\${NEXTOP_APP_DATA_DIR:-$package_dir/.data}"
export AI_DOCUMENT_WORKSPACE_ROOT="\${NEXTOP_WORKSPACE_ROOT:-$AI_DOCUMENT_HOME}"

base_url="\${NEXTOP_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_DOCUMENT_SERVER_URL="$base_url"

node_bin="\${NEXTOP_APP_NODE:-node}"
mkdir -p "$AI_DOCUMENT_HOME"

exec "$node_bin" "$package_dir/server/server.js"
`;
}

export function renderIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="AI Document">
  <rect width="1024" height="1024" rx="208" fill="#F5F1E8"/>
  <path d="M278 156h346l122 126v586H278z" fill="#FFFFFF" stroke="#222222" stroke-width="36"/>
  <path d="M620 156v144h126" fill="#ECE7DB" stroke="#222222" stroke-width="36"/>
  <path d="M360 418h304M360 512h304M360 606h218" stroke="#2F4F4F" stroke-width="38" stroke-linecap="round"/>
  <path d="M718 620l58 28-58 28-28 58-28-58-58-28 58-28 28-58z" fill="#D95D39"/>
</svg>
`;
}

export function renderPackageGuide() {
  return `# AI Document Nextop Package

This package runs AI Document as a local Nextop workspace app.

- \`bootstrap.sh\` maps \`NEXTOP_APP_*\` variables into \`AI_DOCUMENT_*\` variables.
- \`server/server.js\` is the bundled Fastify server.
- \`dist/\` is the built React/Vite frontend.
- Durable app data is stored under \`AI_DOCUMENT_HOME\`.
`;
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function readManifest() {
  return JSON.parse(await readFile(path.join(rootDir, "nextop.app.json"), "utf8"));
}

async function writePackageFiles(manifest) {
  await rm(packageRoot, { force: true, recursive: true });
  await mkdir(path.join(packageRoot, "server"), { recursive: true });
  await writeFile(path.join(packageRoot, "nextop.app.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(packageRoot, "bootstrap.sh"), renderBootstrap({ version: manifest.version }));
  await chmod(path.join(packageRoot, "bootstrap.sh"), 0o755);
  await writeFile(path.join(packageRoot, "AGENTS.md"), renderPackageGuide());
  await writeFile(path.join(packageRoot, "icon.svg"), renderIcon());
  await cp(path.join(rootDir, "apps", "web", "dist"), path.join(packageRoot, "dist"), { recursive: true });
  for (const locale of manifest.localizationInfo?.additionalLocales ?? []) {
    const source = path.join(rootDir, locale.file);
    const target = path.join(packageRoot, locale.file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
}

async function bundleServer() {
  await run("pnpm", [
    "exec",
    "esbuild",
    "apps/server/src/main.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node22",
    "--outfile=build/nextop-app/package/server/server.js",
    "--banner:js=import { createRequire as __aiDocumentCreateRequire } from 'node:module'; const require = __aiDocumentCreateRequire(import.meta.url);",
  ]);
}

async function createZip(version) {
  const zipPath = path.join(buildRoot, `${APP_ID}-${version}.zip`);
  await rm(zipPath, { force: true });
  await run("zip", ["-qry", zipPath, "."], { cwd: packageRoot });
  return zipPath;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
}

async function assertNoSymlinks(root) {
  for (const entry of await readdir(root)) {
    const entryPath = path.join(root, entry);
    const info = await lstat(entryPath);
    if (info.isSymbolicLink()) throw new Error(`Package contains symlink: ${path.relative(root, entryPath)}`);
    if (info.isDirectory()) await assertNoSymlinks(entryPath);
  }
}

async function validatePackageRoot(root) {
  const requiredFiles = ["nextop.app.json", "AGENTS.md", "bootstrap.sh", "icon.svg", "server/server.js", "dist/index.html"];
  for (const file of requiredFiles) await access(path.join(root, file));
  const manifest = JSON.parse(await readFile(path.join(root, "nextop.app.json"), "utf8"));
  if (manifest.schemaVersion !== "nextop.app.manifest.v1") throw new Error("Invalid manifest schemaVersion");
  if (manifest.appId !== APP_ID) throw new Error(`Manifest appId must be ${APP_ID}`);
  if (!manifest.runtime?.bootstrap || !manifest.runtime?.healthcheckPath?.startsWith("/")) {
    throw new Error("Manifest runtime bootstrap and healthcheckPath are required");
  }
  const bootstrapMode = (await stat(path.join(root, "bootstrap.sh"))).mode;
  if ((bootstrapMode & 0o111) === 0) throw new Error("bootstrap.sh must be executable");
  await assertNoSymlinks(root);
}

export async function packageNextopApp() {
  const sourceManifest = await readManifest();
  const rootPackage = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  const version = process.env.AI_DOCUMENT_NEXTOP_APP_VERSION?.trim() || sourceManifest.version || rootPackage.version || "0.0.0";
  const manifest = { ...sourceManifest, version };

  await run("pnpm", ["--filter", "@ai-document/web", "build"]);
  await mkdir(buildRoot, { recursive: true });
  await writePackageFiles(manifest);
  await bundleServer();
  await validatePackageRoot(packageRoot);
  const zipPath = await createZip(version);
  const zipSha256 = await sha256File(zipPath);
  const result = { appId: manifest.appId, version, packageRoot, zipPath, zipSha256 };
  await writeFile(path.join(buildRoot, "package-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Created ${zipPath}`);
  return result;
}

if (process.argv[1] === scriptPath) {
  packageNextopApp().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
