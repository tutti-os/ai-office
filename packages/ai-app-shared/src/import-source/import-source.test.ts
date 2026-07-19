import assert from "node:assert/strict";
import test from "node:test";
import { ImportSourcePathError, resolveAbsoluteImportSourcePath } from "./index.js";

test("absolute import paths pass through without workspace-root translation", () => {
  assert.equal(resolveAbsoluteImportSourcePath("  /opaque/upload/document.docx  "), "/opaque/upload/document.docx");
});

test("relative and home-relative import paths fail with a typed error", () => {
  for (const input of ["document.docx", "./document.docx", "~/document.docx"]) {
    assert.throws(
      () => resolveAbsoluteImportSourcePath(input),
      (error: unknown) => error instanceof ImportSourcePathError
        && error.reason === "path_must_be_absolute"
        && error.statusCode === 400,
    );
  }
});

test("empty import paths fail with a typed error", () => {
  assert.throws(
    () => resolveAbsoluteImportSourcePath("  "),
    (error: unknown) => error instanceof ImportSourcePathError
      && error.reason === "path_required"
      && error.statusCode === 400,
  );
});
