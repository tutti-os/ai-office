import {
  createAppPaths,
  ensureBaseDirs as ensureSharedBaseDirs,
  projectLocalAgentStateRoot as sharedProjectLocalAgentStateRoot,
  projectPrivateStateRoot as sharedProjectPrivateStateRoot,
  safePathSegment,
} from "@ai-app/shared/local-paths";
import { isTshFileArtifactPath } from "@ai-app/shared/tsh-host";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DocumentProject } from "@ai-doc/shared";

export const appPaths = createAppPaths({
  homeEnvVar: "AI_DOC_HOME",
  defaultHomeDirName: ".ai-doc-dev",
  dbFileName: "ai-doc.db",
});

/**
 * Bound workspace_root values:
 * - Tutti: unset → app-data projects/{id}
 * - TSH legacy: directory under /workspace → that directory is the workspace root
 * - TSH single-file: .html/.md/.docx under /workspace → private projects/{id} for sidecars;
 *   focused artifact is the file path itself
 */
const projectRootOverrides = new Map<string, string>();

export function ensureBaseDirs() {
  ensureSharedBaseDirs(appPaths);
}

/** Private sidecars: VM database dir on TSH, legacy HOME/projects locally. */
export function projectPrivateRoot(projectId: string) {
  return sharedProjectPrivateStateRoot(appPaths, projectId);
}

/** VM-local root for local-agent resume pointers (TUTTI_APP_DATABASE_DIR). */
export function projectLocalAgentStateRoot(projectId: string) {
  return sharedProjectLocalAgentStateRoot(appPaths, projectId);
}

export function boundWorkspaceRoot(projectId: string): string | null {
  return projectRootOverrides.get(projectId) ?? null;
}

export function isTshFileArtifactProject(projectId: string): boolean {
  const bound = boundWorkspaceRoot(projectId);
  return Boolean(bound && isTshFileArtifactPath(bound));
}

export function projectWorkspaceRoot(projectId: string) {
  const bound = boundWorkspaceRoot(projectId);
  if (bound && isTshFileArtifactPath(bound)) return projectPrivateRoot(projectId);
  return bound ?? join(appPaths.projectsDir, safePathSegment(projectId));
}

/** User-visible export directory for generated files. Single-file TSH projects
 * keep sidecars private but publish exports beside the bound workspace file. */
export function projectExportsRoot(projectId: string) {
  const bound = boundWorkspaceRoot(projectId);
  if (bound && isTshFileArtifactPath(bound)) return join(dirname(bound), "exports");
  return join(projectWorkspaceRoot(projectId), "exports");
}

export function projectFocusedArtifactPath(projectId: string, type: DocumentProject["type"]) {
  const bound = boundWorkspaceRoot(projectId);
  if (bound && isTshFileArtifactPath(bound)) return bound;
  return join(projectWorkspaceRoot(projectId), focusedProjectFileName(type));
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
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(projectExportsRoot(projectId), { recursive: true });
  mkdirSync(join(root, "snapshots"), { recursive: true });
  return root;
}

export function focusedProjectFileName(type: DocumentProject["type"]) {
  if (type === "docx") return "document.docx";
  if (type === "markdown") return "document.md";
  return "document.html";
}

export { safePathSegment };
