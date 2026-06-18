import type { AppSnapshot, LocalAgentProviderStatusResponse, OfficeCliStatusResponse, TemplatesResponse } from "@ai-doc/shared";

export async function fetchBootstrapSnapshot() {
  return requestJson<AppSnapshot>("/api/bootstrap");
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

export async function fetchTemplates() {
  const response = await requestJson<TemplatesResponse>("/api/templates");
  return response.templates;
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, init);
  const data = await response.json().catch(() => null);
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
