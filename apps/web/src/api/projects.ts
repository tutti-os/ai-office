import type {
  AiEditRequest,
  AiEditResponse,
  CreateProjectRequest,
  DocumentProject,
  ProjectRunsResponse,
  UpdateProjectRequest,
} from "@ai-document/shared";

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
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/document.docx`);
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed: ${response.status}`);
  }
  return response.arrayBuffer();
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

async function requestJson<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
  });
  const data = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const message = isErrorResponse(data) ? data.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  if (!data) throw new Error("Response is empty");
  return data as T;
}

function isErrorResponse(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string");
}
