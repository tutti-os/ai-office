import assert from "node:assert/strict";
import test from "node:test";
import { createTuttiExternalMentionService } from "./tuttiMentionService";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function setHost(bridge: unknown): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { tuttiExternal: bridge },
  });
}

function restoreWindow(): void {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
}

test.afterEach(() => restoreWindow());

test("uses the legacy host query fallback to resolve an external mention", async () => {
  const queries: Array<{ keyword: string; providers?: readonly string[] }> = [];
  setHost({
    at: {
      query: async (input: { keyword: string; providers?: readonly string[] }) => {
        queries.push(input);
        return input.keyword === "Presentation Agent" ? [{
          providerId: "agent-target",
          itemId: "team:slides",
          label: "Presentation Agent",
          insert: {
            kind: "mention" as const,
            mention: {
              entityId: "team:slides",
              label: "Presentation Agent",
              scope: { workspaceId: "workspace-1" },
              presentation: { iconUrl: "/assets/presentation-agent.png" },
            },
          },
        }] : [];
      },
    },
  });

  const service = createTuttiExternalMentionService();
  const result = await service.resolve({
    providerId: "agent-target",
    entityId: "team:slides",
    label: "Presentation Agent",
    scope: { workspaceId: "workspace-1" },
  });

  assert.ok(result);
  assert.deepEqual(queries, [{ keyword: "Presentation Agent", maxResults: 50, providers: ["agent-target"] }]);
  service.dispose();
});

test("unsubscribes the root service when it is disposed", () => {
  let unsubscribeCalls = 0;
  setHost({
    at: {
      query: async () => [],
      subscribe: () => () => { unsubscribeCalls += 1; },
    },
  });

  const service = createTuttiExternalMentionService();
  service.dispose();
  service.dispose();

  assert.equal(unsubscribeCalls, 1);
});

test("does not access window while the host bridge is unavailable", () => {
  Reflect.deleteProperty(globalThis, "window");

  const service = createTuttiExternalMentionService();
  assert.deepEqual(service.listProviders().map((provider) => provider.id), ["workspace-app", "agent-target"]);
  service.dispose();
});
