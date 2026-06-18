import { useCallback, useEffect, useRef, useState } from "react";
import { createDocxPreviewService } from "@tutti-os/office-preview/docx";
import { getProjectDocxFile } from "../api/projects";
import { DocxArtifactRuntimeAdapter, type DocxRuntimeState, type DocxSelection } from "./docxArtifactAdapter";
import type { ArtifactRuntimeParseInput } from "./types";
import type { ArtifactSaveState } from "./useHtmlArtifactRuntime";

export function useDocxArtifactRuntime(adapter: DocxArtifactRuntimeAdapter) {
  const [runtime, setRuntime] = useState<DocxRuntimeState | null>(null);
  const [saveState, setSaveState] = useState<ArtifactSaveState>("saved");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeResourceSessionIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const previewServiceRef = useRef(
    createDocxPreviewService({
      assetBaseUrl: import.meta.env.DEV ? "/office-preview-dev/ooxml-convert/" : "/office-preview/ooxml-convert/",
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
    async (projectId: string, input: ArtifactRuntimeParseInput) => {
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      setLoading(true);
      setError("");
      disposeCurrentPreview();
      const parsedRuntime = adapter.parse(input);
      setRuntime(parsedRuntime);
      setSaveState("saved");

      if (!parsedRuntime.manifest.sha256) {
        setLoading(false);
        return parsedRuntime;
      }

      try {
        const bytes = await getProjectDocxFile(projectId);
        const preview = await previewServiceRef.current.createPreview({
          bytes,
          extension: "docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
    setSaveState("saved");
    setLoading(false);
    setError("");
  }, [disposeCurrentPreview]);

  const updateSelection = useCallback((selection: DocxSelection) => {
    setRuntime((current) => (current ? { ...current, selection } : current));
  }, []);

  const serialize = useCallback((state: DocxRuntimeState) => adapter.serialize(state), [adapter]);
  const createAiEditRequest = useCallback(
    (input: Parameters<DocxArtifactRuntimeAdapter["createAiEditRequest"]>[0]) => adapter.createAiEditRequest(input),
    [adapter],
  );

  return {
    runtime,
    setRuntime,
    saveState,
    setSaveState,
    loading,
    error,
    loadArtifact,
    clearArtifact,
    updateSelection,
    serialize,
    createAiEditRequest,
  };
}
