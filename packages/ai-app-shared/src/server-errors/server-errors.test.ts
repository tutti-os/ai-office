import assert from "node:assert/strict";
import test from "node:test";
import { ProjectPreparationError } from "../project-preparation/index.js";
import { artifactErrorResponse } from "./index.js";

test("project preparation errors retain safe diagnostics and meaningful status codes", () => {
  const transient = artifactErrorResponse(new ProjectPreparationError({
    phase: "core_deck",
    path: "/private/workspace/project/deck.slides",
    code: "ETIMEDOUT",
    message: "remote filesystem timed out",
  }), "Unable to create project");
  assert.equal(transient.statusCode, 503);
  assert.deepEqual(transient.body, {
    error: "Unable to create project",
    code: "toolchain_unavailable",
    details: { phase: "core_deck", fsCode: "ETIMEDOUT", retryable: true },
  });

  const permission = artifactErrorResponse(new ProjectPreparationError({
    phase: "core_document",
    path: "/private/workspace/project/document.html",
    code: "EACCES",
    message: "permission denied",
  }), "Unable to create project");
  assert.equal(permission.statusCode, 403);
  assert.equal(permission.body.error, "Project preparation failed during core_document.");
  assert.deepEqual(permission.body.details, {
    phase: "core_document",
    fsCode: "EACCES",
    retryable: false,
  });
});
