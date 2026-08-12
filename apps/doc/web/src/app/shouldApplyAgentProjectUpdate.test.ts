import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentProject } from "@ai-doc/shared";
import { shouldApplyAgentProjectUpdate } from "./shouldApplyAgentProjectUpdate";

function project(overrides: Partial<DocumentProject> = {}): DocumentProject {
  return {
    id: "doc-1",
    title: "窗边小记",
    type: "html",
    content: "<html><body><p>hi</p></body></html>",
    templateId: null,
    templateName: null,
    workspaceRoot: "/workspace/doc-1.html",
    updatedBy: "ai",
    createdAt: "2026-08-12T04:37:50.588Z",
    updatedAt: "2026-08-12T04:38:25.794Z",
    ...overrides,
  };
}

test("rejects human autosave echoes", () => {
  assert.equal(
    shouldApplyAgentProjectUpdate(project({ updatedBy: "human", content: "<p>typed</p>" }), project()),
    false,
  );
});

test("accepts ai updates with new content", () => {
  assert.equal(
    shouldApplyAgentProjectUpdate(
      project({ updatedBy: "ai", content: "<p>from agent</p>", updatedAt: "2026-08-12T04:38:26.000Z" }),
      project(),
    ),
    true,
  );
});

test("accepts system disk-hydration updates that carry new content", () => {
  // Reproduces TSH empty-editor: getProject quiet-sync used to return updatedBy=system
  // while /workspace HTML already had the agent body.
  assert.equal(
    shouldApplyAgentProjectUpdate(
      project({
        updatedBy: "system",
        content: "<html><body><h1>窗边小记</h1><p>下午四点</p></body></html>",
        updatedAt: "2026-08-12T04:38:26.000Z",
      }),
      project({ content: "<p><br></p>", updatedBy: "system", updatedAt: "2026-08-12T04:37:50.588Z" }),
    ),
    true,
  );
});

test("ignores noop metadata-only updates with identical content and older/equal time", () => {
  const current = project({ updatedBy: "ai" });
  assert.equal(shouldApplyAgentProjectUpdate(project({ updatedBy: "system" }), current), false);
});
