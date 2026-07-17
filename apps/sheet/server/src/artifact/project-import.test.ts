import assert from "node:assert/strict";
import test from "node:test";
import { withProjectImportCleanup } from "./project-import.js";

test("failed workbook import cleans up the created project", async () => {
  let cleaned = 0;
  await assert.rejects(() => withProjectImportCleanup({
    cleanup: () => { cleaned += 1; },
    importProject: async () => { throw new Error("write failed"); },
  }), /write failed/);
  assert.equal(cleaned, 1);
});
