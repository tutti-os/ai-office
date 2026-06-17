import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function packageNextopApp(options) {
  const {
    appId,
    rootDir,
    appDir,
    buildRoot = path.join(rootDir, "build", "nextop-app"),
    packageRoot = path.join(buildRoot, "package"),
    versionEnvVar,
    webBuildFilter,
    webDistDir,
    serverEntry,
    serverBundleOutfile = "build/nextop-app/package/server/server.js",
    renderBootstrap,
    renderIcon,
    renderPackageGuide,
  } = options;

  const sourceManifest = JSON.parse(await readFile(path.join(appDir, "nextop.app.json"), "utf8"));
  const rootPackage = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  const version = process.env[versionEnvVar]?.trim() || sourceManifest.version || rootPackage.version || "0.0.0";
  const manifest = { ...sourceManifest, version };

  await run("pnpm", ["--filter", webBuildFilter, "build"], { cwd: rootDir });
  await mkdir(buildRoot, { recursive: true });
  await writePackageFiles({
    appDir,
    manifest,
    packageRoot,
    renderBootstrap,
    renderIcon,
    renderPackageGuide,
    webDistDir,
  });
  await bundleServer({ rootDir, serverEntry, serverBundleOutfile });
  await validatePackageRoot(packageRoot, appId);
  const zipPath = await createZip({ appId, buildRoot, packageRoot, version });
  const zipSha256 = await sha256File(zipPath);
  const result = { appId: manifest.appId, version, packageRoot, zipPath, zipSha256 };
  await writeFile(path.join(buildRoot, "package-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Created ${zipPath}`);
  return result;
}

async function writePackageFiles(input) {
  await rm(input.packageRoot, { force: true, recursive: true });
  await mkdir(path.join(input.packageRoot, "server"), { recursive: true });
  await writeFile(path.join(input.packageRoot, "nextop.app.json"), `${JSON.stringify(input.manifest, null, 2)}\n`);
  await writeFile(path.join(input.packageRoot, "bootstrap.sh"), input.renderBootstrap({ version: input.manifest.version }));
  await chmod(path.join(input.packageRoot, "bootstrap.sh"), 0o755);
  await writeFile(path.join(input.packageRoot, "AGENTS.md"), input.renderPackageGuide());
  await writeFile(path.join(input.packageRoot, "icon.svg"), input.renderIcon());
  await cp(input.webDistDir, path.join(input.packageRoot, "dist"), { recursive: true });
  for (const locale of input.manifest.localizationInfo?.additionalLocales ?? []) {
    const source = path.join(input.appDir, locale.file);
    const target = path.join(input.packageRoot, locale.file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
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
  await run("zip", ["-qry", zipPath, "."], { cwd: input.packageRoot });
  return zipPath;
}

async function validatePackageRoot(root, appId) {
  const requiredFiles = ["nextop.app.json", "AGENTS.md", "bootstrap.sh", "icon.svg", "server/server.js", "dist/index.html"];
  for (const file of requiredFiles) await access(path.join(root, file));
  const manifest = JSON.parse(await readFile(path.join(root, "nextop.app.json"), "utf8"));
  if (manifest.schemaVersion !== "nextop.app.manifest.v1") throw new Error("Invalid manifest schemaVersion");
  if (manifest.appId !== appId) throw new Error(`Manifest appId must be ${appId}`);
  if (!manifest.runtime?.bootstrap || !manifest.runtime?.healthcheckPath?.startsWith("/")) {
    throw new Error("Manifest runtime bootstrap and healthcheckPath are required");
  }
  const bootstrapMode = (await stat(path.join(root, "bootstrap.sh"))).mode;
  if ((bootstrapMode & 0o111) === 0) throw new Error("bootstrap.sh must be executable");
  await assertNoSymlinks(root);
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
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
