import type {
  CreateProjectRequest,
  AiEditRequest,
  AiEditResponse,
  AppSnapshot,
  DeckAssetUploadResponse,
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
import { requestArrayBuffer, requestJson } from "@ai-app/shared/api-client";

export async function fetchBootstrapSnapshot() {
  return requestJson<AppSnapshot>("/api/bootstrap");
}

export async function createProject(input: CreateProjectRequest) {
  return requestJson<ProjectResponse>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function importProjectFile(file: File) {
  return requestJson<ProjectDetailResponse>("/api/projects/import", {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name || "slides.pptx"),
      "x-file-mime-type": encodeURIComponent(file.type || "application/octet-stream"),
    },
    body: await file.arrayBuffer(),
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
  return requestArrayBuffer(`/api/projects/${encodeURIComponent(projectId)}/files/slides.pptx`);
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

export async function uploadDeckAsset(projectId: string, file: File) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/deck/assets`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name || "image"),
    },
    body: await file.arrayBuffer(),
  });
  const data = (await response.json().catch(() => null)) as DeckAssetUploadResponse | { error?: string } | null;
  if (!response.ok) throw new Error(data && "error" in data && data.error ? data.error : `Asset upload failed: ${response.status}`);
  if (!data || !("path" in data)) throw new Error("Asset upload response is missing asset path");
  return data;
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
  const data = (await response.json().catch(() => null)) as DeckAssetUploadResponse | { error?: string } | null;
  if (!response.ok) throw new Error(data && "error" in data && data.error ? data.error : `Asset upload failed: ${response.status}`);
  if (!data || !("path" in data)) throw new Error("Asset upload response is missing asset path");
  return data;
}

export type ProjectExportWriteResponse = {
  path: string;
  absolutePath: string;
  exportsDir: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function writeProjectExport(projectId: string, input: { fileName: string; mimeType: string; content: Uint8Array | ArrayBuffer }) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/exports`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(input.fileName || "slides.pptx"),
      "x-mime-type": encodeURIComponent(input.mimeType),
    },
    body: input.content instanceof Uint8Array ? input.content.slice().buffer : input.content,
  });
  const data = (await response.json().catch(() => null)) as ProjectExportWriteResponse | { error?: string } | null;
  if (!response.ok) throw new Error(data && "error" in data && data.error ? data.error : `Export failed: ${response.status}`);
  if (!data || !("path" in data)) throw new Error("Export response is missing export path");
  return data;
}

export async function exportProjectPptxFile(projectId: string) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/exports/pptx`, { method: "POST" });
  const data = (await response.json().catch(() => null)) as ProjectExportWriteResponse | { error?: string } | null;
  if (!response.ok) throw new Error(data && "error" in data && data.error ? data.error : `Export failed: ${response.status}`);
  if (!data || !("path" in data)) throw new Error("Export response is missing export path");
  return data;
}

export async function exportProjectHtmlDeck(projectId: string) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/exports/html-deck`, { method: "POST" });
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

export async function clearProjectHistory(): Promise<SlideProject[]> {
  const response = await requestJson<ProjectsResponse>("/api/projects", {
    method: "DELETE",
  });
  return response.projects;
}

export async function deleteProject(projectId: string): Promise<SlideProject[]> {
  const response = await requestJson<ProjectsResponse>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
  return response.projects;
}
