import { createContext } from "react";
import { NESTED_EDITOR_UPDATED_COMMAND } from "@mdxeditor/editor";

export type MarkdownEditorStateSnapshot = {
  toJSON: () => { root: unknown };
};

export type MarkdownTableCellEditor = {
  dispatchCommand: (command: typeof NESTED_EDITOR_UPDATED_COMMAND, payload: undefined) => boolean;
  getEditorState: () => MarkdownEditorStateSnapshot;
  getRootElement: () => HTMLElement | null;
  registerUpdateListener: (listener: (payload: { editorState: MarkdownEditorStateSnapshot }) => void) => () => void;
};

export const MarkdownToolbarContext = createContext<{
  active: boolean;
  canRedo: boolean;
  canUndo: boolean;
  projectId: string | null;
  readOnly: boolean;
  toolbarHost: HTMLElement | null;
  onToolbarInteractionStart: () => void;
  onRedo: () => void;
  runProgrammaticChange: <T>(mutation: () => T) => T | undefined;
  onUndo: () => void;
}>({
  active: false,
  canRedo: false,
  canUndo: false,
  projectId: null,
  readOnly: false,
  toolbarHost: null,
  onToolbarInteractionStart: () => undefined,
  onRedo: () => undefined,
  runProgrammaticChange: () => undefined,
  onUndo: () => undefined,
});
