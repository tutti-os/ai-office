import type { AppSnapshot, LocalAgentTargetStatusResponse, OfficeCliStatusResponse, TemplatesResponse } from "@ai-doc/shared";
import { requestJson } from "@ai-app/shared/api-client";

export async function fetchBootstrapSnapshot() {
  return requestJson<AppSnapshot>("/api/bootstrap");
}

export async function fetchLocalAgentTargets(refresh = false) {
  return requestJson<LocalAgentTargetStatusResponse>(`/api/local-agent/targets${refresh ? "?refresh=1" : ""}`);
}

export async function persistLocalAgentSelection(profileId: string) {
  return requestJson<LocalAgentTargetStatusResponse>("/api/local-agent/selection", {
    method: "POST",
    body: JSON.stringify({ profileId }),
  });
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
