import { RuntimeProviderRegistry } from "@ai-app/agent/runtime";
import { LocalAgentRuntimeProvider } from "./local-agent-provider.js";
import { ServerDemoRuntimeProvider } from "./server-demo-provider.js";

export function createRuntimeProviderRegistry() {
  return new RuntimeProviderRegistry([new ServerDemoRuntimeProvider(), new LocalAgentRuntimeProvider()]);
}
