#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const failures = [];

for (const file of sourceFiles(root)) {
  const rel = relative(root, file).split("\\").join("/");
  const source = readFileSync(file, "utf8");
  for (const specifier of importSpecifiers(source)) {
    checkImport(rel, specifier);
  }
}

if (failures.length) {
  console.error("Import boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.message}`);
  }
  process.exit(1);
}

console.log("Import boundary check passed.");

function checkImport(file, specifier) {
  if (/^apps\/[^/]+\/server\/src\//.test(file)) {
    if (specifier === "@ai-app/agent" || specifier.startsWith("@ai-app/agent/conversation-ui")) {
      failures.push({ file, message: `server code must not import frontend agent UI (${specifier})` });
    }
    if (specifier === "@ai-app/ui" || specifier.startsWith("@ai-app/ui/")) {
      failures.push({ file, message: `server code must not import shared React UI (${specifier})` });
    }
  }
  if (/^packages\/ai-app-shared\/src\//.test(file)) {
    if (specifier === "react" || specifier.startsWith("react/") || specifier === "lucide-react") {
      failures.push({ file, message: `@ai-app/shared must stay React-free (${specifier})` });
    }
  }
  if (/^apps\/[^/]+\/web\/src\//.test(file) && specifier.includes("/server/")) {
    failures.push({ file, message: `web code must not import server internals (${specifier})` });
  }
}

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) specifiers.push(match[1]);
  }
  return specifiers;
}

function sourceFiles(dir) {
  const results = [];
  collect(dir, results);
  return results;
}

function collect(dir, results) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if ([".git", ".local-packages", "build", "dist", "node_modules", "templates"].includes(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collect(path, results);
    } else if (/\.(ts|tsx|mjs)$/.test(name)) {
      results.push(path);
    }
  }
}
