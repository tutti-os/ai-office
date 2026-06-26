#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createArtifactCliManifest, renderArtifactCommandsGuide } from "./cli-manifests.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");

for (const app of ["doc", "slide", "sheet"]) {
  await writeFile(
    path.join(rootDir, "apps", app, "tutti.cli.json"),
    `${JSON.stringify(createArtifactCliManifest(app), null, 2)}\n`,
  );
  await writeFile(path.join(rootDir, "apps", app, "COMMANDS.md"), renderArtifactCommandsGuide(app));
}
