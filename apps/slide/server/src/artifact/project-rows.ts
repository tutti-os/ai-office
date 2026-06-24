import type { SlideArtifact, SlideProject } from "@ai-slide/shared";

export function projectsWithArtifactTypeSql(input: { orderByUpdatedAt?: boolean; whereProjectId?: boolean } = {}) {
  const where = input.whereProjectId ? "WHERE projects.id = ?" : "";
  const orderBy = input.orderByUpdatedAt ? "ORDER BY projects.updated_at DESC" : "";
  return `
    SELECT projects.*, artifacts.type AS artifact_type
    FROM projects
    LEFT JOIN artifacts ON artifacts.id = projects.active_artifact_id
    ${where}
    ${orderBy}
  `;
}

export function rowToProject(row: ProjectRowWithArtifactType): SlideProject {
  return {
    id: row.id,
    title: row.title,
    activeArtifactId: row.active_artifact_id,
    artifactType: row.artifact_type ?? "deck",
    templateId: row.template_id,
    templateName: row.template_name,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToArtifact(row: ArtifactRow): SlideArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    fileRef: row.file_ref,
    mimeType: row.mime_type,
    revision: row.revision,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ProjectRow {
  id: string;
  title: string;
  active_artifact_id: string;
  template_id: string | null;
  template_name: string | null;
  updated_by: "human" | "ai" | "system";
  created_at: string;
  updated_at: string;
}

export interface ProjectRowWithArtifactType extends ProjectRow {
  artifact_type: "deck" | "pptx" | null;
}

export interface ArtifactRow {
  id: string;
  project_id: string;
  type: "deck" | "pptx";
  file_ref: string;
  mime_type: string;
  revision: number;
  updated_by: "human" | "ai" | "system";
  created_at: string;
  updated_at: string;
}
