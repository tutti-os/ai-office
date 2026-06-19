import type {
  AiEditRequest,
  AiEditResponse,
  CreateProjectRequest,
  DocumentProject,
  ProjectRunsResponse,
  UpdateProjectRequest,
} from "@ai-doc/shared";
import { requestArrayBuffer, requestJson } from "@ai-app/shared/api-client";

type ProjectResponse = {
  project: DocumentProject;
};

type ProjectsResponse = {
  projects: DocumentProject[];
};

export async function createProject(input: CreateProjectRequest) {
  return requestProject("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getProject(projectId: string) {
  return requestProject(`/api/projects/${encodeURIComponent(projectId)}`);
}

export async function getProjectDocxFile(projectId: string) {
  return requestArrayBuffer(`/api/projects/${encodeURIComponent(projectId)}/files/document.docx`);
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

async function requestProject(path: string, init: RequestInit = {}) {
  const data = await requestJson<ProjectResponse | { error?: string }>(path, init);
  if (!data || !("project" in data)) throw new Error("Project response is missing project data");
  return data.project;
}
