import { useCallback, useEffect, useRef, useState } from "react";
import { createPptxPreviewService } from "@tutti-os/office-preview/pptx";
import { getProjectPptxFile } from "../api/projects";
import { PptxArtifactRuntimeAdapter, type PptxRuntimeParseInput, type PptxRuntimeState, type PptxSelection } from "./pptxArtifactAdapter";

export function usePptxArtifactRuntime(adapter: PptxArtifactRuntimeAdapter) {
  const [runtime, setRuntime] = useState<PptxRuntimeState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeResourceSessionIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const previewServiceRef = useRef(
    createPptxPreviewService({
      assetBaseUrl: "/office-preview/ooxml-convert/",
    }),
  );

  const disposeCurrentPreview = useCallback(() => {
    const resourceSessionId = activeResourceSessionIdRef.current;
    if (!resourceSessionId) return;
    previewServiceRef.current.disposePreview(resourceSessionId);
    activeResourceSessionIdRef.current = null;
  }, []);

  useEffect(() => disposeCurrentPreview, [disposeCurrentPreview]);

  const loadArtifact = useCallback(
    async (projectId: string, input: PptxRuntimeParseInput) => {
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      setLoading(true);
      setError("");
      disposeCurrentPreview();
      const parsedRuntime = adapter.parse(input);
      setRuntime(parsedRuntime);

      if (!parsedRuntime.manifest.exists) {
        setLoading(false);
        return parsedRuntime;
      }

      try {
        const bytes = await getProjectPptxFile(projectId);
        const preview = await previewServiceRef.current.createPreview({
          bytes,
          extension: "pptx",
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          name: parsedRuntime.manifest.fileName,
          sizeBytes: bytes.byteLength,
        });
        if (loadGenerationRef.current !== generation) {
          previewServiceRef.current.disposePreview(preview.resourceSessionId);
          return parsedRuntime;
        }
        activeResourceSessionIdRef.current = preview.resourceSessionId;
        const nextRuntime = adapter.withPreview(parsedRuntime, preview);
        setRuntime(nextRuntime);
        return nextRuntime;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        if (loadGenerationRef.current === generation) setLoading(false);
      }
    },
    [adapter, disposeCurrentPreview],
  );

  const clearArtifact = useCallback(() => {
    loadGenerationRef.current += 1;
    disposeCurrentPreview();
    setRuntime(null);
    setLoading(false);
    setError("");
  }, [disposeCurrentPreview]);

  const updateSelection = useCallback((selection: PptxSelection) => {
    setRuntime((current) => (current ? { ...current, selection } : current));
  }, []);

  const createAiEditRequest = useCallback(
    (input: Parameters<PptxArtifactRuntimeAdapter["createAiEditRequest"]>[0]) => adapter.createAiEditRequest(input),
    [adapter],
  );

  return {
    runtime,
    loading,
    error,
    loadArtifact,
    clearArtifact,
    updateSelection,
    createAiEditRequest,
  };
}
