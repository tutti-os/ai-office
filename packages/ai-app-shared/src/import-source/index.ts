import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface WorkspaceImportSourceOptions {
  workspaceEnvVars: string[];
}

export function resolveWorkspaceImportSourcePath(inputPath: string, options: WorkspaceImportSourceOptions) {
  const trimmed = inputPath.trim();
  if (!trimmed) throw new Error("path is required");
  const expanded = expandHomePath(trimmed);
  if (isAbsolute(expanded)) return resolve(expanded);
  return resolve(workspaceRoot(options.workspaceEnvVars), expanded);
}

function expandHomePath(value: string) {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return value;
}

function workspaceRoot(envVars: string[]) {
  for (const envVar of envVars) {
    const value = process.env[envVar]?.trim();
    if (value) return value;
  }
  return process.cwd();
}
