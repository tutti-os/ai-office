import { execFile } from "node:child_process";

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

export function configuredTuttiCliPath() {
  return process.env.AI_SLIDE_TUTTI_CLI?.trim() || process.env.TUTTI_CLI?.trim() || "";
}

export function tuttiCliEnv(): Record<string, string> {
  const executablePath = configuredTuttiCliPath();
  return executablePath ? { TUTTI_CLI: executablePath } : {};
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
