import { access, lstat, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.resolve(process.argv[2] ?? "build/tutti-app/package");
const errors = [];

await validatePackage(packageRoot);

if (errors.length > 0) {
  console.error("Tutti app package validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Tutti app package validation passed.");
}

async function validatePackage(root) {
  if (!await exists(root)) {
    errors.push(`Package root does not exist: ${root}`);
    return;
  }
  for (const file of ["tutti.app.json", "tutti.cli.json", "AGENTS.md", "COMMANDS.md", "bootstrap.sh", "icon.svg", "server/server.js", "dist/index.html"]) {
    if (!await exists(path.join(root, file))) errors.push(`Missing file: ${file}`);
  }
  const manifest = await readJson(path.join(root, "tutti.app.json"));
  if (manifest) await validateManifest(root, manifest);
  const cliManifest = await readJson(path.join(root, "tutti.cli.json"));
  if (cliManifest) validateCliManifest(cliManifest);
  await validateBootstrap(root);
  await validateLocaleParity(path.join(root, "locales"));
  await assertNoSymlinks(root);
}

async function validateManifest(root, manifest) {
  if (manifest.schemaVersion !== "tutti.app.manifest.v1") errors.push("Invalid manifest schemaVersion");
  if (manifest.appId !== "ai-doc") errors.push("Manifest appId must be ai-doc");
  if (manifest.runtime?.kind) errors.push("runtime.kind must not be declared");
  if (!manifest.runtime?.bootstrap || !manifest.runtime.healthcheckPath?.startsWith("/")) {
    errors.push("Manifest runtime bootstrap and healthcheckPath are required");
  }
  if (manifest.cli?.manifest !== "tutti.cli.json") errors.push("Manifest must declare tutti.cli.json");
  if (!manifest.references?.listEndpoint?.startsWith("/tutti/references/")) errors.push("Manifest references list endpoint is missing");
  if (!manifest.references?.searchEndpoint?.startsWith("/tutti/references/")) errors.push("Manifest references search endpoint is missing");
  if (manifest.icon?.type !== "asset" || !manifest.icon.src || !await exists(path.join(root, manifest.icon.src))) {
    errors.push("Manifest icon asset is missing");
  }
}

function validateCliManifest(manifest) {
  if (manifest.schemaVersion !== "tutti.app.cli.v1") errors.push("Invalid CLI manifest schemaVersion");
  if (manifest.scope !== "doc") errors.push("CLI scope must be doc");
  if (!Array.isArray(manifest.commands) || manifest.commands.length === 0) errors.push("CLI manifest needs commands");
  for (const command of manifest.commands ?? []) {
    const commandPath = Array.isArray(command.path) ? command.path.join("/") : "";
    if (!commandPath) errors.push("CLI command path is required");
    if (!command.summary || !command.description || command.inputSchema?.type !== "object") {
      errors.push(`CLI command ${commandPath || "<unknown>"} is missing summary, description, or inputSchema`);
    }
    if (command.handler?.kind !== "http" || command.handler?.method !== "POST" || !command.handler?.path?.startsWith("/tutti/cli/")) {
      errors.push(`CLI command ${commandPath || "<unknown>"} must use an HTTP POST /tutti/cli handler`);
    }
  }
}

async function validateBootstrap(root) {
  const bootstrapPath = path.join(root, "bootstrap.sh");
  const info = await stat(bootstrapPath).catch(() => null);
  if (!info || (info.mode & 0o111) === 0) errors.push("bootstrap.sh must be executable");
  const text = await readFile(bootstrapPath, "utf8").catch(() => "");
  if (!text.includes("TUTTI_APP_NODE")) errors.push("bootstrap.sh must use TUTTI_APP_NODE");
  if (!text.includes("TUTTI_APP_DATA_DIR")) errors.push("bootstrap.sh must use TUTTI_APP_DATA_DIR");
  if (!text.includes("TUTTI_CLI")) errors.push("bootstrap.sh must pass through TUTTI_CLI");
}

async function validateLocaleParity(localesDir) {
  const localeEntries = await readdir(localesDir, { withFileTypes: true }).catch(() => []);
  const locales = localeEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (!locales.includes("en") || !locales.includes("zh-CN")) errors.push("Package must include en and zh-CN locales");
  const fileNames = new Set();
  for (const locale of locales) {
    for (const entry of await readdir(path.join(localesDir, locale), { withFileTypes: true }).catch(() => [])) {
      if (entry.isFile() && entry.name.endsWith(".json")) fileNames.add(entry.name);
    }
  }
  for (const fileName of fileNames) {
    const byLocale = new Map();
    for (const locale of locales) {
      const data = await readJson(path.join(localesDir, locale, fileName));
      if (data) byLocale.set(locale, flattenKeys(data));
    }
    const base = byLocale.get("en");
    if (!base) continue;
    for (const [locale, keys] of byLocale) {
      const missing = [...base].filter((key) => !keys.has(key));
      const extra = [...keys].filter((key) => !base.has(key));
      if (missing.length || extra.length) errors.push(`${fileName} locale mismatch for ${locale}`);
    }
  }
}

async function assertNoSymlinks(root) {
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const entryPath = path.join(root, entry.name);
    const info = await lstat(entryPath);
    if (info.isSymbolicLink()) errors.push(`Package contains symlink: ${path.relative(root, entryPath)}`);
    if (info.isDirectory()) await assertNoSymlinks(entryPath);
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    errors.push(`Invalid or missing JSON: ${filePath}`);
    return null;
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function flattenKeys(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = new Set();
    for (const [key, nested] of Object.entries(value)) {
      for (const flattened of flattenKeys(nested, prefix ? `${prefix}.${key}` : key)) keys.add(flattened);
    }
    return keys;
  }
  return new Set([prefix]);
}
