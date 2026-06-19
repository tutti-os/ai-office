import { DeckEditorView } from "./DeckEditorView";
import { useDeckEditorModel } from "./useDeckEditorModel";
import type { ArtifactSaveState } from "@ai-app/ui/editor-frame";
import type { ProjectDetailResponse } from "@ai-slide/shared";
import type { DeckAgentRuntimeProvider } from "../artifact/deckArtifactAdapter";

export function DeckEditor(props: {
  detail: ProjectDetailResponse;
  projectId: string;
  onAgentRuntimeProviderChange: (provider: DeckAgentRuntimeProvider | null) => void;
  onAgentSelectionTextChange: (text: string) => void;
  onSaveStateChange: (state: ArtifactSaveState) => void;
}) {
  return <DeckEditorView model={useDeckEditorModel(props)} />;
}
