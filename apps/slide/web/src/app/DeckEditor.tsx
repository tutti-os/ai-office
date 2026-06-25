import { DeckEditorView } from "./DeckEditorView";
import { useDeckEditorModel } from "./useDeckEditorModel";
import type { ArtifactSaveState } from "@ai-app/ui/editor-frame";
import type { ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import type { ProjectDetailResponse } from "@ai-slide/shared";
import type { DeckAgentRuntimeProvider } from "../artifact/deckArtifactAdapter";

export function DeckEditor(props: {
  detail: ProjectDetailResponse;
  interaction: ArtifactInteractionPolicy;
  projectId: string;
  onAgentRuntimeProviderChange: (provider: DeckAgentRuntimeProvider | null) => void;
  onAgentSelectionPreviewChange: (preview: { label: string; text: string; visible: boolean }) => void;
  onSaveStateChange: (state: ArtifactSaveState) => void;
  selectedBlockLabel: string;
  selectedTextLabel: string;
}) {
  return <DeckEditorView model={useDeckEditorModel(props)} />;
}
