import { useCallback, useState } from "react";
import type { RuntimeState } from "./runtime/types";
import { HtmlArtifactRuntimeAdapter } from "./htmlArtifactAdapter";
import type { ArtifactRuntimeParseInput } from "./types";

export type ArtifactSaveState = "saved" | "saving" | "error";

export function useHtmlArtifactRuntime(adapter: HtmlArtifactRuntimeAdapter) {
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [saveState, setSaveState] = useState<ArtifactSaveState>("saved");

  const loadArtifact = useCallback(
    (input: ArtifactRuntimeParseInput) => {
      const nextRuntime = adapter.parse(input);
      setRuntime(nextRuntime);
      setSaveState("saved");
      return nextRuntime;
    },
    [adapter],
  );

  const clearArtifact = useCallback(() => {
    setRuntime(null);
    setSaveState("saved");
  }, []);

  const serialize = useCallback((state: RuntimeState) => adapter.serialize(state), [adapter]);
  const createAiEditRequest = useCallback(
    (input: Parameters<HtmlArtifactRuntimeAdapter["createAiEditRequest"]>[0]) => adapter.createAiEditRequest(input),
    [adapter],
  );

  return {
    runtime,
    setRuntime,
    saveState,
    setSaveState,
    loadArtifact,
    clearArtifact,
    serialize,
    createAiEditRequest,
  };
}
