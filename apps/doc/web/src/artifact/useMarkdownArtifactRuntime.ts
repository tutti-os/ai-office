import { useCallback, useState } from "react";
import type { ArtifactSaveState } from "./useHtmlArtifactRuntime";
import { MarkdownArtifactRuntimeAdapter, type MarkdownRuntimeState, type MarkdownSelection } from "./markdownArtifactAdapter";
import type { ArtifactRuntimeParseInput } from "./types";

export function useMarkdownArtifactRuntime(adapter: MarkdownArtifactRuntimeAdapter) {
  const [runtime, setRuntime] = useState<MarkdownRuntimeState | null>(null);
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

  const updateContent = useCallback((content: string, selection: MarkdownSelection) => {
    setRuntime((current) => (current ? pushMarkdownHistory(current, content, selection) : current));
  }, []);

  const updateSelection = useCallback((selection: MarkdownSelection) => {
    setRuntime((current) => (current ? { ...current, selection } : current));
  }, []);

  const undo = useCallback(() => {
    setRuntime((current) => (current ? moveHistory(current, -1) : current));
  }, []);

  const redo = useCallback(() => {
    setRuntime((current) => (current ? moveHistory(current, 1) : current));
  }, []);

  const serialize = useCallback((state: MarkdownRuntimeState) => adapter.serialize(state), [adapter]);
  const createAiEditRequest = useCallback(
    (input: Parameters<MarkdownArtifactRuntimeAdapter["createAiEditRequest"]>[0]) => adapter.createAiEditRequest(input),
    [adapter],
  );

  return {
    runtime,
    setRuntime,
    saveState,
    setSaveState,
    loadArtifact,
    clearArtifact,
    updateContent,
    updateSelection,
    undo,
    redo,
    serialize,
    createAiEditRequest,
  };
}

function pushMarkdownHistory(runtime: MarkdownRuntimeState, content: string, selection: MarkdownSelection): MarkdownRuntimeState {
  const previous = runtime.history.entries[runtime.history.currentIndex];
  if (previous?.content === content && previous.selectionStart === selection.start && previous.selectionEnd === selection.end) {
    return { ...runtime, selection };
  }
  const entries = runtime.history.entries.slice(0, runtime.history.currentIndex + 1);
  entries.push({ content, selectionStart: selection.start, selectionEnd: selection.end });
  const cappedEntries = entries.slice(-100);
  return {
    ...runtime,
    content,
    selection,
    revision: runtime.revision + 1,
    dirty: true,
    history: {
      entries: cappedEntries,
      currentIndex: cappedEntries.length - 1,
    },
  };
}

function moveHistory(runtime: MarkdownRuntimeState, delta: -1 | 1): MarkdownRuntimeState {
  const nextIndex = runtime.history.currentIndex + delta;
  const entry = runtime.history.entries[nextIndex];
  if (!entry) return runtime;
  return {
    ...runtime,
    content: entry.content,
    selection: {
      start: entry.selectionStart,
      end: entry.selectionEnd,
      selectedText: entry.content.slice(entry.selectionStart, entry.selectionEnd),
    },
    revision: runtime.revision + 1,
    dirty: true,
    history: {
      ...runtime.history,
      currentIndex: nextIndex,
    },
  };
}
