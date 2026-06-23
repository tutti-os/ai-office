import { execFile } from "node:child_process";

export interface TuttiCliStatus {
  configured: boolean;
  executablePath: string | null;
  status: unknown | null;
  error: string | null;
}

export function configuredTuttiCliPath() {
  return process.env.AI_SHEET_TUTTI_CLI?.trim() || process.env.TUTTI_CLI?.trim() || "";
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

export function runTuttiCli(args: string[], timeoutMs = 15000) {
  const executablePath = configuredTuttiCliPath();
  if (!executablePath) throw new Error("TUTTI_CLI is not configured");
  return new Promise<unknown>((resolve, reject) => {
    execFile(executablePath, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch {
        resolve(stdout.trim());
      }
    });
  });
}
