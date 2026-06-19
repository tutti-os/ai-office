import { useMemo } from "react";
import { useOfficePreviewArtifactRuntime } from "@ai-app/ui/office-preview-runtime";
import { createDocxPreviewService } from "@tutti-os/office-preview/docx";
import { getProjectDocxFile } from "../api/projects";
import { DocxArtifactRuntimeAdapter, type DocxRuntimeState, type DocxSelection } from "./docxArtifactAdapter";
import type { ArtifactRuntimeParseInput } from "./types";

export function useDocxArtifactRuntime(adapter: DocxArtifactRuntimeAdapter) {
  const options = useMemo(
    () => ({
      adapter,
      createPreviewService: () =>
        createDocxPreviewService({
          assetBaseUrl: import.meta.env.DEV ? "/office-preview-dev/ooxml-convert/" : "/office-preview/ooxml-convert/",
        }),
      fetchBytes: getProjectDocxFile,
      extension: "docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: (runtime: DocxRuntimeState) => runtime.manifest.fileName,
      hasPreviewSource: (runtime: DocxRuntimeState) => Boolean(runtime.manifest.sha256),
      updateSelection: (runtime: DocxRuntimeState, selection: DocxSelection) => ({ ...runtime, selection }),
      initialSaveState: "saved" as const,
    }),
    [adapter],
  );

  return useOfficePreviewArtifactRuntime<
    DocxRuntimeState,
    ArtifactRuntimeParseInput,
    NonNullable<DocxRuntimeState["preview"]>,
    DocxSelection,
    Parameters<DocxArtifactRuntimeAdapter["createAiEditRequest"]>[0],
    ReturnType<DocxArtifactRuntimeAdapter["createAiEditRequest"]>
  >(options);
}
