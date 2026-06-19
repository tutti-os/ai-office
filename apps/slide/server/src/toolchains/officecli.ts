import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { OfficeCliStatus } from "@ai-slide/shared";
import { appPaths } from "../local/paths.js";

const execFileAsync = promisify(execFile);
const officeCliVersion = process.env.AI_SLIDE_OFFICECLI_VERSION ?? "1.0.103";
const installRoot = join(appPaths.root, "toolchains", "officecli");
const installedBinaryPath = join(installRoot, process.platform === "win32" ? "officecli.exe" : "officecli");
const releaseMirrors = [
  `https://d.officecli.ai/releases/download/v${officeCliVersion}`,
  `https://github.com/iOfficeAI/OfficeCLI/releases/download/v${officeCliVersion}`,
];

let installPromise: Promise<OfficeCliStatus> | null = null;

export async function getOfficeCliStatus(): Promise<OfficeCliStatus> {
  const envPath = process.env.AI_SLIDE_OFFICECLI_PATH?.trim();
  if (envPath) {
    const status = await probeOfficeCli(envPath, "env");
    if (status.available) return status;
    return { ...status, canInstall: canInstallOfficeCli(), installing: Boolean(installPromise) };
  }

  if (existsSync(installedBinaryPath)) {
    const status = await probeOfficeCli(installedBinaryPath, "bundled");
    if (status.available) return { ...status, canInstall: canInstallOfficeCli(), installing: Boolean(installPromise) };
  }

  const pathStatus = await probeOfficeCli("officecli", "path");
  if (pathStatus.available) return { ...pathStatus, canInstall: canInstallOfficeCli(), installing: Boolean(installPromise) };

  return {
    available: false,
    source: "missing",
    canInstall: canInstallOfficeCli(),
    installing: Boolean(installPromise),
    reason: pathStatus.reason || "officecli is not installed or not discoverable.",
  };
}

export async function installOfficeCli(): Promise<OfficeCliStatus> {
  if (installPromise) return installPromise;
  installPromise = doInstallOfficeCli().finally(() => {
    installPromise = null;
  });
  return installPromise;
}

export async function requireOfficeCli() {
  const status = await getOfficeCliStatus();
  if (!status.available) {
    throw new Error(status.canInstall ? "OfficeCLI is required for PPTX. Download OfficeCLI from the home screen first." : (status.reason ?? "OfficeCLI is required for PPTX."));
  }
  return status;
}

export function officeCliEnvSync(): Record<string, string> {
  const envPath = process.env.AI_SLIDE_OFFICECLI_PATH?.trim();
  const executablePath = envPath || (existsSync(installedBinaryPath) ? installedBinaryPath : "");
  if (!executablePath) return {};
  return {
    OFFICECLI: executablePath,
    OFFICECLI_NO_AUTO_RESIDENT: "1",
    PATH: `${dirname(executablePath)}:${process.env.PATH ?? ""}`,
  };
}

async function probeOfficeCli(command: string, source: OfficeCliStatus["source"]): Promise<OfficeCliStatus> {
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

function parseOfficeCliVersion(output: string) {
  return output.match(/\d+\.\d+\.\d+(?:[-+\w.]*)?/)?.[0] ?? (output || undefined);
}

function canInstallOfficeCli() {
  return Boolean(officeCliPlatformAliases().length && officeCliArchAliases().length);
}

function resolveOfficeCliAsset(sums: string) {
  if (process.env.AI_SLIDE_OFFICECLI_ASSET) return process.env.AI_SLIDE_OFFICECLI_ASSET;
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
