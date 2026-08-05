import {
  createAppPaths,
  ensureBaseDirs as ensureSharedBaseDirs,
  ensureProjectDirs as ensureSharedProjectDirs,
  projectLocalAgentStateRoot as sharedProjectLocalAgentStateRoot,
  projectPrivateStateRoot as sharedProjectPrivateStateRoot,
} from "@ai-app/shared/local-paths";

export const appPaths = createAppPaths({
  homeEnvVar: "AI_SHEET_HOME",
  defaultHomeDirName: ".ai-sheet-dev",
  dbFileName: "ai-sheet.db",
});

export function ensureBaseDirs() {
  ensureSharedBaseDirs(appPaths);
}

export function projectWorkspaceRoot(projectId: string) {
  return sharedProjectPrivateStateRoot(appPaths, projectId);
}

/** VM-local root for local-agent resume pointers (TUTTI_APP_DATABASE_DIR). */
export function projectLocalAgentStateRoot(projectId: string) {
  return sharedProjectLocalAgentStateRoot(appPaths, projectId);
}

export function ensureProjectDirs(projectId: string) {
  return ensureSharedProjectDirs(appPaths, projectId);
}
