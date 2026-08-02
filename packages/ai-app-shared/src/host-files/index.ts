type TuttiExternalFilesOpen = (input: {
  path: string;
  name?: string;
  mode?: "auto" | "preview" | "reveal";
}) => Promise<void>;

type TuttiExternalFiles = {
  open?: TuttiExternalFilesOpen;
};

function readTuttiExternalFiles(): TuttiExternalFiles | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { tuttiExternal?: { files?: TuttiExternalFiles } }).tuttiExternal?.files;
}

/**
 * Reveal a workspace path in the host Files UI when Tutti/TSH injects
 * `window.tuttiExternal.files.open`. Returns false when the bridge is absent.
 */
export async function revealPathInHostFiles(path: string): Promise<boolean> {
  const trimmed = path.trim();
  if (!trimmed) return false;
  const files = readTuttiExternalFiles();
  if (!files?.open) return false;
  await files.open({ path: trimmed, mode: "reveal" });
  return true;
}

/**
 * Prefer host Files reveal for Tutti/TSH; otherwise open the local exports
 * directory through the app server (`/exports/open` → OS file manager).
 */
export async function openExportLocation(input: {
  path?: string | null;
  openExportsDir: () => Promise<unknown>;
}): Promise<void> {
  const path = input.path?.trim();
  if (path) {
    try {
      if (await revealPathInHostFiles(path)) return;
    } catch {
      // Fall through for non-Tutti or partially wired hosts.
    }
  }
  await input.openExportsDir();
}
