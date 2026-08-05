import assert from "node:assert/strict";
import test from "node:test";
import { shouldSyncHtmlBodyFromTransaction } from "./shouldSyncHtmlBodyFromTransaction";

function transaction(meta: Record<string, unknown> = {}, docChanged = true) {
  return {
    docChanged,
    getMeta: (key: string) => meta[key],
  };
}

test("rejects read-only and non-doc changes", () => {
  assert.equal(
    shouldSyncHtmlBodyFromTransaction({ focused: true, readOnly: true, transaction: transaction() }),
    false,
  );
  assert.equal(
    shouldSyncHtmlBodyFromTransaction({
      focused: true,
      readOnly: false,
      transaction: transaction({}, false),
    }),
    false,
  );
});

test("rejects programmatic history opt-outs and unfocused normalization", () => {
  assert.equal(
    shouldSyncHtmlBodyFromTransaction({
      focused: true,
      readOnly: false,
      transaction: transaction({ addToHistory: false }),
    }),
    false,
  );
  assert.equal(
    shouldSyncHtmlBodyFromTransaction({
      focused: false,
      readOnly: false,
      transaction: transaction(),
    }),
    false,
  );
});

test("accepts focused edits and explicit ui events without focus", () => {
  assert.equal(
    shouldSyncHtmlBodyFromTransaction({
      focused: true,
      readOnly: false,
      transaction: transaction(),
    }),
    true,
  );
  assert.equal(
    shouldSyncHtmlBodyFromTransaction({
      focused: false,
      readOnly: false,
      transaction: transaction({ uiEvent: "paste" }),
    }),
    true,
  );
});
