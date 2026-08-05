import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveTuttiAppPackageVersion } from "./version.mjs";

export { resolveStableVersionSeed, resolveTuttiAppPackageVersion } from "./version.mjs";

export async function packageTuttiApp(options) {
  const {
    appId,
    rootDir,
    appDir,
    buildRoot = path.join(rootDir, "build", "tutti-app"),
    packageRoot = path.join(buildRoot, "package"),
    versionEnvVar,
    webBuildFilter,
    webDistDir,
    serverEntry,
    serverBundleOutfile = path.join(path.relative(rootDir, packageRoot), "server", "server.js"),
    serverExtraEntries = [],
    manifestFile = "tutti.app.json",
    manifestSchemaVersion = "tutti.app.manifest.v1",
    cliManifestFile = null,
    cliManifest = null,
    commandsGuide = null,
    documentationFiles = [],
    packageAssets = [],
    renderBootstrap,
    renderIcon,
    renderPackageGuide,
  } = options;

  const sourceManifest = JSON.parse(await readFile(path.join(appDir, manifestFile), "utf8"));
  const rootPackage = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  const version = resolveTuttiAppPackageVersion({
    appId,
    manifestVersion: sourceManifest.version,
    rootPackageVersion: rootPackage.version,
    versionEnvVar,
    rootDir,
  });
  const manifest = { ...sourceManifest, version };

  await run("pnpm", ["--filter", webBuildFilter, "build"], { cwd: rootDir });
  await mkdir(buildRoot, { recursive: true });
  await writePackageFiles({
    appDir,
    cliManifestFile,
    cliManifest,
    commandsGuide,
    documentationFiles,
    manifestFile,
    manifest,
    packageRoot,
    renderBootstrap,
    renderIcon,
    renderPackageGuide,
    webDistDir,
    packageAssets,
  });
  await bundleServer({ rootDir, serverEntry, serverBundleOutfile });
  for (const entry of serverExtraEntries) {
    await bundleServer({
      rootDir,
      serverEntry: entry.entry,
      serverBundleOutfile: entry.outfile,
    });
  }
  await validatePackageRoot(packageRoot, {
    appId,
    manifestFile,
    manifestSchemaVersion,
    cliManifestFile,
  });
  const zipPath = await createZip({ appId, buildRoot, packageRoot, version });
  const zipSha256 = await sha256File(zipPath);
  const result = {
    appId: manifest.appId,
    version,
    packageRoot,
    zipPath,
    zipSha256,
  };
  await writeFile(path.join(buildRoot, "package-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Created ${zipPath}`);
  return result;
}

async function writePackageFiles(input) {
  await rm(input.packageRoot, { force: true, recursive: true });
  await mkdir(path.join(input.packageRoot, "server"), { recursive: true });
  await writeFile(path.join(input.packageRoot, input.manifestFile), `${JSON.stringify(input.manifest, null, 2)}\n`);
  if (input.cliManifestFile) {
    if (input.cliManifest) {
      await writeFile(path.join(input.packageRoot, input.cliManifestFile), `${JSON.stringify(input.cliManifest, null, 2)}\n`);
    } else {
      await cp(path.join(input.appDir, input.cliManifestFile), path.join(input.packageRoot, input.cliManifestFile));
    }
  }
  for (const file of input.documentationFiles ?? []) {
    await cp(path.join(input.appDir, file), path.join(input.packageRoot, file));
  }
  if (input.commandsGuide) {
    const documentationFile = input.cliManifest?.documentation?.file ?? "COMMANDS.md";
    await writeFile(path.join(input.packageRoot, documentationFile), input.commandsGuide);
  }
  await writeFile(path.join(input.packageRoot, "bootstrap.sh"), input.renderBootstrap({ version: input.manifest.version }));
  await chmod(path.join(input.packageRoot, "bootstrap.sh"), 0o755);
  await writeFile(path.join(input.packageRoot, "AGENTS.md"), input.renderPackageGuide());
  await writeFile(path.join(input.packageRoot, "icon.svg"), input.renderIcon());
  await cp(input.webDistDir, path.join(input.packageRoot, "dist"), {
    recursive: true,
  });
  for (const asset of input.packageAssets ?? []) {
    await copyPackageAsset(input.packageRoot, asset);
  }
  for (const locale of input.manifest.localizationInfo?.additionalLocales ?? []) {
    const source = path.join(input.appDir, locale.file);
    const target = path.join(input.packageRoot, locale.file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
}

async function copyPackageAsset(packageRoot, asset) {
  try {
    await access(asset.source);
  } catch (error) {
    if (asset.required === false) return;
    throw error;
  }
  const target = path.resolve(packageRoot, asset.target);
  const packageRootWithSep = `${path.resolve(packageRoot)}${path.sep}`;
  if (target !== path.resolve(packageRoot) && !target.startsWith(packageRootWithSep)) {
    throw new Error(`Package asset target escapes package root: ${asset.target}`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(asset.source, target, { recursive: true });
}

async function bundleServer(input) {
  await run(
    "pnpm",
    [
      "exec",
      "esbuild",
      input.serverEntry,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node22",
      `--outfile=${input.serverBundleOutfile}`,
      "--banner:js=import { createRequire as __aiAppCreateRequire } from 'node:module'; const require = __aiAppCreateRequire(import.meta.url);",
    ],
    { cwd: input.rootDir },
  );
}

async function createZip(input) {
  const zipPath = path.join(input.buildRoot, `${input.appId}-${input.version}.zip`);
  await rm(zipPath, { force: true });
  const archive = resolveArchiveInvocation(zipPath);
  await run(archive.command, archive.args, { cwd: input.packageRoot });
  return zipPath;
}

export function resolveArchiveInvocation(zipPath, targetPlatform = process.platform) {
  return targetPlatform === "win32" ? { command: "tar.exe", args: ["-a", "-c", "-f", zipPath, "."] } : { command: "zip", args: ["-qry", zipPath, "."] };
}

async function validatePackageRoot(root, options) {
  const { appId, manifestFile, manifestSchemaVersion, cliManifestFile } = options;
  const requiredFiles = [manifestFile, "AGENTS.md", "bootstrap.sh", "icon.svg", "server/server.js", "dist/index.html"];
  if (cliManifestFile) requiredFiles.push(cliManifestFile);
  for (const file of requiredFiles) await access(path.join(root, file));
  const manifest = JSON.parse(await readFile(path.join(root, manifestFile), "utf8"));
  if (manifest.schemaVersion !== manifestSchemaVersion) throw new Error("Invalid manifest schemaVersion");
  if (manifest.appId !== appId) throw new Error(`Manifest appId must be ${appId}`);
  if (!manifest.runtime?.bootstrap || !manifest.runtime?.healthcheckPath?.startsWith("/")) {
    throw new Error("Manifest runtime bootstrap and healthcheckPath are required");
  }
  if (manifest.cli?.manifest) {
    const cliManifest = JSON.parse(await readFile(path.join(root, manifest.cli.manifest), "utf8"));
    validateCliManifest(cliManifest);
    const documentationFile = cliManifest.documentation?.file;
    if (documentationFile) await access(path.join(root, documentationFile));
  }
  const bootstrapMode = (await stat(path.join(root, "bootstrap.sh"))).mode;
  assertBootstrapExecutable(bootstrapMode);
  await assertNoSymlinks(root);
}

export function assertBootstrapExecutable(mode, targetPlatform = process.platform) {
  if (targetPlatform !== "win32" && (mode & 0o111) === 0) {
    throw new Error("bootstrap.sh must be executable");
  }
}

export function createCliManifest(config) {
  return {
    schemaVersion: "tutti.app.cli.v1",
    scope: config.scope,
    ...(config.description ? { description: config.description } : {}),
    ...(config.documentationFile ? { documentation: { file: config.documentationFile } } : {}),
    commands: config.commands.map((command) => createCliCommand(command)),
  };
}

function createCliCommand(command) {
  return {
    path: command.path,
    summary: command.summary,
    description: command.description,
    ...(command.visibility ? { visibility: command.visibility } : {}),
    inputSchema: {
      type: "object",
      properties: command.properties ?? {},
      ...(command.required?.length ? { required: command.required } : {}),
    },
    output: command.output ?? {
      defaultMode: "json",
      json: true,
    },
    handler: {
      kind: "http",
      method: "POST",
      path: `/tutti/cli/${command.path.join("/")}`,
      timeoutMs: command.timeoutMs ?? 30000,
    },
  };
}

export function renderCommandsGuide(config) {
  const manifest = createCliManifest(config);
  const rows = manifest.commands
    .map((command) => {
      const required = command.inputSchema.required ?? [];
      const flags = Object.keys(command.inputSchema.properties ?? {})
        .map((key) => `--${key}${required.includes(key) ? " <required>" : ""}`)
        .join(" ");
      const usage = [manifest.scope, ...command.path, flags].filter(Boolean).join(" ");
      return `## \`${usage}\`\n\n${command.description}\n\nHandler: \`${command.handler.path}\`\n`;
    })
    .join("\n");
  const title = config.guideTitle ?? `${config.scope} CLI Commands`;
  const intro = config.guideIntro ?? `These commands expose ${config.scope} capabilities to the Tutti app CLI.`;
  return `# ${title}\n\nScope: \`${manifest.scope}\`\n\n${intro} Command outputs use \`CliCommandOutput\` envelopes.\n\n${rows}`;
}

export function validateCliManifest(manifest) {
  if (manifest.schemaVersion !== "tutti.app.cli.v1") throw new Error("Invalid CLI manifest schemaVersion");
  if (!isCliPathSegment(manifest.scope)) throw new Error("CLI scope must use lowercase letters, numbers, and hyphen only");
  if (!Array.isArray(manifest.commands) || manifest.commands.length === 0) throw new Error("CLI manifest needs commands");
  const seenCommands = new Set();
  for (const command of manifest.commands) {
    if (!Array.isArray(command.path) || command.path.length === 0) throw new Error("CLI command path is required");
    for (const segment of command.path) {
      if (!isCliPathSegment(segment)) throw new Error(`Invalid CLI command path segment: ${segment}`);
      if (segment === manifest.scope) throw new Error("CLI command path must not repeat the scope");
    }
    const commandKey = command.path.join(" ");
    if (seenCommands.has(commandKey)) throw new Error(`Duplicate CLI command: ${commandKey}`);
    seenCommands.add(commandKey);
    if (!command.summary || !command.description || command.inputSchema?.type !== "object") {
      throw new Error(`CLI command ${commandKey} is missing summary, description, or object inputSchema`);
    }
    if (command.visibility && command.visibility !== "public" && command.visibility !== "integration") {
      throw new Error(`CLI command ${commandKey} has invalid visibility`);
    }
    if (command.handler?.kind !== "http" || command.handler?.method !== "POST") {
      throw new Error(`CLI command ${commandKey} must use an HTTP POST handler`);
    }
    const expectedHandlerPath = `/tutti/cli/${command.path.join("/")}`;
    if (command.handler.path !== expectedHandlerPath) {
      throw new Error(`CLI command ${commandKey} handler.path must be ${expectedHandlerPath}`);
    }
    const timeoutMs = command.handler.timeoutMs;
    if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000)) {
      throw new Error(`CLI command ${commandKey} timeoutMs is outside the supported range`);
    }
    validateCliInputSchema(commandKey, command.inputSchema);
    validateCliOutput(commandKey, command.output);
  }
}

function validateCliInputSchema(commandKey, schema) {
  if (!schema || schema.type !== "object" || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    throw new Error(`CLI command ${commandKey} must use an object inputSchema with properties`);
  }
  const required = schema.required ?? [];
  if (!Array.isArray(required) || required.some((key) => typeof key !== "string")) {
    throw new Error(`CLI command ${commandKey} required must be an array of property names`);
  }
  for (const [propertyKey, property] of Object.entries(schema.properties)) {
    if (!isCliPathSegment(propertyKey)) {
      throw new Error(`CLI command ${commandKey} input property ${propertyKey} must use lowercase letters, numbers, and hyphen only`);
    }
    if (!["string", "boolean", "integer"].includes(property?.type)) {
      throw new Error(`CLI command ${commandKey} input property ${propertyKey} has unsupported type`);
    }
  }
  for (const propertyKey of required) {
    if (!Object.hasOwn(schema.properties, propertyKey)) {
      throw new Error(`CLI command ${commandKey} requires unknown input property ${propertyKey}`);
    }
  }
}

function validateCliOutput(commandKey, output) {
  if (!output || (output.defaultMode !== "json" && output.defaultMode !== "table")) {
    throw new Error(`CLI command ${commandKey} must declare json or table default output`);
  }
  if (output.defaultMode === "table" && (!output.table || !Array.isArray(output.table.columns))) {
    throw new Error(`CLI command ${commandKey} table output must declare columns`);
  }
}

function isCliPathSegment(value) {
  return typeof value === "string" && /^[a-z0-9-]+$/.test(value);
}

async function assertNoSymlinks(root) {
  for (const entry of await readdir(root)) {
    const entryPath = path.join(root, entry);
    const info = await lstat(entryPath);
    if (info.isSymbolicLink()) throw new Error(`Package contains symlink: ${path.relative(root, entryPath)}`);
    if (info.isDirectory()) await assertNoSymlinks(entryPath);
  }
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
}

async function run(command, args, options = {}) {
  const invocation = resolveBuildInvocation(command, args);
  await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${invocation.command} ${invocation.args.join(" ")} exited with code ${code}`));
    });
  });
}

export function resolveBuildInvocation(command, args, env = process.env, nodePath = process.execPath) {
  if (command !== "pnpm") return { command, args };
  const entrypoint = env.npm_execpath?.trim();
  if (!entrypoint) {
    throw new Error("npm_execpath is required to run the package manager");
  }
  return { command: nodePath, args: [entrypoint, ...args] };
}
