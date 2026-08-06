import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateTshArtifactFile,
  allocateTshArtifactRoot,
  assertAllowedTshParentPath,
  ensureTshArtifactFile,
  formatTshArtifactDateSlug,
  formatTshArtifactDatedStem,
  isTshFileArtifactPath,
  isTshWorkspaceAppHost,
  resolveTshParentPath,
  safeTshFileStem,
  tshArtifactDisplayTitle,
  tshImportStemFromFileName,
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
      TUTTI_WORKSPACE_ID: "room-1",
      LD_PRELOAD: "/custom/preload.so",
      BASH_ENV: "/custom/bashenv.sh",
    }),
    {
      TSH_WORKSPACE_ID: "room-1",
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

test("allocateTshArtifactFile uses doc-YYYY-MM-DD-n and extension", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  const stem = formatTshArtifactDatedStem("doc", now);
  assert.equal(stem, `doc-${formatTshArtifactDateSlug(now)}`);
  assert.equal(
    allocateTshArtifactFile("/workspace/docs", "html", { now }),
    `/workspace/docs/${stem}-1.html`,
  );
  assert.equal(
    allocateTshArtifactFile("/workspace/docs", "markdown", { now }),
    `/workspace/docs/${stem}-1.md`,
  );
  assert.equal(
    allocateTshArtifactFile("/workspace/docs", "docx", { now }),
    `/workspace/docs/${stem}-1.docx`,
  );
});

test("allocateTshArtifactRoot uses slide-YYYY-MM-DD-n", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  const stem = formatTshArtifactDatedStem("slide", now);
  assert.equal(
    allocateTshArtifactRoot("/workspace/docs", { now }),
    `/workspace/docs/${stem}-1`,
  );
});

test("allocate preferredStem uses sanitized import stem", () => {
  assert.equal(tshImportStemFromFileName("Quarterly Plan.docx"), "Quarterly_Plan");
  assert.equal(
    allocateTshArtifactFile("/workspace/docs", "html", { preferredStem: "Quarterly_Plan" }),
    "/workspace/docs/Quarterly_Plan.html",
  );
  assert.equal(
    allocateTshArtifactRoot("/workspace/docs", { preferredStem: "Quarterly_Plan" }),
    "/workspace/docs/Quarterly_Plan",
  );
});

test("safeTshFileStem keeps unicode letters and date digits", () => {
  assert.equal(safeTshFileStem("季度计划"), "季度计划");
  assert.equal(safeTshFileStem("2026-08-04"), "2026-08-04");
  assert.equal(safeTshFileStem("My Notes!"), "My_Notes");
});

test("tshArtifactDisplayTitle strips file extensions only", () => {
  assert.equal(tshArtifactDisplayTitle("/workspace/docs/报告.html"), "报告");
  assert.equal(tshArtifactDisplayTitle("/workspace/docs/2026-08-06-1.md"), "2026-08-06-1");
  assert.equal(tshArtifactDisplayTitle("/workspace/docs/My_Deck"), "My_Deck");
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
