#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const maxLines = 600;
const failures = [];

const ignoredDirs = new Set([
  ".git",
  ".local-packages",
  "build",
  "dist",
  "node_modules",
  "templates",
]);

const allowlist = new Map([
  ["apps/doc/server/src/artifact/document-repository.ts", "existing artifact repository scheduled for decomposition"],
  ["apps/doc/server/src/artifact/document-service.ts", "existing artifact service scheduled for decomposition"],
  ["apps/doc/web/src/app/HtmlTiptapEditorSurface.tsx", "existing rich editor surface scheduled for decomposition"],
  ["apps/doc/web/src/app/htmlTiptapEditor.ts", "existing rich editor implementation scheduled for decomposition"],
  ["apps/doc/web/src/app/markdownEditorToolbar.tsx", "existing rich editor toolbar scheduled for decomposition"],
  ["apps/sheet/web/src/app/XlsxPreview.tsx", "existing workbook preview scheduled for decomposition"],
  ["apps/slide/server/src/artifact/project-repository.ts", "existing artifact repository scheduled for decomposition"],
  ["apps/slide/server/src/artifact/project-service.ts", "existing artifact service scheduled for decomposition"],
  ["apps/slide/web/src/App.tsx", "existing app shell scheduled for decomposition"],
  ["packages/ai-app-shared/src/project-store/index.ts", "existing shared persistence module scheduled for decomposition"],
  ["packages/ai-app-ui/src/rich-text/index.ts", "existing rich text module scheduled for decomposition"],
  ["apps/slide/shared/src/generatedTemplates.ts", "generated template catalog"],
  ["apps/slide/scripts/restyle-slide-template-batch.mjs", "one-off template migration script"],
]);

for (const path of sourceFiles(root)) {
  const rel = relative(root, path);
  const normalized = rel.split("\\").join("/");
  const lines = lineCount(path);
  if (lines <= maxLines || allowlist.has(normalized)) continue;
  failures.push({ path: normalized, lines });
}

if (failures.length) {
  console.error(`Source files should stay at or below ${maxLines} lines unless explicitly allowlisted.`);
  for (const failure of failures.sort((a, b) => b.lines - a.lines)) {
    console.error(`- ${failure.path}: ${failure.lines} lines`);
  }
  process.exit(1);
}

console.log("File size check passed.");

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  collect(dir, results);
  return results;
}

function collect(dir, results) {
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collect(path, results);
    } else if (/\.(ts|tsx|mjs)$/.test(name)) {
      results.push(path);
    }
  }
}

function lineCount(path) {
  const source = readFileSync(path, "utf8");
  if (!source) return 0;
  return source.split("\n").length;
}
