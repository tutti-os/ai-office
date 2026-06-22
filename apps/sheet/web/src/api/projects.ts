import type {
  AppSnapshot,
  ProjectDetailResponse,
  ProjectResponse,
  ProjectsResponse,
  SheetProject,
  UpdateProjectRequest,
} from "@ai-sheet/shared";
import { requestArrayBuffer, requestJson } from "@ai-app/shared/api-client";

export async function fetchBootstrapSnapshot() {
  return requestJson<AppSnapshot>("/api/bootstrap");
}

export async function importProjectFile(file: File) {
  return requestJson<ProjectDetailResponse>("/api/projects/import", {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name || "workbook.xlsx"),
    },
    body: await file.arrayBuffer(),
  });
}

export async function getProject(projectId: string) {
  return requestJson<ProjectDetailResponse>(`/api/projects/${encodeURIComponent(projectId)}`);
}

export async function listProjects(): Promise<SheetProject[]> {
  const response = await requestJson<ProjectsResponse>("/api/projects");
  return response.projects;
}

export async function updateProject(projectId: string, input: UpdateProjectRequest) {
  return requestJson<ProjectResponse>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getProjectXlsxFile(projectId: string) {
  return requestArrayBuffer(`/api/projects/${encodeURIComponent(projectId)}/files/workbook.xlsx`);
}

export type ProjectExportWriteResponse = {
  path: string;
  absolutePath: string;
  exportsDir: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function exportProjectXlsxFile(projectId: string) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/exports/xlsx`, { method: "POST" });
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

export async function clearProjectHistory(): Promise<SheetProject[]> {
  const response = await requestJson<ProjectsResponse>("/api/projects", {
    method: "DELETE",
  });
  return response.projects;
}

export async function deleteProject(projectId: string): Promise<SheetProject[]> {
  const response = await requestJson<ProjectsResponse>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
  return response.projects;
}
