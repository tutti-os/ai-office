import { execFile } from "node:child_process";

import type { TuttiAppOpenResult } from "../types/index.js";

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

export function createTuttiCliClient(appCliEnvName: string) {
  function configuredTuttiCliPath() {
    return (
      process.env[appCliEnvName]?.trim() || process.env.TUTTI_CLI?.trim() || ""
    );
  }

  function tuttiCliEnv(): Record<string, string> {
    const executablePath = configuredTuttiCliPath();
    return executablePath ? { TUTTI_CLI: executablePath } : {};
  }

  async function runTuttiCli(
    args: string[],
    optionsOrTimeoutMs: RunTuttiCliOptions | number = 15_000,
  ) {
    const executablePath = configuredTuttiCliPath();
    if (!executablePath) throw new Error("TUTTI_CLI is not configured");
    const options =
      typeof optionsOrTimeoutMs === "number"
        ? { timeoutMs: optionsOrTimeoutMs }
        : optionsOrTimeoutMs;
    return new Promise<unknown>((resolve, reject) => {
      execFile(
        executablePath,
        args,
        {
          timeout: options.timeoutMs ?? 15_000,
          cwd: options.cwd,
          maxBuffer: options.maxBuffer ?? 1024 * 1024,
        },
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

  async function getTuttiCliStatus(): Promise<TuttiCliStatus> {
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
        status: await runTuttiCli(["--json", "status"], 5_000),
        error: null,
      };
    } catch (error) {
      return {
        configured: true,
        executablePath,
        status: null,
        error:
          error instanceof Error ? error.message : "Unable to run TUTTI_CLI.",
      };
    }
  }

  async function openTuttiAppRoute(
    appId: string,
    route: string,
    timeoutMs = 10_000,
  ): Promise<TuttiAppOpenResult> {
    if (!configuredTuttiCliPath()) {
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
        result: await runTuttiCli(
          ["--json", "app", "open", "--app-id", appId, "--route", route],
          timeoutMs,
        ),
        error: null,
      };
    } catch (error) {
      return {
        attempted: true,
        configured: true,
        appId,
        route,
        result: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to open Tutti app route.",
      };
    }
  }

  return {
    configuredTuttiCliPath,
    getTuttiCliStatus,
    openTuttiAppRoute,
    runTuttiCli,
    tuttiCliEnv,
  };
}
