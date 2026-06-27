import { execFile } from "node:child_process";
import { delimiter, dirname, isAbsolute } from "node:path";
import { localAgentProviderIdsMatch } from "@ai-app/shared/agent-providers";
import type { TuttiAppOpenResult } from "@ai-app/shared/types";

export interface RunTuttiCliOptions {
  timeoutMs?: number;
  cwd?: string;
  maxBuffer?: number;
}

export interface TuttiCliStatus {
  configured: boolean;
  executablePath: string | null;
  status: unknown | null;
  error: string | null;
}

export interface TuttiAgentProviderStatus {
  provider: string;
  status: string;
  detail?: string;
}

export interface TuttiAgentProviders {
  defaultProvider?: string;
  providers: TuttiAgentProviderStatus[];
}

export function configuredTuttiCliPath() {
  return process.env.AI_DOC_TUTTI_CLI?.trim() || process.env.TUTTI_CLI?.trim() || "";
}

export function tuttiCliEnv(): Record<string, string> {
  const executablePath = configuredTuttiCliPath();
  return executablePath ? { TUTTI_CLI: executablePath } : {};
}

export async function tuttiAgentProviderEnv(provider: string, timeoutMs = 5000): Promise<Record<string, string>> {
  const status = await getAgentProviders(timeoutMs);
  const matched = status.providers.find((item) => localAgentProviderIdsMatch(item.provider, provider) && item.status.toLowerCase() === "available");
  const executablePath = matched?.detail?.trim();
  if (!executablePath || !isAbsolute(executablePath)) return {};
  return { PATH: prependPathDir(dirname(executablePath), process.env.PATH ?? "") };
}

export async function getTuttiCliStatus(): Promise<TuttiCliStatus> {
  const executablePath = configuredTuttiCliPath();
  if (!executablePath) {
    return {
      configured: false,
      executablePath: null,
      status: null,
      error: null,
    };
  }
  try {
    return {
      configured: true,
      executablePath,
      status: await runTuttiCli(["--json", "status"], 5000),
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      executablePath,
      status: null,
      error: error instanceof Error ? error.message : "Unable to run TUTTI_CLI.",
    };
  }
}

export async function getDefaultAgentProvider(timeoutMs = 5000): Promise<string | undefined> {
  return (await getAgentProviders(timeoutMs)).defaultProvider;
}

export async function getAgentProviders(timeoutMs = 5000): Promise<TuttiAgentProviders> {
  const output = await runTuttiCli(["--json", "agent", "providers"], timeoutMs);
  return readAgentProviders(output);
}

export function runTuttiCli(args: string[], optionsOrTimeoutMs: RunTuttiCliOptions | number = 15000) {
  const executablePath = configuredTuttiCliPath();
  if (!executablePath) throw new Error("TUTTI_CLI is not configured");
  const options = typeof optionsOrTimeoutMs === "number" ? { timeoutMs: optionsOrTimeoutMs } : optionsOrTimeoutMs;
  return new Promise<unknown>((resolve, reject) => {
    execFile(
      executablePath,
      args,
      { timeout: options.timeoutMs ?? 15000, cwd: options.cwd, maxBuffer: options.maxBuffer ?? 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || stdout || error.message).trim()));
          return;
        }
        try {
          resolve(JSON.parse(stdout || "{}"));
        } catch {
          resolve(stdout.trim());
        }
      },
    );
  });
}

function readDefaultProvider(output: unknown): string | undefined {
  const direct = readStringProperty(output, "defaultProvider");
  if (direct) return direct;
  if (isRecord(output)) {
    return readStringProperty(output.value, "defaultProvider");
  }
  return undefined;
}

function readAgentProviders(output: unknown): TuttiAgentProviders {
  const value = isRecord(output) && isRecord(output.value) ? output.value : output;
  return {
    defaultProvider: readDefaultProvider(value),
    providers: readProviderStatuses(value),
  };
}

function readProviderStatuses(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.providers)) return [];
  return value.providers.flatMap((item): TuttiAgentProviderStatus[] => {
    if (!isRecord(item)) return [];
    const provider = readStringProperty(item, "provider");
    const status = readStringProperty(item, "status");
    if (!provider || !status) return [];
    const detail = readStringProperty(item, "detail");
    return [{ provider, status, ...(detail ? { detail } : {}) }];
  });
}

function readStringProperty(value: unknown, key: string) {
  if (!isRecord(value)) return undefined;
  const property = value[key];
  return typeof property === "string" && property.trim() ? property.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function prependPathDir(dir: string, currentPath: string) {
  const seen = new Set<string>();
  const parts = [dir, ...currentPath.split(delimiter)].flatMap((part) => {
    const normalized = part.trim();
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [normalized];
  });
  return parts.join(delimiter);
}

export async function openTuttiAppRoute(appId: string, route: string, timeoutMs = 10000): Promise<TuttiAppOpenResult> {
  const executablePath = configuredTuttiCliPath();
  if (!executablePath) {
    return {
      attempted: false,
      configured: false,
      appId,
      route,
      result: null,
      error: "TUTTI_CLI is not configured",
    };
  }
  try {
    return {
      attempted: true,
      configured: true,
      appId,
      route,
      result: await runTuttiCli(["--json", "app", "open", "--app-id", appId, "--route", route], timeoutMs),
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      configured: true,
      appId,
      route,
      result: null,
      error: error instanceof Error ? error.message : "Unable to open Tutti app route.",
    };
  }
}
