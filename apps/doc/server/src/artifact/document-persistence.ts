import type { DatabaseSync } from "node:sqlite";

export interface DocumentProjectPersistenceInput {
  id: string;
  title: string;
  type: string;
  content: string;
  templateId: string | null;
  templateName: string | null;
  now: string;
}

export function insertDocumentProject(db: DatabaseSync, input: DocumentProjectPersistenceInput) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO projects (id, title, type, content, template_id, template_name, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'system', ?, ?)`,
    ).run(input.id, input.title, input.type, input.content, input.templateId, input.templateName, input.now, input.now);
    db.prepare(
      `INSERT INTO project_preparation (project_id, core_state, agent_context_state, updated_at)
       VALUES (?, 'preparing', 'pending', ?)`,
    ).run(input.id, input.now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
