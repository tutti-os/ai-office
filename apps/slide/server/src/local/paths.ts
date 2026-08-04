import {
  createAppPaths,
  ensureBaseDirs as ensureSharedBaseDirs,
  projectWorkspaceRoot as sharedProjectWorkspaceRoot,
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

export function projectWorkspaceRoot(projectId: string) {
  return projectRootOverrides.get(projectId) ?? sharedProjectWorkspaceRoot(appPaths, projectId);
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
