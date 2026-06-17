import { useCallback, useState } from "react";
import type { RuntimeState } from "./runtime/types";
import { HtmlArtifactRuntimeAdapter } from "./htmlArtifactAdapter";
import type { ArtifactRuntimeParseInput } from "./types";

export type ArtifactSaveState = "saved" | "saving" | "error";

export function useHtmlArtifactRuntime(adapter: HtmlArtifactRuntimeAdapter) {
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [frameSrcDoc, setFrameSrcDoc] = useState("");
  const [frameRevision, setFrameRevision] = useState(0);
  const [saveState, setSaveState] = useState<ArtifactSaveState>("saved");

  const loadArtifact = useCallback(
    (input: ArtifactRuntimeParseInput) => {
      const nextRuntime = adapter.parse(input);
      setRuntime(nextRuntime);
      setFrameSrcDoc(revisionedFrameSrcDoc(adapter.serialize(nextRuntime)));
      setFrameRevision((current) => current + 1);
      setSaveState("saved");
      return nextRuntime;
    },
    [adapter],
  );

  const clearArtifact = useCallback(() => {
    setRuntime(null);
    setFrameSrcDoc("");
    setFrameRevision((current) => current + 1);
    setSaveState("saved");
  }, []);

  const resetFrameFromRuntime = useCallback(() => {
    if (!runtime) return;
    setFrameSrcDoc(revisionedFrameSrcDoc(adapter.serialize(runtime)));
    setFrameRevision((current) => current + 1);
  }, [adapter, runtime]);

  const serialize = useCallback((state: RuntimeState) => adapter.serialize(state), [adapter]);
  const createAiEditRequest = useCallback(
    (input: Parameters<HtmlArtifactRuntimeAdapter["createAiEditRequest"]>[0]) => adapter.createAiEditRequest(input),
    [adapter],
  );

  return {
    runtime,
    setRuntime,
    frameSrcDoc,
    frameRevision,
    saveState,
    setSaveState,
    loadArtifact,
    clearArtifact,
    resetFrameFromRuntime,
    serialize,
    createAiEditRequest,
  };
}

function revisionedFrameSrcDoc(srcDoc: string) {
  return `${srcDoc}\n<!-- ai-doc-frame-revision:${Date.now()}:${Math.random().toString(36).slice(2)} -->`;
}
