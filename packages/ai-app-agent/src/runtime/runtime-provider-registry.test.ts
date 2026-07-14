import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeProfile } from "@ai-app/shared/types";
import { RuntimeProviderRegistry, RuntimeProviderUnsupportedError } from "./index.js";

test("runtime lookup fails closed for unknown cancellation runtimes", () => {
  const provider = {
    id: "local-agent",
    canHandle: (profile: RuntimeProfile) => profile.kind === "local-agent",
    describeRun: () => ({ runtime: "local-agent", agentTargetId: null, provider: "codex", model: "default" }),
    detect: async () => ({ available: true }),
    async *streamEdit() {},
    cancel: async () => ({ cancelled: true }),
  };
  const registry = new RuntimeProviderRegistry([provider]);

  assert.equal(registry.getProviderForRuntime("local-agent"), provider);
  assert.throws(
    () => registry.getProviderForRuntime("removed-runtime"),
    (error: unknown) =>
      error instanceof RuntimeProviderUnsupportedError &&
      error.message === "Runtime provider is not supported: removed-runtime",
  );
});
