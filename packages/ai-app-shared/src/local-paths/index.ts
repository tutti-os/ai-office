import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface AppPathOptions {
  homeEnvVar: string;
  defaultHomeDirName: string;
  dbFileName?: string;
}

export interface AppPaths {
  root: string;
  dataDir: string;
  /** VM-local private state root (TUTTI_APP_DATABASE_DIR when injected). */
  databaseDir: string;
  projectsDir: string;
  dbPath: string;
}

export function createAppPaths(options: AppPathOptions): AppPaths {
  const envHome = process.env[options.homeEnvVar];
  const root = envHome ? resolve(envHome) : join(homedir(), options.defaultHomeDirName);
  const databaseDir = process.env.TUTTI_APP_DATABASE_DIR?.trim()
    ? resolve(process.env.TUTTI_APP_DATABASE_DIR)
    : join(root, "data");
  return {
    root,
    dataDir: join(root, "data"),
    databaseDir,
    projectsDir: join(root, "projects"),
    dbPath: join(databaseDir, options.dbFileName ?? `${options.defaultHomeDirName.replace(/^\./, "")}.db`),
  };
}

export function ensureBaseDirs(paths: Pick<AppPaths, "dataDir" | "projectsDir">) {
  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(paths.projectsDir, { recursive: true });
}

export function projectWorkspaceRoot(paths: Pick<AppPaths, "projectsDir">, projectId: string) {
  return join(paths.projectsDir, safePathSegment(projectId));
}

/**
 * VM-local private root for local-agent resume/session pointers.
 * Prefer TUTTI_APP_DATABASE_DIR — do not put these under user-visible /workspace
 * or FabricFS app-data trees.
 */
export function projectLocalAgentStateRoot(
  paths: Pick<AppPaths, "databaseDir">,
  projectId: string,
) {
  return join(paths.databaseDir, "local-agent-state", safePathSegment(projectId));
}

export function ensureProjectDirs(paths: Pick<AppPaths, "projectsDir">, projectId: string) {
  const rootDir = projectWorkspaceRoot(paths, projectId);
  mkdirSync(join(rootDir, "exports"), { recursive: true });
  mkdirSync(join(rootDir, "snapshots"), { recursive: true });
  return rootDir;
}

export function safePathSegment(value: string) {
  return value.replace(/[^\w.-]/g, "_") || "unknown";
}
