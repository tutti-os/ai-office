import {
  createAppPaths,
  ensureBaseDirs as ensureSharedBaseDirs,
  ensureProjectDirs as ensureSharedProjectDirs,
  projectWorkspaceRoot as sharedProjectWorkspaceRoot,
} from "@ai-app/shared/local-paths";

export const appPaths = createAppPaths({
  homeEnvVar: "AI_SLIDE_HOME",
  defaultHomeDirName: ".ai-slide-dev",
  dbFileName: "ai-slide.db",
});

export function ensureBaseDirs() {
  ensureSharedBaseDirs(appPaths);
}

export function projectWorkspaceRoot(projectId: string) {
  return sharedProjectWorkspaceRoot(appPaths, projectId);
}

export function ensureProjectDirs(projectId: string) {
  return ensureSharedProjectDirs(appPaths, projectId);
}
