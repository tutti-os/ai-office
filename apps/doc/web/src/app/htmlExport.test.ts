import assert from "node:assert/strict";
import test from "node:test";
import { safeExportFileName } from "./htmlExport";

test("safeExportFileName strips document suffixes before export", () => {
  assert.equal(safeExportFileName("夏日午后随笔-36bb288d.html"), "夏日午后随笔-36bb288d");
  assert.equal(safeExportFileName("notes.md"), "notes");
  assert.equal(safeExportFileName("letter.docx"), "letter");
  assert.equal(safeExportFileName("report.html.pdf"), "report");
  assert.equal(safeExportFileName("plain-title"), "plain-title");
});
