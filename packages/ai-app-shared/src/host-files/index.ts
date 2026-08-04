type TuttiExternalFilesOpen = (input: {
  path: string;
  name?: string;
  mode?: "auto" | "preview" | "reveal";
}) => Promise<void>;

type TuttiExternalFiles = {
  open?: TuttiExternalFilesOpen;
};

type TuttiExternalUserProject = {
  path: string;
  name?: string;
  displayName?: string;
};

type TuttiExternalUserProjects = {
  list?: () => Promise<TuttiExternalUserProject[] | { projects?: TuttiExternalUserProject[] }>;
  selectDirectory?: () => Promise<{ path: string } | null>;
};

type TuttiExternalLogs = {
  write?: (input: { event: string; level?: "debug" | "info" | "warn" | "error"; details?: Record<string, unknown> }) => void;
};

function readTuttiExternal():
  | {
      files?: TuttiExternalFiles;
      logs?: TuttiExternalLogs;
      userProjects?: TuttiExternalUserProjects;
    }
  | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window as unknown as {
      tuttiExternal?: {
        files?: TuttiExternalFiles;
        logs?: TuttiExternalLogs;
        userProjects?: TuttiExternalUserProjects;
      };
    }
  ).tuttiExternal;
}

function readTuttiExternalFiles(): TuttiExternalFiles | undefined {
  return readTuttiExternal()?.files;
}

function writeExportLocationDiagnostic(
  event: string,
  details: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
) {
  const payload = { event: `export-location.${event}`, level, details };
  if (level === "error") {
    console.error("[ai-app/host-files]", payload.event, details);
  } else if (level === "warn") {
    console.warn("[ai-app/host-files]", payload.event, details);
  } else {
    console.info("[ai-app/host-files]", payload.event, details);
  }

  try {
    readTuttiExternal()?.logs?.write?.(payload);
  } catch {
    // Diagnostics must not affect export-open behavior.
  }
}

function readHostFilesOpen(): TuttiExternalFilesOpen | undefined {
  const open = readTuttiExternalFiles()?.open;
  return typeof open === "function" ? open : undefined;
}

export async function listTuttiExternalUserProjects(): Promise<Array<{ path: string; name: string }>> {
  const list = readTuttiExternal()?.userProjects?.list;
  if (typeof list !== "function") return [];
  const result = await list();
  const projects = Array.isArray(result) ? result : result?.projects ?? [];
  return projects
    .map((project) => {
      const path = typeof project.path === "string" ? project.path.trim() : "";
      if (!path) return null;
      const name =
        (typeof project.displayName === "string" && project.displayName.trim()) ||
        (typeof project.name === "string" && project.name.trim()) ||
        path.split("/").filter(Boolean).pop() ||
        path;
      return { path, name };
    })
    .filter((project): project is { path: string; name: string } => Boolean(project));
}

/**
 * Opens the host "Select project folder" flow when available
 * (`tuttiExternal.userProjects.selectDirectory`).
 */
export async function selectTuttiExternalUserProjectDirectory(): Promise<string | null> {
  const selectDirectory = readTuttiExternal()?.userProjects?.selectDirectory;
  if (typeof selectDirectory !== "function") return null;
  const selected = await selectDirectory();
  const path = selected?.path?.trim() ?? "";
  return path || null;
}

/**
 * Reveal a workspace path in the host Files UI when Tutti/TSH injects
 * `window.tuttiExternal.files.open`. Returns false when the bridge is absent.
 */
export async function revealPathInHostFiles(path: string): Promise<boolean> {
  const trimmed = path.trim();
  if (!trimmed) {
    writeExportLocationDiagnostic("reveal.skip-empty-path", {}, "warn");
    return false;
  }
  const open = readHostFilesOpen();
  if (!open) {
    writeExportLocationDiagnostic(
      "reveal.skip-bridge-absent",
      {
        hasTuttiExternal: Boolean(readTuttiExternal()),
        path: trimmed,
      },
      "warn",
    );
    return false;
  }

  writeExportLocationDiagnostic("reveal.attempt", {
    path: trimmed,
    mode: "reveal",
    userActivationActive:
      typeof navigator !== "undefined" ? navigator.userActivation?.isActive === true : null,
  });

  await open({ path: trimmed, mode: "reveal" });
  writeExportLocationDiagnostic("reveal.succeeded", { path: trimmed });
  return true;
}

/**
 * Prefer host Files reveal for Tutti/TSH; otherwise open the local exports
 * directory through the app server (`/exports/open` → OS file manager).
 *
 * When the host bridge exists, never fall back to OS file-manager open: that
 * path is meaningless inside the TSH sandbox and only surfaces xdg-open errors.
 */
export async function openExportLocation(input: {
  path?: string | null;
  openExportsDir: () => Promise<unknown>;
}): Promise<void> {
  const path = input.path?.trim() || "";
  const hostOpen = readHostFilesOpen();
  writeExportLocationDiagnostic("open.start", {
    path: path || null,
    hasBridgeOpen: Boolean(hostOpen),
    userActivationActive:
      typeof navigator !== "undefined" ? navigator.userActivation?.isActive === true : null,
  });

  if (hostOpen) {
    if (!path) {
      const error = new Error("Export path is unavailable for host Files reveal.");
      writeExportLocationDiagnostic("open.missing-export-path-with-bridge", {}, "error");
      throw error;
    }
    try {
      await hostOpen({ path, mode: "reveal" });
      writeExportLocationDiagnostic("open.completed-via-host-reveal", { path });
      return;
    } catch (error) {
      writeExportLocationDiagnostic(
        "reveal.failed",
        {
          path,
          errorName: error instanceof Error ? error.name : null,
          errorMessage: error instanceof Error ? error.message : String(error),
          userActivationActive:
            typeof navigator !== "undefined" ? navigator.userActivation?.isActive === true : null,
        },
        "error",
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  if (!path) {
    writeExportLocationDiagnostic("open.missing-export-path", {}, "warn");
  }

  writeExportLocationDiagnostic(
    "open.fallback-exports-dir",
    {
      path: path || null,
      reason: "host-bridge-absent",
    },
    "warn",
  );
  await input.openExportsDir();
  writeExportLocationDiagnostic("open.fallback-exports-dir-finished", { path: path || null });
}
