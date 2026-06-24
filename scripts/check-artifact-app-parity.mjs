#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function expectIncludes(path, text, label = text) {
  if (!read(path).includes(text)) fail(`${path} is missing ${label}`);
}

function expectNotIncludes(path, text, label = text) {
  if (read(path).includes(text)) fail(`${path} should not contain ${label}`);
}

for (const app of ["doc", "slide", "sheet"]) {
  for (const dir of ["shared/src", "server/src/artifact", "server/src/local", "web/src/app", "web/src/artifact", "web/src/api"]) {
    if (!existsSync(join(root, "apps", app, dir))) fail(`apps/${app}/${dir} is missing`);
  }
  for (const file of ["COMMANDS.md", "tutti.cli.json"]) {
    if (!existsSync(join(root, "apps", app, file))) fail(`apps/${app}/${file} is missing`);
  }
}

for (const path of ["apps/doc/bootstrap.sh", "apps/slide/bootstrap.sh", "apps/sheet/bootstrap.sh"]) {
  expectIncludes(path, "package_dir=\"${TUTTI_APP_PACKAGE_DIR:-$script_dir}\"", "packaged app package_dir fallback");
  expectIncludes(path, "packaged_server_entry=\"$package_dir/server/server.js\"", "packaged server.js fallback");
  expectIncludes(path, "web_dist=\"$package_dir/dist\"", "packaged web dist fallback");
}

expectIncludes("apps/doc/server/src/runtimes/local-agent-provider.ts", "const defaultLocalAgentTimeoutMs = 30 * 60_000", "30 minute default local agent timeout");
expectIncludes("apps/slide/server/src/runtimes/local-agent-provider.ts", "const defaultLocalAgentTimeoutMs = 30 * 60_000", "30 minute default local agent timeout");

for (const path of ["apps/doc/server/src/artifact/document-service.ts", "apps/slide/server/src/artifact/project-service.ts", "apps/sheet/server/src/artifact/sheet-service.ts"]) {
  expectIncludes(path, "clearProjectHistory()", "clear history service method");
  expectIncludes(path, "deleteProject(projectId: string)", "delete project service method");
}

for (const path of ["apps/doc/web/src/api/projects.ts", "apps/slide/web/src/api/projects.ts", "apps/sheet/web/src/api/projects.ts"]) {
  expectIncludes(path, "clearProjectHistory", "clear history API client");
  expectIncludes(path, "deleteProject", "delete project API client");
}

for (const path of ["apps/doc/web/src/styles/index.css", "apps/slide/web/src/styles/index.css", "apps/sheet/web/src/styles/index.css"]) {
  expectIncludes(path, '@source "../../../../../packages/ai-app-ui/src"', "Tailwind source for shared UI package");
  expectNotIncludes(path, "@ai-app/ui/app-shell/styles.css", "shared app-shell CSS import");
  expectNotIncludes(path, "font: inherit", "app-local form control reset; use @ai-app/ui/app-reset.css");
}

for (const path of ["apps/doc/web/src/main.tsx", "apps/slide/web/src/main.tsx", "apps/sheet/web/src/main.tsx"]) {
  expectIncludes(path, 'import "@ai-app/ui/app-reset.css";', "shared app reset import");
}

for (const path of ["apps/doc/package.json", "apps/doc/server/package.json", "apps/doc/web/package.json", "apps/slide/package.json", "apps/slide/server/package.json", "apps/slide/web/package.json", "apps/sheet/package.json", "apps/sheet/server/package.json", "apps/sheet/web/package.json"]) {
  if ("packageManager" in json(path)) fail(`${path} should not declare packageManager; keep it at the repo root`);
}

const docManifest = json("apps/doc/tutti.app.json");
const slideManifest = json("apps/slide/tutti.app.json");
const sheetManifest = json("apps/sheet/tutti.app.json");
for (const key of ["schemaVersion", "runtime", "window", "localizationInfo", "author"]) {
  if (JSON.stringify(docManifest[key]) !== JSON.stringify(slideManifest[key])) {
    fail(`apps/doc/tutti.app.json and apps/slide/tutti.app.json differ in shared manifest key: ${key}`);
  }
  if (JSON.stringify(docManifest[key]) !== JSON.stringify(sheetManifest[key])) {
    fail(`apps/doc/tutti.app.json and apps/sheet/tutti.app.json differ in shared manifest key: ${key}`);
  }
}
if (docManifest.cli && !slideManifest.cli) warn("AI Slide does not expose a Tutti CLI manifest yet.");
if (docManifest.references && !slideManifest.references) warn("AI Slide does not expose Tutti reference endpoints yet.");
if (docManifest.cli && !sheetManifest.cli) warn("AI Sheet does not expose a Tutti CLI manifest yet.");
if (docManifest.references && !sheetManifest.references) warn("AI Sheet does not expose Tutti reference endpoints yet.");

for (const [app, scope] of [["doc", "doc"], ["slide", "slide"], ["sheet", "sheet"]]) {
  const cliManifest = json(`apps/${app}/tutti.cli.json`);
  if (cliManifest.scope !== scope) fail(`apps/${app}/tutti.cli.json must use scope ${scope}`);
  for (const command of ["status", "list-projects", "create"]) {
    if (!cliManifest.commands?.some((item) => item.path?.[0] === command)) {
      fail(`apps/${app}/tutti.cli.json is missing ${command}`);
    }
  }
  expectIncludes(`apps/${app}/server/src/main.ts`, "registerTuttiCliRoutes", "Tutti CLI route registration");
  expectIncludes(`apps/${app}/server/src/main.ts`, "registerTuttiReferenceRoutes", "Tutti reference route registration");
}

if (warnings.length) {
  console.log("Parity warnings:");
  for (const item of warnings) console.log(`- ${item}`);
}

if (failures.length) {
  console.error("Parity check failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Artifact app parity check passed.");
