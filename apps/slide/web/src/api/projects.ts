import type {
  CreateProjectRequest,
  AiEditRequest,
  AiEditResponse,
  DeckSlideHtmlResponse,
  LocalAgentProviderStatusResponse,
  OfficeCliStatusResponse,
  ProjectDetailResponse,
  ProjectRunsResponse,
  ProjectResponse,
  ProjectsResponse,
  TemplatesResponse,
  SlideProject,
  UpdateProjectRequest,
  UpdateDeckSlideHtmlRequest,
} from "@ai-slide/shared";

export async function createProject(input: CreateProjectRequest) {
  return requestJson<ProjectResponse>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getProject(projectId: string) {
  return requestJson<ProjectDetailResponse>(`/api/projects/${encodeURIComponent(projectId)}`);
}

export async function listProjects(): Promise<SlideProject[]> {
  const response = await requestJson<ProjectsResponse>("/api/projects");
  return response.projects;
}

export async function listTemplates() {
  const response = await requestJson<TemplatesResponse>("/api/templates");
  return response.templates;
}

export async function fetchLocalAgentProviders() {
  return requestJson<LocalAgentProviderStatusResponse>("/api/local-agent/providers");
}

export async function fetchOfficeCliStatus() {
  return requestJson<OfficeCliStatusResponse>("/api/toolchains/officecli");
}

export async function installOfficeCli() {
  return requestJson<OfficeCliStatusResponse>("/api/toolchains/officecli/install", { method: "POST" });
}

export async function updateProject(projectId: string, input: UpdateProjectRequest) {
  return requestJson<ProjectResponse>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getProjectPptxFile(projectId: string) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/slides.pptx`);
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed: ${response.status}`);
  }
  return response.arrayBuffer();
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

export async function getDeckSlideHtml(projectId: string, slideId: string) {
  return requestJson<DeckSlideHtmlResponse>(`/api/projects/${encodeURIComponent(projectId)}/deck/slides/${encodeURIComponent(slideId)}`);
}

export async function updateDeckSlideHtml(projectId: string, slideId: string, input: UpdateDeckSlideHtmlRequest) {
  return requestJson<DeckSlideHtmlResponse>(`/api/projects/${encodeURIComponent(projectId)}/deck/slides/${encodeURIComponent(slideId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function clearProjectHistory(): Promise<SlideProject[]> {
  const response = await requestJson<ProjectsResponse>("/api/projects", {
    method: "DELETE",
  });
  return response.projects;
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
    const message = data && typeof data === "object" && "error" in data ? data.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  if (!data) throw new Error("Response is empty");
  return data as T;
}
