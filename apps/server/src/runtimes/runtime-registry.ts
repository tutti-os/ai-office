import type { LocalAgentProviderStatus, RuntimeProfile } from "@ai-document/shared";
import type { RuntimeProvider } from "./runtime-provider.js";
import { LocalAgentRuntimeProvider } from "./local-agent-provider.js";
import { ServerDemoRuntimeProvider } from "./server-demo-provider.js";

export class RuntimeProviderRegistry {
  constructor(private readonly providers: RuntimeProvider[]) {}

  getProvider(profile: RuntimeProfile) {
    return this.providers.find((provider) => provider.canHandle(profile)) ?? this.providers[0]!;
  }

  async listLocalAgentProviders(): Promise<LocalAgentProviderStatus[]> {
    const provider = this.providers.find((item) => typeof item.listLocalAgentProviders === "function");
    return provider?.listLocalAgentProviders?.() ?? [];
  }
}

export function createRuntimeProviderRegistry() {
  return new RuntimeProviderRegistry([new ServerDemoRuntimeProvider(), new LocalAgentRuntimeProvider()]);
}
