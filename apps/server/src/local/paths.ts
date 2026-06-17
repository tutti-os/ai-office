import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = process.env.AI_DOCUMENT_HOME
  ? resolve(process.env.AI_DOCUMENT_HOME)
  : join(homedir(), ".ai-document");

export const appPaths = {
  root,
  dataDir: join(root, "data"),
  projectsDir: join(root, "projects"),
  runsDir: join(root, "runs"),
  dbPath: join(root, "data", "ai-document.db"),
};

export function ensureBaseDirs() {
  mkdirSync(appPaths.dataDir, { recursive: true });
  mkdirSync(appPaths.projectsDir, { recursive: true });
  mkdirSync(appPaths.runsDir, { recursive: true });
}

export function projectWorkspaceRoot(projectId: string) {
  return join(appPaths.projectsDir, safePathSegment(projectId));
}

export function ensureProjectDirs(projectId: string) {
  const rootDir = projectWorkspaceRoot(projectId);
  mkdirSync(join(rootDir, "snapshots"), { recursive: true });
  mkdirSync(join(rootDir, "exports"), { recursive: true });
  return rootDir;
}

function safePathSegment(value: string) {
  return value.replace(/[^\w.-]/g, "_") || "unknown";
}
