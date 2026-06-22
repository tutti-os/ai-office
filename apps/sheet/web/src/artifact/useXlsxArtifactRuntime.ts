import { useMemo } from "react";
import { useOfficePreviewArtifactRuntime } from "@ai-app/ui/office-preview-runtime";
import { createXlsxPreviewService } from "@tutti-os/office-preview/xlsx";
import { getProjectXlsxFile } from "../api/projects";
import { XlsxArtifactRuntimeAdapter, type XlsxRuntimeParseInput, type XlsxRuntimeState, type XlsxSelection } from "./xlsxArtifactAdapter";

export function useXlsxArtifactRuntime(adapter: XlsxArtifactRuntimeAdapter) {
  const options = useMemo(
    () => ({
      adapter,
      createPreviewService: () =>
        createXlsxPreviewService({
          assetBaseUrl: import.meta.env.DEV ? "/office-preview-dev/ooxml-convert/" : "/office-preview/ooxml-convert/",
        }),
      fetchBytes: getProjectXlsxFile,
      extension: "xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: (runtime: XlsxRuntimeState) => runtime.manifest.fileName,
      hasPreviewSource: (runtime: XlsxRuntimeState) => runtime.manifest.exists,
      updateSelection: (runtime: XlsxRuntimeState, selection: XlsxSelection) => ({ ...runtime, selection }),
      initialSaveState: "saved" as const,
    }),
    [adapter],
  );

  return useOfficePreviewArtifactRuntime<
    XlsxRuntimeState,
    XlsxRuntimeParseInput,
    NonNullable<XlsxRuntimeState["preview"]>,
    XlsxSelection,
    Parameters<XlsxArtifactRuntimeAdapter["createAiEditRequest"]>[0],
    ReturnType<XlsxArtifactRuntimeAdapter["createAiEditRequest"]>
  >(options);
}
