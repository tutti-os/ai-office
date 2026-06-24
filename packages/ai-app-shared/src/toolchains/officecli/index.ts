import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { chmod, copyFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import { arch, homedir, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export type OfficeCliSource = "env" | "bundled" | "tutti" | "missing";

export interface OfficeCliStatus {
  available: boolean;
  version?: string;
  executablePath?: string;
  source: OfficeCliSource;
  canInstall: boolean;
  installing: boolean;
  reason?: string;
}

export type OfficeCliToolchain = {
  getOfficeCliStatus: () => Promise<OfficeCliStatus>;
  installOfficeCli: () => Promise<OfficeCliStatus>;
  requireOfficeCli: () => Promise<OfficeCliStatus>;
  officeCliEnv: () => Promise<Record<string, string>>;
  officeCliEnvSync: () => Record<string, string>;
};

export type OfficeCliToolchainOptions = {
  appRoot: string;
  envPrefix: string;
  requiredForLabel: string;
  version?: string;
  defaultVersion?: string;
};

export function createOfficeCliToolchain(options: OfficeCliToolchainOptions): OfficeCliToolchain {
  const officeCliVersion = options.version ?? process.env[`${options.envPrefix}_OFFICECLI_VERSION`] ?? options.defaultVersion ?? "1.0.120";
  const installRoot = resolveOfficeCliInstallRoot(options, officeCliVersion);
  const installedBinaryPath = join(installRoot, officeCliBinaryName());
  const legacyBinaryPaths = resolveLegacyOfficeCliBinaryPaths(options, officeCliVersion, installedBinaryPath);
  const releaseMirrors = [
    `https://d.officecli.ai/releases/download/v${officeCliVersion}`,
    `https://github.com/iOfficeAI/OfficeCLI/releases/download/v${officeCliVersion}`,
  ];
  let installPromise: Promise<OfficeCliStatus> | null = null;

  async function getOfficeCliStatus(): Promise<OfficeCliStatus> {
    const envPath = process.env[`${options.envPrefix}_OFFICECLI_PATH`]?.trim();
    if (envPath) {
      const status = await probeOfficeCli(envPath, "env");
      if (status.available) return status;
      return { ...status, canInstall: canInstallOfficeCli(), installing: Boolean(installPromise) };
    }

    const tuttiPath = process.env.TUTTI_APP_OFFICECLI_PATH?.trim();
    if (tuttiPath) {
      const status = await probeOfficeCli(tuttiPath, "tutti");
      if (status.available) return status;
      return { ...status, canInstall: canInstallOfficeCli(), installing: Boolean(installPromise) };
    }

    if (existsSync(installedBinaryPath)) {
      const status = await probeOfficeCli(installedBinaryPath, "bundled");
      if (status.available) return { ...status, canInstall: canInstallOfficeCli(), installing: Boolean(installPromise) };
    }

    for (const legacyBinaryPath of legacyBinaryPaths) {
      if (!existsSync(legacyBinaryPath)) continue;
      const status = await probeOfficeCli(legacyBinaryPath, "bundled");
      if (status.available) {
        await promoteLegacyOfficeCli(legacyBinaryPath).catch(() => undefined);
        return { ...status, canInstall: canInstallOfficeCli(), installing: Boolean(installPromise) };
      }
    }

    return {
      available: false,
      source: "missing",
      canInstall: canInstallOfficeCli(),
      installing: Boolean(installPromise),
      reason: "OfficeCLI is not installed in the shared AI Office toolchain cache.",
    };
  }

  async function installOfficeCli(): Promise<OfficeCliStatus> {
    if (installPromise) return installPromise;
    installPromise = doInstallOfficeCli().finally(() => {
      installPromise = null;
    });
    return installPromise;
  }

  async function requireOfficeCli() {
    const status = await getOfficeCliStatus();
    if (!status.available) {
      throw new Error(
        status.canInstall
          ? `OfficeCLI is required for ${options.requiredForLabel}. Download OfficeCLI from the home screen first.`
          : (status.reason ?? `OfficeCLI is required for ${options.requiredForLabel}.`),
      );
    }
    return status;
  }

  async function officeCliEnv(): Promise<Record<string, string>> {
    const status = await getOfficeCliStatus();
    if (!status.available || !status.executablePath) return {};
    return officeCliEnvForPath(status.executablePath);
  }

  function officeCliEnvSync(): Record<string, string> {
    const envPath = process.env[`${options.envPrefix}_OFFICECLI_PATH`]?.trim();
    const tuttiPath = process.env.TUTTI_APP_OFFICECLI_PATH?.trim();
    const managedPath = existsSync(installedBinaryPath) ? installedBinaryPath : "";
    const legacyPath = legacyBinaryPaths.find((candidate) => existsSync(candidate)) ?? "";
    const executablePath = envPath || tuttiPath || managedPath || legacyPath;
    return executablePath ? officeCliEnvForPath(executablePath) : {};
  }

  async function probeOfficeCli(command: string, source: OfficeCliSource): Promise<OfficeCliStatus> {
    try {
      const result = await execFileAsync(command, ["--version"], { timeout: 5000 });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
      return {
        available: true,
        source,
        executablePath: command,
        version: parseOfficeCliVersion(output),
        canInstall: canInstallOfficeCli(),
        installing: Boolean(installPromise),
      };
    } catch (error) {
      return {
        available: false,
        source,
        canInstall: canInstallOfficeCli(),
        installing: Boolean(installPromise),
        reason: error instanceof Error ? error.message : "Unable to run officecli --version.",
      };
    }
  }

  async function doInstallOfficeCli(): Promise<OfficeCliStatus> {
    if (!canInstallOfficeCli()) {
      return {
        available: false,
        source: "missing",
        canInstall: false,
        installing: false,
        reason: `OfficeCLI auto-install is not supported on ${platform()} ${arch()}.`,
      };
    }

    mkdirSync(installRoot, { recursive: true });
    const sumsPath = join(installRoot, `SHA256SUMS.${officeCliVersion}`);
    let tempPath = join(installRoot, "officecli.download");

    try {
      await downloadReleaseFile("SHA256SUMS", sumsPath);
      const sums = await readFile(sumsPath, "utf8");
      const asset = resolveOfficeCliAsset(sums);
      if (!asset) throw new Error(`No OfficeCLI ${platform()} ${arch()} asset found in SHA256SUMS.`);
      tempPath = join(installRoot, `${basename(asset)}.download`);
      await downloadReleaseFile(asset, tempPath);
      await verifySha256(tempPath, sumsPath, asset);
      await chmod(tempPath, 0o755);
      await rename(tempPath, installedBinaryPath);
      return getOfficeCliStatus();
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      return {
        available: false,
        source: "missing",
        canInstall: canInstallOfficeCli(),
        installing: false,
        reason: error instanceof Error ? error.message : "Unable to download OfficeCLI.",
      };
    }
  }

  async function promoteLegacyOfficeCli(legacyBinaryPath: string) {
    if (existsSync(installedBinaryPath) || !existsSync(legacyBinaryPath)) return;
    mkdirSync(installRoot, { recursive: true });
    await copyFile(legacyBinaryPath, installedBinaryPath);
    await chmod(installedBinaryPath, 0o755);
    const legacyVersionPath = join(dirname(legacyBinaryPath), "VERSION");
    if (existsSync(legacyVersionPath)) {
      await copyFile(legacyVersionPath, join(installRoot, "VERSION")).catch(() => undefined);
    }
  }

  async function downloadReleaseFile(name: string, destination: string) {
    let lastError: unknown = null;
    for (const base of releaseMirrors) {
      try {
        const response = await fetch(`${base}/${name}`);
        if (!response.ok || !response.body) throw new Error(`download failed: ${response.status} ${response.statusText}`);
        await pipeline(response.body as any, createWriteStream(destination));
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Unable to download ${name}`);
  }

  async function verifySha256(filePath: string, sumsPath: string, asset: string) {
    const sums = await readFile(sumsPath, "utf8");
    const expected = sums
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .find((parts) => parts[1] === asset)?.[0];
    if (!expected) throw new Error(`OfficeCLI checksum not found for ${asset}`);
    const actual = createHash("sha256").update(await readFile(filePath)).digest("hex");
    if (actual !== expected) throw new Error("OfficeCLI checksum mismatch.");
    await writeFile(join(installRoot, "VERSION"), `${officeCliVersion}\n`, "utf8");
  }

  function resolveOfficeCliAsset(sums: string) {
    const assetOverride = process.env[`${options.envPrefix}_OFFICECLI_ASSET`];
    if (assetOverride) return assetOverride;
    const platformAliases = officeCliPlatformAliases();
    const archAliases = officeCliArchAliases();
    const assets = sums
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[1])
      .filter((asset): asset is string => Boolean(asset));
    return assets.find((asset) => {
      const normalized = asset.toLowerCase();
      return normalized.includes("officecli") && platformAliases.some((item) => normalized.includes(item)) && archAliases.some((item) => normalized.includes(item));
    });
  }

  return {
    getOfficeCliStatus,
    installOfficeCli,
    requireOfficeCli,
    officeCliEnv,
    officeCliEnvSync,
  };
}

function resolveOfficeCliInstallRoot(options: OfficeCliToolchainOptions, officeCliVersion: string) {
  const directRoot =
    process.env[`${options.envPrefix}_OFFICECLI_INSTALL_ROOT`]?.trim() ||
    process.env.AI_OFFICE_OFFICECLI_INSTALL_ROOT?.trim() ||
    process.env.TUTTI_APP_OFFICECLI_INSTALL_ROOT?.trim();
  if (directRoot) return resolve(directRoot);

  const toolchainRoot =
    process.env.AI_OFFICE_TOOLCHAIN_ROOT?.trim() ||
    process.env.TUTTI_APP_TOOLCHAIN_ROOT?.trim();
  if (toolchainRoot) return resolve(toolchainRoot, "officecli", officeCliVersion, officeCliPlatformArch());

  return resolve(options.appRoot, "toolchains", "officecli");
}

function resolveLegacyOfficeCliBinaryPaths(options: OfficeCliToolchainOptions, officeCliVersion: string, installedBinaryPath: string) {
  const unversionedRoots = [
    resolve(options.appRoot, "toolchains", "officecli"),
    legacyToolchainRoot(process.env.AI_OFFICE_TOOLCHAIN_ROOT?.trim()),
    legacyToolchainRoot(process.env.TUTTI_APP_TOOLCHAIN_ROOT?.trim()),
    legacyWorkspaceRoot(process.env.TUTTI_WORKSPACE_ROOT?.trim()),
    join(homedir(), ".ai-office", "toolchains", "officecli"),
  ].filter((root): root is string => Boolean(root));
  const versionedRoots = [
    versionedToolchainRoot(process.env.AI_OFFICE_TOOLCHAIN_ROOT?.trim(), officeCliVersion),
    versionedToolchainRoot(process.env.TUTTI_APP_TOOLCHAIN_ROOT?.trim(), officeCliVersion),
  ].filter((root): root is string => Boolean(root));

  return uniqueStrings(
    [...unversionedRoots, ...versionedRoots]
      .map((root) => join(root, officeCliBinaryName()))
      .filter((candidate) => candidate !== installedBinaryPath),
  );
}

function legacyToolchainRoot(toolchainRoot?: string) {
  return toolchainRoot ? resolve(toolchainRoot, "officecli") : "";
}

function versionedToolchainRoot(toolchainRoot: string | undefined, officeCliVersion: string) {
  return toolchainRoot ? resolve(toolchainRoot, "officecli", officeCliVersion, officeCliPlatformArch()) : "";
}

function legacyWorkspaceRoot(workspaceRoot?: string) {
  return workspaceRoot ? resolve(workspaceRoot, ".ai-office", "toolchains", "officecli") : "";
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function officeCliBinaryName() {
  return process.platform === "win32" ? "officecli.exe" : "officecli";
}

function officeCliPlatformArch() {
  return `${platform()}-${arch()}`;
}

function officeCliEnvForPath(executablePath: string) {
  return {
    OFFICECLI: executablePath,
    OFFICECLI_NO_AUTO_RESIDENT: "1",
    PATH: `${dirname(executablePath)}:${process.env.PATH ?? ""}`,
  };
}

function parseOfficeCliVersion(output: string) {
  return output.match(/\d+\.\d+\.\d+(?:[-+\w.]*)?/)?.[0] ?? (output || undefined);
}

function canInstallOfficeCli() {
  return Boolean(officeCliPlatformAliases().length && officeCliArchAliases().length);
}

function officeCliPlatformAliases() {
  if (platform() === "darwin") return ["darwin", "macos", "mac", "osx"];
  if (platform() === "linux") return ["linux"];
  if (platform() === "win32") return ["windows", "win"];
  return [];
}

function officeCliArchAliases() {
  if (arch() === "x64") return ["x64", "amd64"];
  if (arch() === "arm64") return ["arm64", "aarch64"];
  return [];
}
