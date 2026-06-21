import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const assets = [
  {
    label: "office-preview",
    source: resolve(appRoot, "node_modules/@tutti-os/office-preview/dist/ooxml-convert"),
    destination: resolve(appRoot, "public/office-preview/ooxml-convert"),
  },
  {
    label: "office-export",
    source: firstExistingPath([
      resolve(appRoot, "node_modules/@tutti-os/office-export/dist/ooxml-export"),
      resolve(appRoot, "node_modules/@tutti-os/office-export/public"),
    ]),
    destination: resolve(appRoot, "public/office-export/ooxml-export"),
  },
];

for (const asset of assets) {
  if (!asset.source) throw new Error(`Unable to find ${asset.label} assets`);
  rmSync(asset.destination, { force: true, recursive: true });
  mkdirSync(dirname(asset.destination), { recursive: true });
  cpSync(asset.source, asset.destination, { recursive: true });
  console.log(`Copied ${asset.label} assets to ${asset.destination}`);
}

function firstExistingPath(paths) {
  return paths.find((path) => existsSync(path)) ?? "";
}
