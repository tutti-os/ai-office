import assert from "node:assert/strict";
import test from "node:test";

import { resolveArchiveInvocation, resolveBuildInvocation } from "./index.mjs";

test("package manager runs through the active lifecycle entrypoint", () => {
  assert.deepEqual(
    resolveBuildInvocation(
      "pnpm",
      ["build"],
      { npm_execpath: "C:\\pnpm\\pnpm.cjs" },
      "C:\\node.exe",
    ),
    {
      command: "C:\\node.exe",
      args: ["C:\\pnpm\\pnpm.cjs", "build"],
    },
  );
});

test("Windows archives use tar.exe without a shell", () => {
  assert.deepEqual(resolveArchiveInvocation("C:\\output\\app.zip", "win32"), {
    command: "tar.exe",
    args: ["-a", "-c", "-f", "C:\\output\\app.zip", "."],
  });
});
