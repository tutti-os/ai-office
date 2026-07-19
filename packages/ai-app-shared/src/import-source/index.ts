import { isAbsolute } from "node:path";
import { ArtifactAppError } from "../server-errors/index.js";

export type ImportSourcePathErrorReason = "path_required" | "path_must_be_absolute";

export class ImportSourcePathError extends ArtifactAppError {
  readonly reason: ImportSourcePathErrorReason;

  constructor(reason: ImportSourcePathErrorReason, message: string) {
    super({ code: "bad_request", message });
    this.name = "ImportSourcePathError";
    this.reason = reason;
  }
}

export function resolveAbsoluteImportSourcePath(inputPath: string) {
  const trimmed = inputPath.trim();
  if (!trimmed) throw new ImportSourcePathError("path_required", "path is required");
  if (!isAbsolute(trimmed)) {
    throw new ImportSourcePathError(
      "path_must_be_absolute",
      "Import path must be absolute; upload file content when an absolute path is unavailable",
    );
  }
  return trimmed;
}
