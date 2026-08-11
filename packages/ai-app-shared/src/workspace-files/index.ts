import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Return all regular files below a workspace directory, tolerating missing roots. */
export async function listWorkspaceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listWorkspaceFiles(filePath));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

/** Encode an already-resolved file path for the existing app-data-relative protocol. */
export function appDataRelativeReferencePath(appDataRoot: string, absolutePath: string): string {
  const resolvedRoot = resolve(appDataRoot);
  const resolvedPath = resolve(absolutePath);
  const locator = relative(resolvedRoot, resolvedPath);
  if (!locator || isAbsolute(locator) || locator === ".." || locator.startsWith(`..${sep}`) || locator.includes("\0")) {
    throw new Error("reference path cannot be encoded relative to app data");
  }
  return locator.split("\\").join("/");
}
