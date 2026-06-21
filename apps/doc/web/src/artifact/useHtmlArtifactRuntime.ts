import { useCallback, useState } from "react";
import type { RuntimeState } from "./runtime/types";
import { HtmlArtifactRuntimeAdapter } from "./htmlArtifactAdapter";
import type { ArtifactRuntimeParseInput } from "./types";
import { renderHtmlProjectAssetReferences } from "./runtime/projectAssets";

export type ArtifactSaveState = "saved" | "saving" | "error";

export function useHtmlArtifactRuntime(adapter: HtmlArtifactRuntimeAdapter) {
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [frameSrcDoc, setFrameSrcDoc] = useState("");
  const [frameRevision, setFrameRevision] = useState(0);
  const [frameProjectId, setFrameProjectId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ArtifactSaveState>("saved");

  const loadArtifact = useCallback(
    (input: ArtifactRuntimeParseInput) => {
      const nextRuntime = adapter.parse(input);
      setRuntime(nextRuntime);
      setFrameProjectId(input.projectId ?? null);
      setFrameSrcDoc(revisionedFrameSrcDoc(renderHtmlProjectAssetReferences(adapter.serialize(nextRuntime), input.projectId ?? null)));
      setFrameRevision((current) => current + 1);
      setSaveState("saved");
      return nextRuntime;
    },
    [adapter],
  );

  const clearArtifact = useCallback(() => {
    setRuntime(null);
    setFrameSrcDoc("");
    setFrameProjectId(null);
    setFrameRevision((current) => current + 1);
    setSaveState("saved");
  }, []);

  const resetFrameFromRuntime = useCallback(() => {
    if (!runtime) return;
    setFrameSrcDoc(revisionedFrameSrcDoc(renderHtmlProjectAssetReferences(adapter.serialize(runtime), frameProjectId)));
    setFrameRevision((current) => current + 1);
  }, [adapter, frameProjectId, runtime]);

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
  return `${withFrameRuntimeBridge(srcDoc)}\n<!-- ai-doc-frame-revision:${Date.now()}:${Math.random().toString(36).slice(2)} -->`;
}

function withFrameRuntimeBridge(srcDoc: string) {
  const bridge = `<script data-editor-runtime="wheel-bridge">
(() => {
  if (window.__aiDocWheelBridgeInstalled) return;
  window.__aiDocWheelBridgeInstalled = true;
  window.addEventListener("wheel", (event) => {
    event.preventDefault();
    window.parent.postMessage({
      type: "ai-doc-frame-wheel",
      deltaX: event.deltaX,
      deltaY: event.deltaY
    }, "*");
  }, { capture: true, passive: false });
})();
</script>`;
  if (/<\/body>/i.test(srcDoc)) return srcDoc.replace(/<\/body>/i, `${bridge}\n</body>`);
  if (/<\/html>/i.test(srcDoc)) return srcDoc.replace(/<\/html>/i, `${bridge}\n</html>`);
  return `${srcDoc}\n${bridge}`;
}
