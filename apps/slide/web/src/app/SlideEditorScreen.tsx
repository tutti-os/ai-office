import { useEffect, useState } from "react";
import { isArtifactAgentRunning } from "@ai-app/shared/artifact-runtime";
import { ArtifactAgentProcessingOverlay, ArtifactEditorFrame, ArtifactWorkspaceHeader, type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { DeckEditor } from "./DeckEditor";
import { EditorInfoPanel } from "./EditorInfoPanel";
import { PptxPreview } from "./PptxPreview";
import { usePptxArtifactRuntime } from "../artifact/usePptxArtifactRuntime";
import type { DeckAgentRuntimeProvider } from "../artifact/deckArtifactAdapter";
import type { ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import type { LocalAgentProviderStatus, ProjectDetailResponse, RuntimeProfile, SlideArtifactType, SlideRunTimelineItem } from "@ai-slide/shared";

export function SlideEditorScreen(props: {
  activeSelectionText: string;
  artifactInteraction: ArtifactInteractionPolicy;
  conversationError: string;
  conversationItems: SlideRunTimelineItem[];
  conversationLoading: boolean;
  detail: ProjectDetailResponse | null;
  error: string;
  loading: boolean;
  localAgentProviders: LocalAgentProviderStatus[];
  pptxError: string;
  pptxRuntime: ReturnType<typeof usePptxArtifactRuntime>["runtime"];
  projectId: string;
  runtimeProfiles: RuntimeProfile[];
  selectedAgent: string;
  sending: boolean;
  onArtifactSaveStateChange: (state: ArtifactSaveState) => void;
  onBackHome: () => void;
  onCancel: (runId: string) => Promise<void>;
  onDeckAgentRuntimeProviderChange: (provider: DeckAgentRuntimeProvider | null) => void;
  onDeckSelectionTextChange: (text: string) => void;
  onPptxSelectionChange: ReturnType<typeof usePptxArtifactRuntime>["updateSelection"];
  onSelectedAgentChange: (value: string) => void;
  onSend: (prompt: string) => Promise<void>;
}) {
  const [deckSaveState, setDeckSaveState] = useState<ArtifactSaveState>("saved");
  const artifactType = props.detail?.artifact.type ?? "deck";
  const headerSaveState: ArtifactSaveState = props.loading ? "loading" : props.pptxError ? "error" : artifactType === "deck" ? deckSaveState : "saved";
  const agentProcessing = isArtifactAgentRunning(props.artifactInteraction);

  useEffect(() => {
    props.onArtifactSaveStateChange(artifactType === "deck" ? deckSaveState : "saved");
  }, [artifactType, deckSaveState, props.onArtifactSaveStateChange]);

  return (
    <ArtifactEditorFrame
      sidebar={
        <AgentConversationPanel
          activeSelectionText={props.activeSelectionText}
          artifactLabel={props.detail?.artifact.type ?? "deck"}
          dirty={false}
          error={props.conversationError || props.error || props.pptxError}
          items={props.conversationItems}
          localAgentProviders={props.localAgentProviders}
          loading={props.conversationLoading}
          runtimeProfiles={props.runtimeProfiles}
          selectedAgent={props.selectedAgent}
          sending={props.sending}
          onBackHome={props.onBackHome}
          onSelectedAgentChange={props.onSelectedAgentChange}
          onCancel={props.onCancel}
          onSend={props.onSend}
        />
      }
    >
      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#242424]">
        <ArtifactWorkspaceHeader
          title={props.detail?.project.title ?? "Untitled Presentation"}
          saveState={headerSaveState}
          exportItems={slideExportItems(props.projectId, artifactType)}
        />
        <div className="relative flex min-h-0 flex-1 flex-col">
          {props.loading ? (
            <EditorInfoPanel title="Loading presentation..." />
          ) : props.error ? (
            <EditorInfoPanel detail={props.error} title="Presentation not found" />
          ) : props.detail?.artifact.type === "deck" ? (
            <DeckEditor
              detail={props.detail}
              interaction={props.artifactInteraction}
              projectId={props.projectId}
              onAgentRuntimeProviderChange={props.onDeckAgentRuntimeProviderChange}
              onAgentSelectionTextChange={props.onDeckSelectionTextChange}
              onSaveStateChange={setDeckSaveState}
            />
          ) : props.detail?.artifact.type === "pptx" && props.pptxRuntime ? (
            <PptxPreview
              runtime={props.pptxRuntime}
              error={props.pptxError}
              onSelectionChange={props.onPptxSelectionChange}
            />
          ) : props.detail ? (
            <EditorInfoPanel
              detail={`Waiting for ${props.detail.artifact.fileRef}`}
              title={props.detail.project.title}
            />
          ) : null}
          <ArtifactAgentProcessingOverlay active={agentProcessing} />
        </div>
      </section>
    </ArtifactEditorFrame>
  );
}

function slideExportItems(projectId: string, artifactType: SlideArtifactType) {
  if (artifactType === "pptx") {
    return [
      {
        label: "PPTX",
        onSelect: () => window.open(`/api/projects/${encodeURIComponent(projectId)}/files/slides.pptx`, "_blank"),
      },
      { label: "PDF", disabled: true, onSelect: () => undefined },
    ];
  }
  return [
    { label: "HTML deck", disabled: true, onSelect: () => undefined },
    { label: "PPTX", disabled: true, onSelect: () => undefined },
    { label: "PDF", disabled: true, onSelect: () => undefined },
  ];
}
