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

export function hasInjectedDatabaseDir(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.TUTTI_APP_DATABASE_DIR?.trim());
}

export function ensureBaseDirs(paths: Pick<AppPaths, "dataDir" | "databaseDir" | "projectsDir">) {
  mkdirSync(paths.databaseDir, { recursive: true });
  // On TSH, durable private state belongs in databaseDir — do not seed FabricFS
  // DATA_DIR / .tsh project trees.
  if (!hasInjectedDatabaseDir()) {
    mkdirSync(paths.dataDir, { recursive: true });
    mkdirSync(paths.projectsDir, { recursive: true });
  }
}

/**
 * Legacy HOME/projects path. Prefer {@link projectPrivateStateRoot} for private
 * sidecars; on TSH that root lives under TUTTI_APP_DATABASE_DIR.
 */
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

/**
 * Private per-project app state (sidecars, assets cache, default exports).
 * On TSH (injected database dir): under TUTTI_APP_DATABASE_DIR.
 * Local/dev without injection: legacy HOME/projects/{id}.
 */
export function projectPrivateStateRoot(
  paths: Pick<AppPaths, "databaseDir" | "projectsDir">,
  projectId: string,
) {
  if (hasInjectedDatabaseDir()) {
    return join(paths.databaseDir, "project-private", safePathSegment(projectId));
  }
  return projectWorkspaceRoot(paths, projectId);
}

/** Parent directory that contains per-project private state roots. */
export function privateProjectsParentDir(
  paths: Pick<AppPaths, "databaseDir" | "projectsDir">,
) {
  if (hasInjectedDatabaseDir()) {
    return join(paths.databaseDir, "project-private");
  }
  return paths.projectsDir;
}

export function ensureProjectDirs(
  paths: Pick<AppPaths, "databaseDir" | "projectsDir">,
  projectId: string,
) {
  const rootDir = projectPrivateStateRoot(paths, projectId);
  mkdirSync(join(rootDir, "exports"), { recursive: true });
  mkdirSync(join(rootDir, "snapshots"), { recursive: true });
  return rootDir;
}

export function safePathSegment(value: string) {
  return value.replace(/[^\w.-]+/g, "_") || "unknown";
}
