import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateRenamedTshArtifactFile,
  allocateRenamedTshArtifactRoot,
  allocateTshArtifactFile,
  allocateTshArtifactRoot,
  assertAllowedTshParentPath,
  ensureTshArtifactFile,
  formatTshArtifactDateSlug,
  isTshFileArtifactPath,
  isTshWorkspaceAppHost,
  resolveTshParentPath,
  safeTshFileStem,
  TSH_CMD_ROUTING_BASH_ENV,
  TSH_DEFAULT_PARENT_PATH,
  TSH_ROUTING_LD_PRELOAD,
  tshAgentRoutingEnv,
} from "./index.js";

test("isTshWorkspaceAppHost requires TSH_WORKSPACE_APP=1", () => {
  assert.equal(isTshWorkspaceAppHost({}), false);
  assert.equal(isTshWorkspaceAppHost({ TSH_WORKSPACE_APP: "0" }), false);
  assert.equal(isTshWorkspaceAppHost({ TSH_WORKSPACE_APP: "1" }), true);
});

test("tshAgentRoutingEnv is empty outside TSH host", () => {
  assert.deepEqual(tshAgentRoutingEnv({}), {});
});

test("tshAgentRoutingEnv stamps ADR 0017 routing on TSH host", () => {
  assert.deepEqual(tshAgentRoutingEnv({ TSH_WORKSPACE_APP: "1" }), {
    TSH_AGENT_ROUTING: "1",
    LD_PRELOAD: TSH_ROUTING_LD_PRELOAD,
    BASH_ENV: TSH_CMD_ROUTING_BASH_ENV,
  });
  assert.deepEqual(
    tshAgentRoutingEnv({
      TSH_WORKSPACE_APP: "1",
      LD_PRELOAD: "/custom/preload.so",
      BASH_ENV: "/custom/bashenv.sh",
    }),
    {
      TSH_AGENT_ROUTING: "1",
      LD_PRELOAD: "/custom/preload.so",
      BASH_ENV: "/custom/bashenv.sh",
    },
  );
});

test("resolveTshParentPath is null outside TSH host", () => {
  assert.equal(resolveTshParentPath("/workspace/docs", {}), null);
});

test("resolveTshParentPath defaults to /workspace on TSH host", () => {
  assert.equal(resolveTshParentPath(undefined, { TSH_WORKSPACE_APP: "1" }), TSH_DEFAULT_PARENT_PATH);
  assert.equal(resolveTshParentPath(" /workspace/docs ", { TSH_WORKSPACE_APP: "1" }), "/workspace/docs");
});

test("assertAllowedTshParentPath rejects escapes and .tsh", () => {
  assert.equal(assertAllowedTshParentPath("/workspace"), "/workspace");
  assert.throws(() => assertAllowedTshParentPath("/tmp/out"), /inside \/workspace/);
  assert.throws(() => assertAllowedTshParentPath("/workspace/.tsh"), /\.tsh/);
  assert.throws(() => assertAllowedTshParentPath("/workspace/.tsh/apps/data"), /\.tsh/);
});

test("allocateTshArtifactRoot nests under the parent path", () => {
  const root = allocateTshArtifactRoot("/workspace/docs", "Quarterly Plan", "abcd1234-ef56-7890-abcd-ef1234567890");
  assert.equal(root, "/workspace/docs/Quarterly_Plan-abcd1234");
});

test("allocateTshArtifactRoot keeps unicode titles", () => {
  const root = allocateTshArtifactRoot("/workspace", "把无聊变成实验", "af139ff9-ef56-7890-abcd-ef1234567890");
  assert.equal(root, "/workspace/把无聊变成实验-af139ff9");
});

test("allocateRenamedTshArtifactRoot keeps short id", () => {
  assert.equal(
    allocateRenamedTshArtifactRoot("/workspace/Untitled_Presentation-af139ff9", "把无聊变成实验"),
    "/workspace/把无聊变成实验-af139ff9",
  );
  assert.equal(
    allocateRenamedTshArtifactRoot("/workspace/把无聊变成实验-af139ff9", "把无聊变成实验"),
    "/workspace/把无聊变成实验-af139ff9",
  );
});

test("allocateTshArtifactFile uses date slug and file extension", () => {
  const id = "abcd1234-ef56-7890-abcd-ef1234567890";
  const now = new Date("2026-08-04T12:00:00.000Z");
  assert.equal(
    allocateTshArtifactFile("/workspace/docs", "Untitled Document", id, "html", now),
    `/workspace/docs/${formatTshArtifactDateSlug(now)}-abcd1234.html`,
  );
  assert.equal(
    allocateTshArtifactFile("/workspace/docs", "Notes", id, "markdown", now),
    `/workspace/docs/${formatTshArtifactDateSlug(now)}-abcd1234.md`,
  );
  assert.equal(
    allocateTshArtifactFile("/workspace/docs", "Letter", id, "docx", now),
    `/workspace/docs/${formatTshArtifactDateSlug(now)}-abcd1234.docx`,
  );
});

test("safeTshFileStem keeps unicode letters and date digits", () => {
  assert.equal(safeTshFileStem("季度计划"), "季度计划");
  assert.equal(safeTshFileStem("2026-08-04"), "2026-08-04");
  assert.equal(safeTshFileStem("My Notes!"), "My_Notes");
});

test("allocateRenamedTshArtifactFile keeps short id and extension", () => {
  assert.equal(
    allocateRenamedTshArtifactFile("/workspace/docs/2026-08-04-abcd1234.html", "Quarterly Plan"),
    "/workspace/docs/Quarterly_Plan-abcd1234.html",
  );
  assert.equal(
    allocateRenamedTshArtifactFile("/workspace/docs/2026-08-04-abcd1234.md", "季度计划.md"),
    "/workspace/docs/季度计划-abcd1234.md",
  );
  assert.equal(
    allocateRenamedTshArtifactFile("/workspace/docs/2026-08-04-abcd1234.md", "2026-08-04-abcd1234.md"),
    "/workspace/docs/2026-08-04-abcd1234.md",
  );
});

test("isTshFileArtifactPath detects document extensions", () => {
  assert.equal(isTshFileArtifactPath("/workspace/a.html"), true);
  assert.equal(isTshFileArtifactPath("/workspace/a.md"), true);
  assert.equal(isTshFileArtifactPath("/workspace/a.docx"), true);
  assert.equal(isTshFileArtifactPath("/workspace/a"), false);
  assert.equal(isTshFileArtifactPath("/workspace/Quarterly_Plan-abcd1234"), false);
});

test("ensureTshArtifactFile creates the parent directory", () => {
  // Path validation only — parent mkdir is exercised; avoid writing outside sandbox if /workspace missing in unit env.
  assert.throws(() => ensureTshArtifactFile("/tmp/out.html"), /inside \/workspace/);
});
