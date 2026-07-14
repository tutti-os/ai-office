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
  ["apps/doc/server/src/artifact/document-repository.ts", 601],
  ["apps/doc/server/src/artifact/document-service.ts", 689],
  ["apps/doc/web/src/app/HtmlTiptapEditorSurface.tsx", 945],
  ["apps/doc/web/src/app/htmlTiptapEditor.ts", 749],
  ["apps/doc/web/src/app/markdownEditorToolbar.tsx", 621],
  ["apps/sheet/web/src/app/XlsxPreview.tsx", 781],
  ["apps/slide/server/src/artifact/project-repository.ts", 620],
  ["apps/slide/server/src/artifact/project-service.ts", 680],
  ["apps/slide/web/src/App.tsx", 625],
  ["packages/ai-app-shared/src/project-store/index.ts", 699],
  ["packages/ai-app-ui/src/rich-text/index.ts", 721],
  ["apps/slide/shared/src/generatedTemplates.ts", 8339],
  ["apps/slide/scripts/restyle-slide-template-batch.mjs", 2217],
]);

for (const path of sourceFiles(root)) {
  const rel = relative(root, path);
  const normalized = rel.split("\\").join("/");
  const lines = lineCount(path);
  const grandfatheredLimit = allowlist.get(normalized);
  if (lines <= maxLines || (grandfatheredLimit !== undefined && lines <= grandfatheredLimit)) continue;
  failures.push({ path: normalized, lines, limit: grandfatheredLimit ?? maxLines });
}

if (failures.length) {
  console.error(`Source files should stay at or below ${maxLines} lines unless explicitly allowlisted.`);
  for (const failure of failures.sort((a, b) => b.lines - a.lines)) {
    console.error(`- ${failure.path}: ${failure.lines} lines (limit ${failure.limit})`);
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
