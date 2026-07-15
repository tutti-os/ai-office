import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readPublishedReferenceExports, replacePublishedReferenceExports } from "./index.js";

test("published reference exports are atomic and source-version scoped", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "reference-exports-"));
  try {
    replacePublishedReferenceExports({
      projectRoot,
      sourceVersion: "revision-1",
      write(directory) {
        writeFileSync(join(directory, "document.html"), "first", "utf8");
        return [{ kind: "html", mimeType: "text/html", path: "document.html" }];
      },
    });
    assert.equal(readPublishedReferenceExports(projectRoot, "revision-1")[0]?.projectRelativePath, "exports/.reference/document.html");
    assert.deepEqual(readPublishedReferenceExports(projectRoot, "revision-2"), []);

    replacePublishedReferenceExports({
      projectRoot,
      sourceVersion: "revision-2",
      write(directory) {
        writeFileSync(join(directory, "document.html"), "second", "utf8");
        return [{ kind: "html", mimeType: "text/html", path: "document.html" }];
      },
    });
    assert.equal(readPublishedReferenceExports(projectRoot, "revision-2")[0]?.projectRelativePath, "exports/.reference/document.html");
    assert.deepEqual(readPublishedReferenceExports(projectRoot, "revision-1"), []);
  } finally {
    rmSync(projectRoot, { force: true, recursive: true });
  }
});

test("published reference exports reject paths outside the reserved directory", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "reference-exports-path-"));
  try {
    assert.throws(() => replacePublishedReferenceExports({
      projectRoot,
      sourceVersion: "revision-1",
      write() {
        return [{ kind: "html", mimeType: "text/html", path: "../document.html" }];
      },
    }), /Invalid published reference export path/);
    assert.deepEqual(readPublishedReferenceExports(projectRoot, "revision-1"), []);
  } finally {
    rmSync(projectRoot, { force: true, recursive: true });
  }
});
