import type { AppSnapshot, LocalAgentProviderStatusResponse, OfficeCliStatusResponse, TemplatesResponse } from "@ai-doc/shared";
import { requestJson } from "@ai-app/shared/api-client";

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
