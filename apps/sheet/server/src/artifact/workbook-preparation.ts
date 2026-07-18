import { retryProjectPreparationOperation } from "@ai-app/shared/project-preparation";
import type { XlsxManifest } from "@ai-sheet/shared";

export async function materializeInitialWorkbook<T>(input: {
  workbookPath: string;
  create: () => Promise<void>;
  refresh: () => Promise<T & { manifest: Pick<XlsxManifest, "exists" | "sizeBytes"> }>;
}): Promise<T & { manifest: Pick<XlsxManifest, "exists" | "sizeBytes"> }> {
  return retryProjectPreparationOperation({
    phase: "core_workbook",
    path: input.workbookPath,
    work: async () => {
      await input.create();
      const refreshed = await input.refresh();
      if (!refreshed.manifest.exists || refreshed.manifest.sizeBytes === 0) {
        throw new Error("Created workbook is missing or empty");
      }
      return refreshed;
    },
  });
}
