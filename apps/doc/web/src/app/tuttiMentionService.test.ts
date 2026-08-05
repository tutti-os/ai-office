import assert from "node:assert/strict";
import test from "node:test";
import { extractPlainTextFromContent } from "@tutti-os/ui-rich-text/core";
import { renderRichTextTriggerInsertResult } from "@tutti-os/ui-rich-text/plugins";
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

test("queries only workspace files", async () => {
  const queries: Array<{ keyword: string; providers?: readonly string[] }> = [];
  setHost({
    at: {
      query: async (input: { keyword: string; providers?: readonly string[] }) => {
        queries.push(input);
        return input.keyword === "brief" ? [{
          providerId: "file",
          itemId: "/workspace/brief.md",
          label: "brief.md",
          subtitle: "/workspace/brief.md",
          insert: {
            kind: "markdown-link" as const,
            label: "brief.md",
            href: "/workspace/brief.md",
          },
        }] : [];
      },
    },
  });

  const service = createTuttiExternalMentionService();
  const results = await service.query({
    keyword: "brief",
    maxResults: 30,
    trigger: "@",
    context: {},
  });

  assert.deepEqual(queries, [{ keyword: "brief", maxResults: 30, providers: ["file"] }]);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.providerId, "file");
  assert.equal(
    renderRichTextTriggerInsertResult("file", results[0]!.insertResult),
    "[brief.md](/workspace/brief.md)",
  );
  service.dispose();
});

test("browses direct folder children and serializes a folder path into the prompt", async () => {
  const directoryQueries: unknown[] = [];
  setHost({
    at: {
      query: async () => [],
      queryDirectory: async (input: unknown) => {
        directoryQueries.push(input);
        return [{
          providerId: "file",
          itemId: "/workspace/src",
          label: "src",
          subtitle: "/workspace/src",
          directory: { childCount: 2, path: "/workspace/src" },
          insert: {
            kind: "markdown-link" as const,
            label: "src",
            href: "/workspace/src/",
          },
        }];
      },
    },
  });

  const service = createTuttiExternalMentionService();
  assert.equal(typeof service.queryDirectory, "function");
  const results = await service.queryDirectory!("file", {
    context: {},
    directoryPath: "/workspace",
    keyword: "",
    maxResults: 30,
    trigger: "@",
  });

  assert.deepEqual(directoryQueries, [{
    directoryPath: "/workspace",
    maxResults: 30,
    providerId: "file",
  }]);
  assert.deepEqual(results[0]?.directory, {
    childCount: 2,
    path: "/workspace/src",
  });
  assert.equal(
    renderRichTextTriggerInsertResult("file", results[0]!.insertResult),
    "[src](/workspace/src/)",
  );
  service.dispose();
});

test("keeps historical app and agent mentions readable as label fallbacks", async () => {
  setHost({ at: { query: async () => [] } });
  const service = createTuttiExternalMentionService();

  const appContent = renderRichTextTriggerInsertResult("workspace-app", {
    kind: "mention",
    mention: { entityId: "canvas", label: "Canvas" },
  });
  const agentContent = renderRichTextTriggerInsertResult("agent-target", {
    kind: "mention",
    mention: { entityId: "team:automation", label: "Automation Agent" },
  });
  const app = await service.resolve({
    providerId: "workspace-app",
    entityId: "canvas",
    label: "Canvas",
  });
  const agent = await service.resolve({
    providerId: "agent-target",
    entityId: "team:automation",
    label: "Automation Agent",
  });

  assert.equal(extractPlainTextFromContent(appContent), "@Canvas");
  assert.equal(extractPlainTextFromContent(agentContent), "@Automation Agent");
  assert.equal(app.state, "missing");
  assert.equal(agent.state, "missing");
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
  assert.deepEqual(service.listProviders().map((provider) => provider.id), ["file"]);
  service.dispose();
});
