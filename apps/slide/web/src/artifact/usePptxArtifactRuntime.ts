import { useMemo } from "react";
import { useOfficePreviewArtifactRuntime } from "@ai-app/ui/office-preview-runtime";
import { createPptxPreviewService } from "@tutti-os/office-preview/pptx";
import { getProjectPptxFile } from "../api/projects";
import { PptxArtifactRuntimeAdapter, type PptxRuntimeParseInput, type PptxRuntimeState, type PptxSelection } from "./pptxArtifactAdapter";

export function usePptxArtifactRuntime(adapter: PptxArtifactRuntimeAdapter) {
  const options = useMemo(
    () => ({
      adapter,
      createPreviewService: () =>
        createPptxPreviewService({
          assetBaseUrl: import.meta.env.DEV ? "/office-preview-dev/ooxml-convert/" : "/office-preview/ooxml-convert/",
        }),
      fetchBytes: getProjectPptxFile,
      extension: "pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileName: (runtime: PptxRuntimeState) => runtime.manifest.fileName,
      hasPreviewSource: (runtime: PptxRuntimeState) => runtime.manifest.exists,
      updateSelection: (runtime: PptxRuntimeState, selection: PptxSelection) => ({ ...runtime, selection }),
      initialSaveState: "saved" as const,
    }),
    [adapter],
  );

  return useOfficePreviewArtifactRuntime<
    PptxRuntimeState,
    PptxRuntimeParseInput,
    NonNullable<PptxRuntimeState["preview"]>,
    PptxSelection,
    Parameters<PptxArtifactRuntimeAdapter["createAiEditRequest"]>[0],
    ReturnType<PptxArtifactRuntimeAdapter["createAiEditRequest"]>
  >(options);
}
