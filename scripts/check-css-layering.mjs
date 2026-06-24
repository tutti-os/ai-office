import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const files = cssFiles(join(root, "apps")).map((file) => file.slice(root.length + 1));
const failures = [];

for (const file of files) {
  const absolutePath = resolve(root, file);
  const source = readFileSync(absolutePath, "utf8");
  const cssWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const cssOutsideLayer = blankRanges(cssWithoutComments, layerRanges(cssWithoutComments));
  const rulePattern = /(^|})\s*([^@{}][^{]*\b(?:button|input|textarea|select)\b[^{]*)\{([^{}]*)\}/gms;
  let match;
  while ((match = rulePattern.exec(cssOutsideLayer))) {
    const selector = match[2]?.trim() ?? "";
    const body = match[3] ?? "";
    if (!isGlobalFormControlResetSelector(selector)) continue;
    if (!/(^|[;\s])font\s*:\s*inherit\s*(;|$)|(^|[;\s])cursor\s*:/.test(body)) continue;
    failures.push({
      file,
      line: lineNumber(source, match.index + match[0].indexOf(selector)),
      selector,
    });
  }
}

if (failures.length) {
  console.error("Form-control CSS resets must live inside @layer base/components so Tailwind utilities can override them.");
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.line} ${failure.selector}`);
  }
  process.exit(1);
}

function layerRanges(css) {
  const ranges = [];
  for (let index = 0; index < css.length; index += 1) {
    if (!css.startsWith("@layer", index)) continue;
    const before = css[index - 1] ?? "";
    if (/[a-zA-Z0-9_-]/.test(before)) continue;
    const openBrace = css.indexOf("{", index);
    if (openBrace < 0) continue;
    const closeBrace = matchingBrace(css, openBrace);
    if (closeBrace < 0) continue;
    ranges.push([index, closeBrace + 1]);
    index = closeBrace;
  }
  return ranges;
}

function matchingBrace(css, openBrace) {
  let depth = 0;
  for (let index = openBrace; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function blankRanges(value, ranges) {
  const chars = Array.from(value);
  for (const [start, end] of ranges) {
    for (let index = start; index < end; index += 1) chars[index] = " ";
  }
  return chars.join("");
}

function lineNumber(value, index) {
  return value.slice(0, index).split("\n").length;
}

function isGlobalFormControlResetSelector(selector) {
  return selector
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => /^(button|input|textarea|select)(?:$|[\s:[.#])/i.test(part));
}

function cssFiles(appsRoot) {
  if (!existsSync(appsRoot)) return [];
  const results = [];
  for (const appName of readdirSync(appsRoot)) {
    const stylesRoot = join(appsRoot, appName, "web", "src", "styles");
    if (!existsSync(stylesRoot)) continue;
    collectCssFiles(stylesRoot, results);
  }
  return results;
}

function collectCssFiles(dir, results) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collectCssFiles(path, results);
    } else if (name.endsWith(".css")) {
      results.push(path);
    }
  }
}
