import type {
  AppSnapshot,
  ApplySheetCommandsRequest,
  ApplySheetCommandsResponse,
  AiEditRequest,
  AiEditResponse,
  CreateProjectRequest,
  LocalAgentTargetStatusResponse,
  OfficeCliStatusResponse,
  ProjectDetailResponse,
  ProjectRunsResponse,
  ProjectResponse,
  ProjectsResponse,
  SheetProject,
  UpdateProjectRequest,
} from "@ai-sheet/shared";
import { requestArrayBuffer, requestJson } from "@ai-app/shared/api-client";
import type { ContextAttachmentUploadResponse } from "@ai-app/shared/context-attachments";

export async function fetchBootstrapSnapshot() {
  return requestJson<AppSnapshot>("/api/bootstrap");
}

export async function createProject(input: CreateProjectRequest) {
  return requestJson<ProjectDetailResponse>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export async function getProject(projectId: string) {
  return requestJson<ProjectDetailResponse>(`/api/projects/${encodeURIComponent(projectId)}`);
}

export async function listProjects(): Promise<SheetProject[]> {
  const response = await requestJson<ProjectsResponse>("/api/projects");
  return response.projects;
}

export async function fetchOfficeCliStatus() {
  return requestJson<OfficeCliStatusResponse>("/api/toolchains/officecli");
}

export async function fetchLocalAgentTargets() {
  return requestJson<LocalAgentTargetStatusResponse>("/api/local-agent/targets");
}

export async function installOfficeCli() {
  return requestJson<OfficeCliStatusResponse>("/api/toolchains/officecli/install", { method: "POST" });
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

export async function updateProject(projectId: string, input: UpdateProjectRequest) {
  return requestJson<ProjectResponse>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getProjectXlsxFile(projectId: string) {
  return requestArrayBuffer(`/api/projects/${encodeURIComponent(projectId)}/files/workbook.xlsx`);
}

export async function applyProjectCommands(projectId: string, input: ApplySheetCommandsRequest) {
  return requestJson<ApplySheetCommandsResponse>(`/api/projects/${encodeURIComponent(projectId)}/commands`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type ProjectExportWriteResponse = {
  path: string;
  absolutePath: string;
  exportsDir: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function exportProjectXlsxFile(projectId: string, input: { targetDirectory?: string | null } = {}) {
  const targetDirectory = input.targetDirectory?.trim() || "";
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/exports/xlsx`, {
    method: "POST",
    headers: targetDirectory ? { "x-export-directory": encodeURIComponent(targetDirectory) } : undefined,
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
