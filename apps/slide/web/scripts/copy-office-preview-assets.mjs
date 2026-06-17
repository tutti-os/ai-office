import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const source = resolve(appRoot, "node_modules/@tutti-os/office-preview/dist/ooxml-convert");
const destination = resolve(appRoot, "public/office-preview/ooxml-convert");

rmSync(destination, { force: true, recursive: true });
mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination, { recursive: true });

console.log(`Copied office-preview assets to ${destination}`);
