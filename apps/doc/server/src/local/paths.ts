import {
  createAppPaths,
  ensureBaseDirs as ensureSharedBaseDirs,
  ensureProjectDirs as ensureSharedProjectDirs,
  projectWorkspaceRoot as sharedProjectWorkspaceRoot,
} from "@ai-app/shared/local-paths";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

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
  const root = ensureSharedProjectDirs(appPaths, projectId);
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(join(root, "exports"), { recursive: true });
  return root;
}
