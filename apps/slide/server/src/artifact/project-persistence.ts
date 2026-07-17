import type { DatabaseSync } from "node:sqlite";

export interface ProjectPersistenceInput {
  project: {
    id: string;
    title: string;
    activeArtifactId: string;
    templateId: string | null;
    templateName: string | null;
  };
  artifact: {
    id: string;
    type: string;
    fileRef: string;
    mimeType: string;
  };
  now: string;
}

export function insertProjectWithArtifact(db: DatabaseSync, input: ProjectPersistenceInput) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO projects (id, title, active_artifact_id, template_id, template_name, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'system', ?, ?)`,
    ).run(input.project.id, input.project.title, input.project.activeArtifactId, input.project.templateId, input.project.templateName, input.now, input.now);
    db.prepare(
      `INSERT INTO artifacts (id, project_id, type, file_ref, mime_type, revision, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 'system', ?, ?)`,
    ).run(input.artifact.id, input.project.id, input.artifact.type, input.artifact.fileRef, input.artifact.mimeType, input.now, input.now);
    db.prepare(
      `INSERT INTO project_preparation (project_id, core_state, agent_context_state, updated_at)
       VALUES (?, 'preparing', 'pending', ?)`,
    ).run(input.project.id, input.now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
