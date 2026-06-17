import {
  createAppPaths,
  ensureBaseDirs as ensureSharedBaseDirs,
  ensureProjectDirs as ensureSharedProjectDirs,
  projectWorkspaceRoot as sharedProjectWorkspaceRoot,
} from "@ai-app/shared/local-paths";

export const appPaths = createAppPaths({
  homeEnvVar: "AI_DOC_HOME",
  defaultHomeDirName: ".ai-doc-dev",
  dbFileName: "ai-doc.db",
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
