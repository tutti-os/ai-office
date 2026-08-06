import {
  createAppPaths,
  ensureBaseDirs as ensureSharedBaseDirs,
  projectLocalAgentStateRoot as sharedProjectLocalAgentStateRoot,
  projectPrivateStateRoot as sharedProjectPrivateStateRoot,
  safePathSegment,
} from "@ai-app/shared/local-paths";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const appPaths = createAppPaths({
  homeEnvVar: "AI_SLIDE_HOME",
  defaultHomeDirName: ".ai-slide-dev",
  dbFileName: "ai-slide.db",
});

const projectRootOverrides = new Map<string, string>();

export function ensureBaseDirs() {
  ensureSharedBaseDirs(appPaths);
}

/** Private app-owned root (sidecars). VM database dir on TSH. */
export function projectPrivateRoot(projectId: string) {
  return sharedProjectPrivateStateRoot(appPaths, projectId);
}

/** VM-local root for local-agent resume pointers (TUTTI_APP_DATABASE_DIR). */
export function projectLocalAgentStateRoot(projectId: string) {
  return sharedProjectLocalAgentStateRoot(appPaths, projectId);
}

/** TSH-bound workspace root under /workspace, if any. */
export function boundWorkspaceRoot(projectId: string): string | null {
  return projectRootOverrides.get(projectId) ?? null;
}

export function isTshDirectoryArtifactProject(projectId: string): boolean {
  return Boolean(boundWorkspaceRoot(projectId));
}

export function projectWorkspaceRoot(projectId: string) {
  return boundWorkspaceRoot(projectId) ?? join(appPaths.projectsDir, safePathSegment(projectId));
}

export function bindProjectWorkspaceRoot(projectId: string, root: string) {
  projectRootOverrides.set(projectId, resolve(root));
}

export function unbindProjectWorkspaceRoot(projectId: string) {
  projectRootOverrides.delete(projectId);
}

export function clearProjectWorkspaceRootBindings() {
  projectRootOverrides.clear();
}

export function ensureProjectDirs(projectId: string) {
  const root = projectWorkspaceRoot(projectId);
  mkdirSync(join(root, "exports"), { recursive: true });
  mkdirSync(join(root, "snapshots"), { recursive: true });
  return root;
}
