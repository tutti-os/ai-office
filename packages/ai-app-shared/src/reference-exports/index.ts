import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ReferenceExportKind = "docx" | "html" | "markdown" | "pdf" | "pptx";

export type ReferenceExportDescriptor = {
  kind: ReferenceExportKind;
  mimeType: string;
  path: string;
};

export type PublishedReferenceExport = ReferenceExportDescriptor & {
  absolutePath: string;
  projectRelativePath: string;
  sizeBytes: number;
  mtimeMs: number;
};

type ReferenceExportManifest = {
  schemaVersion: "ai-app.reference-exports.v1";
  sourceVersion: string;
  artifacts: ReferenceExportDescriptor[];
};

const publishedDirectoryName = ".reference";
const manifestFileName = "manifest.json";

export function replacePublishedReferenceExports(input: {
  projectRoot: string;
  sourceVersion: string;
  write: (directory: string) => ReferenceExportDescriptor[];
}) {
  const exportsDir = join(input.projectRoot, "exports");
  mkdirSync(exportsDir, { recursive: true });
  const targetDir = join(exportsDir, publishedDirectoryName);
  const temporaryDir = join(exportsDir, `${publishedDirectoryName}-next-${randomUUID()}`);
  mkdirSync(temporaryDir, { recursive: true });
  try {
    const artifacts = input.write(temporaryDir);
    for (const artifact of artifacts) {
      if (!isSafeRelativePath(artifact.path) || !statSync(join(temporaryDir, artifact.path)).isFile()) {
        throw new Error(`Invalid published reference export path: ${artifact.path}`);
      }
    }
    const manifest: ReferenceExportManifest = {
      schemaVersion: "ai-app.reference-exports.v1",
      sourceVersion: input.sourceVersion,
      artifacts,
    };
    writeFileSync(join(temporaryDir, manifestFileName), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    rmSync(targetDir, { force: true, recursive: true });
    renameSync(temporaryDir, targetDir);
    return artifacts;
  } catch (error) {
    rmSync(temporaryDir, { force: true, recursive: true });
    throw error;
  }
}

export function readPublishedReferenceExports(projectRoot: string, sourceVersion: string): PublishedReferenceExport[] {
  const publishedDir = join(projectRoot, "exports", publishedDirectoryName);
  try {
    const manifest = JSON.parse(readFileSync(join(publishedDir, manifestFileName), "utf8")) as Partial<ReferenceExportManifest>;
    if (
      manifest.schemaVersion !== "ai-app.reference-exports.v1"
      || manifest.sourceVersion !== sourceVersion
      || !Array.isArray(manifest.artifacts)
    ) return [];
    return manifest.artifacts.flatMap((artifact) => {
      if (!isReferenceExportDescriptor(artifact)) return [];
      const absolutePath = join(publishedDir, artifact.path);
      const info = statSync(absolutePath);
      if (!info.isFile()) return [];
      return [{
        ...artifact,
        absolutePath,
        projectRelativePath: `exports/${publishedDirectoryName}/${artifact.path}`,
        sizeBytes: info.size,
        mtimeMs: Math.trunc(info.mtimeMs),
      }];
    });
  } catch {
    return [];
  }
}

export function isPublishedReferencePath(pathValue: string) {
  return (
    pathValue === publishedDirectoryName
    || pathValue.startsWith(`${publishedDirectoryName}/`)
    || pathValue.startsWith(`${publishedDirectoryName}-next-`)
  );
}

function isReferenceExportDescriptor(value: unknown): value is ReferenceExportDescriptor {
  if (!value || typeof value !== "object") return false;
  const descriptor = value as Partial<ReferenceExportDescriptor>;
  return (
    ["docx", "html", "markdown", "pdf", "pptx"].includes(descriptor.kind ?? "")
    && typeof descriptor.mimeType === "string"
    && isSafeRelativePath(descriptor.path)
  );
}

function isSafeRelativePath(pathValue: unknown): pathValue is string {
  if (
    typeof pathValue !== "string"
    || !pathValue
    || pathValue.startsWith("/")
    || pathValue.includes("\\")
    || pathValue.includes("\0")
    || pathValue.includes("://")
    || /^[a-zA-Z]:/.test(pathValue)
  ) return false;
  return pathValue.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
