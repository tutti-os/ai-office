import { readdir } from "node:fs/promises";
import { join } from "node:path";

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
