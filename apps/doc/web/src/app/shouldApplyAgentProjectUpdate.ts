import type { DocumentProject } from "@ai-doc/shared";

/** Whether a streamed/hydrated project update should reload the editor surface. */
export function shouldApplyAgentProjectUpdate(project: DocumentProject, current: DocumentProject | null) {
  if (current && project.id !== current.id) return false;
  // Human autosave/title echoes must not remount TipTap under the caret.
  if (project.updatedBy === "human") return false;
  if (!current) return true;
  if (project.content !== current.content) return true;
  return timestampMs(project.updatedAt) > timestampMs(current.updatedAt);
}

function timestampMs(value: string | null | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}
