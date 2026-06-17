import type { RuntimeEditContext, RuntimeProvider } from "./runtime-provider.js";
import type { RuntimeProfile } from "@ai-document/shared";

export class ServerDemoRuntimeProvider implements RuntimeProvider {
  id = "server-demo";

  canHandle(profile: RuntimeProfile) {
    return profile.kind === "server-demo";
  }

  describeRun(profile: RuntimeProfile) {
    return { runtime: profile.kind, provider: profile.provider, model: profile.model };
  }

  async detect() {
    return { available: true };
  }

  async *streamEdit(context: RuntimeEditContext) {
    yield { type: "status" as const, message: "Applying demo edit" };
    const bodyInsertion =
      context.request.mode === "write"
        ? `<p data-ai-region="ai_inserted">${escapeHtml(context.request.userPrompt)}</p>`
        : `<strong>${escapeHtml(context.request.userPrompt)}</strong>`;
    const html = context.project.content.includes("</body>")
      ? context.project.content.replace("</body>", `${bodyInsertion}\n</body>`)
      : `${context.project.content}\n${bodyInsertion}`;
    yield html;
  }

  async cancel() {
    return { cancelled: false, reason: "demo provider has no active process" };
  }
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
