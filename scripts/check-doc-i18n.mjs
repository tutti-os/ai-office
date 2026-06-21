import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const localeRoot = path.join(rootDir, "apps", "doc", "locales");
const defaultLocale = "en";

const localeNames = (await readdir(localeRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (!localeNames.includes(defaultLocale)) {
  throw new Error(`Missing default locale directory: ${defaultLocale}`);
}

const files = new Set();
for (const locale of localeNames) {
  for (const entry of await readdir(path.join(localeRoot, locale), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json")) files.add(entry.name);
  }
}

for (const file of [...files].sort()) {
  const byLocale = new Map();
  for (const locale of localeNames) {
    const filePath = path.join(localeRoot, locale, file);
    try {
      const data = JSON.parse(await readFile(filePath, "utf8"));
      byLocale.set(locale, flattenKeys(data));
    } catch (error) {
      throw new Error(`Unable to read ${path.relative(rootDir, filePath)}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const baseKeys = byLocale.get(defaultLocale);
  for (const [locale, keys] of byLocale) {
    const missing = [...baseKeys].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !baseKeys.has(key));
    if (missing.length || extra.length) {
      throw new Error(
        `${file} locale mismatch for ${locale}: missing=${missing.join(",") || "-"} extra=${extra.join(",") || "-"}`,
      );
    }
  }
}

console.log(`AI Doc i18n parity passed for ${localeNames.join(", ")}.`);

function flattenKeys(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = new Set();
    for (const [key, nested] of Object.entries(value)) {
      for (const flattened of flattenKeys(nested, prefix ? `${prefix}.${key}` : key)) {
        keys.add(flattened);
      }
    }
    return keys;
  }
  return new Set([prefix]);
}
