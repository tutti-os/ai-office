import { useCallback, useEffect, useRef, useState } from "react";

export type OfficePreviewResource = {
  resourceSessionId: string;
};

export type OfficePreviewService<TPreview extends OfficePreviewResource> = {
  createPreview(input: {
    bytes: ArrayBuffer;
    extension: string;
    mimeType: string;
    name: string;
    sizeBytes: number;
  }): Promise<TPreview>;
  disposePreview(resourceSessionId: string): void;
};

export type OfficePreviewRuntimeAdapter<TRuntime, TParseInput, TPreview extends OfficePreviewResource, TAiEditInput, TAiEditRequest> = {
  parse(input: TParseInput): TRuntime;
  withPreview(runtime: TRuntime, preview: TPreview | null): TRuntime;
  serialize?: (runtime: TRuntime) => string;
  createAiEditRequest(input: TAiEditInput): TAiEditRequest;
};

export type UseOfficePreviewRuntimeOptions<
  TRuntime,
  TParseInput,
  TPreview extends OfficePreviewResource,
  TSelection,
  TAiEditInput,
  TAiEditRequest,
> = {
  adapter: OfficePreviewRuntimeAdapter<TRuntime, TParseInput, TPreview, TAiEditInput, TAiEditRequest>;
  createPreviewService: () => OfficePreviewService<TPreview>;
  fetchBytes: (projectId: string) => Promise<ArrayBuffer>;
  extension: string;
  mimeType: string;
  fileName: (runtime: TRuntime) => string;
  hasPreviewSource: (runtime: TRuntime) => boolean;
  updateSelection: (runtime: TRuntime, selection: TSelection) => TRuntime;
  initialSaveState?: "saved" | "saving" | "error";
};

export function useOfficePreviewArtifactRuntime<
  TRuntime,
  TParseInput,
  TPreview extends OfficePreviewResource,
  TSelection,
  TAiEditInput,
  TAiEditRequest,
>(options: UseOfficePreviewRuntimeOptions<TRuntime, TParseInput, TPreview, TSelection, TAiEditInput, TAiEditRequest>) {
  const [runtime, setRuntime] = useState<TRuntime | null>(null);
  const [saveState, setSaveState] = useState(options.initialSaveState ?? "saved");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeResourceSessionIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const previewServiceRef = useRef(options.createPreviewService());

  const disposeCurrentPreview = useCallback(() => {
    const resourceSessionId = activeResourceSessionIdRef.current;
    if (!resourceSessionId) return;
    previewServiceRef.current.disposePreview(resourceSessionId);
    activeResourceSessionIdRef.current = null;
  }, []);

  useEffect(() => disposeCurrentPreview, [disposeCurrentPreview]);

  const loadArtifact = useCallback(
    async (projectId: string, input: TParseInput) => {
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      setLoading(true);
      setError("");
      disposeCurrentPreview();
      const parsedRuntime = options.adapter.parse(input);
      setRuntime(parsedRuntime);
      setSaveState(options.initialSaveState ?? "saved");

      if (!options.hasPreviewSource(parsedRuntime)) {
        setLoading(false);
        return parsedRuntime;
      }

      try {
        const bytes = await options.fetchBytes(projectId);
        const preview = await previewServiceRef.current.createPreview({
          bytes,
          extension: options.extension,
          mimeType: options.mimeType,
          name: options.fileName(parsedRuntime),
          sizeBytes: bytes.byteLength,
        });
        if (loadGenerationRef.current !== generation) {
          previewServiceRef.current.disposePreview(preview.resourceSessionId);
          return parsedRuntime;
        }
        activeResourceSessionIdRef.current = preview.resourceSessionId;
        const nextRuntime = options.adapter.withPreview(parsedRuntime, preview);
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
    [disposeCurrentPreview, options],
  );

  const clearArtifact = useCallback(() => {
    loadGenerationRef.current += 1;
    disposeCurrentPreview();
    setRuntime(null);
    setSaveState(options.initialSaveState ?? "saved");
    setLoading(false);
    setError("");
  }, [disposeCurrentPreview, options.initialSaveState]);

  const updateSelection = useCallback(
    (selection: TSelection) => {
      setRuntime((current) => (current ? options.updateSelection(current, selection) : current));
    },
    [options],
  );

  const serialize = useCallback((state: TRuntime) => options.adapter.serialize?.(state) ?? "", [options.adapter]);
  const createAiEditRequest = useCallback((input: TAiEditInput) => options.adapter.createAiEditRequest(input), [options.adapter]);

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
