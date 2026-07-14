import type { RuntimeEditContext, RuntimeProvider } from "./runtime-provider.js";
import type { RuntimeProfile } from "@ai-app/shared/types";

export class ServerDemoRuntimeProvider implements RuntimeProvider {
  id = "server-demo";

  canHandle(profile: RuntimeProfile) {
    return profile.kind === "server-demo";
  }

  describeRun(profile: RuntimeProfile) {
    return { runtime: profile.kind, agentTargetId: null, provider: profile.provider, model: profile.model };
  }

  async detect() {
    return { available: true };
  }

  async *streamEdit(context: RuntimeEditContext) {
    yield { type: "status" as const, message: "Applying demo slide edit" };
    yield `Demo slide edit captured: ${context.request.userPrompt}`;
  }

  async cancel() {
    return { cancelled: false, reason: "demo provider has no active process" };
  }
}
