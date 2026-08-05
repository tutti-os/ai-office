import type {
  AiEditRequest,
  AiEditResponse,
  CreateProjectRequest,
  DocumentProject,
  ProjectAssetUploadResponse,
  ProjectRunsResponse,
  UpdateProjectRequest,
} from "@ai-doc/shared";
import { requestArrayBuffer, requestJson } from "@ai-app/shared/api-client";
import type { ContextAttachmentUploadResponse } from "@ai-app/shared/context-attachments";

type ProjectResponse = {
  project: DocumentProject;
};

type ProjectsResponse = {
  projects: DocumentProject[];
};

export type ProjectExportWriteResponse = {
  path: string;
  absolutePath: string;
  exportsDir: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function createProject(input: CreateProjectRequest) {
  return requestProject("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function importProjectFile(file: File) {
  return requestProject("/api/projects/import", {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name || "imported-doc"),
      "x-file-mime-type": encodeURIComponent(file.type || "application/octet-stream"),
    },
    body: await file.arrayBuffer(),
  });
}

export async function getProject(projectId: string) {
  return requestProject(`/api/projects/${encodeURIComponent(projectId)}`);
}

export async function getProjectDocxFile(projectId: string) {
  return requestArrayBuffer(`/api/projects/${encodeURIComponent(projectId)}/files/document.docx`);
}

export async function uploadProjectAsset(projectId: string, file: File) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name || "asset"),
      "x-file-mime-type": encodeURIComponent(file.type || "application/octet-stream"),
    },
    body: await file.arrayBuffer(),
  });
  const data = (await response.json().catch(() => null)) as ProjectAssetUploadResponse | { error?: string } | null;
  if (!response.ok) throw new Error(data && "error" in data && data.error ? data.error : `Asset upload failed: ${response.status}`);
  if (!data || !("path" in data)) throw new Error("Asset upload response is missing asset path");
  return data;
}

export async function uploadContextAttachment(projectId: string, file: File) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/context-attachments`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name || "attachment"),
      "x-file-mime-type": encodeURIComponent(file.type || "application/octet-stream"),
    },
    body: await file.arrayBuffer(),
  });
  const data = (await response.json().catch(() => null)) as ContextAttachmentUploadResponse | { error?: string } | null;
  if (!response.ok) throw new Error(data && "error" in data && data.error ? data.error : `Context attachment upload failed: ${response.status}`);
  if (!data || !("path" in data)) throw new Error("Context attachment upload response is missing path");
  return data;
}

export async function writeProjectExport(
  projectId: string,
  input: {
    fileName: string;
    mimeType: string;
    content: string | Uint8Array | ArrayBuffer;
    targetDirectory?: string | null;
  },
) {
  const bytes = typeof input.content === "string" ? new TextEncoder().encode(input.content) : input.content;
  const targetDirectory = input.targetDirectory?.trim() || "";
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/exports`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(input.fileName || "export"),
      "x-mime-type": encodeURIComponent(input.mimeType),
      ...(targetDirectory ? { "x-export-directory": encodeURIComponent(targetDirectory) } : {}),
    },
    body: bytes instanceof Uint8Array ? bytes.slice().buffer : bytes,
  });
  const data = (await response.json().catch(() => null)) as ProjectExportWriteResponse | { error?: string } | null;
  if (!response.ok) throw new Error(data && "error" in data && data.error ? data.error : `Export failed: ${response.status}`);
  if (!data || !("path" in data)) throw new Error("Export response is missing export path");
  return data;
}

export async function openProjectExportsDir(projectId: string) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/exports/open`, { method: "POST" });
  const data = (await response.json().catch(() => null)) as { path?: string; error?: string } | null;
  if (!response.ok) throw new Error(data?.error || `Unable to open exports folder: ${response.status}`);
  return data;
}

export async function listProjects() {
  const response = await requestJson<ProjectsResponse>("/api/projects");
  return response.projects;
}

export async function updateProject(projectId: string, input: UpdateProjectRequest) {
  return requestProject(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listProjectRuns(projectId: string) {
  const response = await requestJson<ProjectRunsResponse>(`/api/projects/${encodeURIComponent(projectId)}/runs`);
  return response.runs;
}

export async function startAiEdit(projectId: string, input: AiEditRequest) {
  const response = await requestJson<AiEditResponse>(`/api/projects/${encodeURIComponent(projectId)}/ai-edit`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.run;
}

export async function cancelRun(runId: string) {
  const response = await requestJson<AiEditResponse>(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
  return response.run;
}

export async function clearProjectHistory() {
  const response = await requestJson<ProjectsResponse>("/api/projects", {
    method: "DELETE",
  });
  return response.projects;
}

export async function deleteProject(projectId: string) {
  const response = await requestJson<ProjectsResponse>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
  return response.projects;
}

async function requestProject(path: string, init: RequestInit = {}) {
  const data = await requestJson<ProjectResponse | { error?: string }>(path, init);
  if (!data || !("project" in data)) throw new Error("Project response is missing project data");
  return data.project;
}
