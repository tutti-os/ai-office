import assert from "node:assert/strict";
import test from "node:test";
import { isMissingDocumentError } from "./documentLoadErrors";

test("isMissingDocumentError matches hydrate / update missing messages", () => {
  assert.equal(
    isMissingDocumentError("Document file is missing at /workspace/a.html: no such file or directory"),
    true,
  );
  assert.equal(isMissingDocumentError("ENOENT: no such file or directory"), true);
  assert.equal(isMissingDocumentError("Project not found"), false);
});
