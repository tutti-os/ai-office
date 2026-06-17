import type { RuntimeEditContext as SharedRuntimeEditContext, RuntimeProvider as SharedRuntimeProvider, RuntimeStreamEvent } from "@ai-app/agent/runtime";
import { RuntimeProviderUnsupportedError } from "@ai-app/agent/runtime";
import type { AiEditRequest, DocumentProject, DocumentRun } from "@ai-doc/shared";

export type RuntimeEditContext = SharedRuntimeEditContext<DocumentRun, DocumentProject, AiEditRequest>;
export type RuntimeProvider = SharedRuntimeProvider<DocumentRun, DocumentProject, AiEditRequest>;
export type { RuntimeStreamEvent };
export { RuntimeProviderUnsupportedError };
