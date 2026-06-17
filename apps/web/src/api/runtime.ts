import type { AppSnapshot, LocalAgentProviderStatusResponse } from "@ai-document/shared";

export async function fetchBootstrapSnapshot() {
  return requestJson<AppSnapshot>("/api/bootstrap");
}

export async function fetchLocalAgentProviders() {
  return requestJson<LocalAgentProviderStatusResponse>("/api/local-agent/providers");
}

async function requestJson<T>(path: string) {
  const response = await fetch(path);
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
