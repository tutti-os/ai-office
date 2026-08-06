import {
  createAppPaths,
  ensureBaseDirs as ensureSharedBaseDirs,
  ensureProjectDirs as ensureSharedProjectDirs,
  projectLocalAgentStateRoot as sharedProjectLocalAgentStateRoot,
  safePathSegment,
} from "@ai-app/shared/local-paths";
import { join } from "node:path";

export const appPaths = createAppPaths({
  homeEnvVar: "AI_SHEET_HOME",
  defaultHomeDirName: ".ai-sheet-dev",
  dbFileName: "ai-sheet.db",
});

export function ensureBaseDirs() {
  ensureSharedBaseDirs(appPaths);
}

export function projectWorkspaceRoot(projectId: string) {
  return join(appPaths.projectsDir, safePathSegment(projectId));
}

/** VM-local root for local-agent resume pointers (TUTTI_APP_DATABASE_DIR). */
export function projectLocalAgentStateRoot(projectId: string) {
  return sharedProjectLocalAgentStateRoot(appPaths, projectId);
}

export function ensureProjectDirs(projectId: string) {
  return ensureSharedProjectDirs(appPaths, projectId);
}
