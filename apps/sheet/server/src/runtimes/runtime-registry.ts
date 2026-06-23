import { RuntimeProviderRegistry } from "@ai-app/agent/runtime";
import type { AiEditRequest, SheetRun } from "@ai-sheet/shared";
import { LocalAgentRuntimeProvider } from "./local-agent-provider.js";
import type { SheetRuntimeProject } from "./runtime-provider.js";

export function createRuntimeProviderRegistry() {
  return new RuntimeProviderRegistry<SheetRun, SheetRuntimeProject, AiEditRequest>([
    new LocalAgentRuntimeProvider(),
  ]);
}
