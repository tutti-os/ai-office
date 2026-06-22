import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const assets = [
  {
    label: "office-preview",
    source: resolve(appRoot, "node_modules/@tutti-os/office-preview/dist/ooxml-convert"),
    destination: resolve(appRoot, "public/office-preview/ooxml-convert"),
  },
];

for (const asset of assets) {
  if (!existsSync(asset.source)) {
    console.warn(`[ai-sheet] ${asset.label} assets not found: ${asset.source}`);
    continue;
  }
  rmSync(asset.destination, { force: true, recursive: true });
  mkdirSync(asset.destination, { recursive: true });
  cpSync(asset.source, asset.destination, { recursive: true });
}
