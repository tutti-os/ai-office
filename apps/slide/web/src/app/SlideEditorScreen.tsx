import { useEffect, useState } from "react";
import { isArtifactAgentRunning } from "@ai-app/shared/artifact-runtime";
import { ArtifactAgentProcessingOverlay, ArtifactEditorFrame, ArtifactExportToast, ArtifactWorkspaceHeader, type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { DeckEditor } from "./DeckEditor";
import { saveDeckPptxExport } from "./deckExport";
import { exportProjectPptxFile, openProjectExportsDir } from "../api/projects";
import { EditorInfoPanel } from "./EditorInfoPanel";
import { PptxPreview } from "./PptxPreview";
import { usePptxArtifactRuntime } from "../artifact/usePptxArtifactRuntime";
import type { DeckAgentRuntimeProvider } from "../artifact/deckArtifactAdapter";
import type { ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import type { LocalAgentProviderStatus, ProjectDetailResponse, RuntimeProfile, SlideArtifactType, SlideRunTimelineItem } from "@ai-slide/shared";

export function SlideEditorScreen(props: {
  activeSelectionLabel?: string;
  activeSelectionText: string;
  activeSelectionVisible?: boolean;
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
  onDeckSelectionPreviewChange: (preview: { label: string; text: string; visible: boolean }) => void;
  onPptxSelectionChange: ReturnType<typeof usePptxArtifactRuntime>["updateSelection"];
  onSelectedAgentChange: (value: string) => void;
  onSend: (prompt: string) => Promise<void>;
}) {
  const [deckSaveState, setDeckSaveState] = useState<ArtifactSaveState>("saved");
  const [pptxExporting, setPptxExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const artifactType = props.detail?.artifact.type ?? "deck";
  const headerSaveState: ArtifactSaveState = props.loading ? "loading" : props.pptxError ? "error" : artifactType === "deck" ? deckSaveState : "saved";
  const agentProcessing = isArtifactAgentRunning(props.artifactInteraction);

  const exportDeckPptx = async () => {
    if (!props.detail?.deckManifest || props.detail.artifact.type !== "deck") return;
    setPptxExporting(true);
    setExportNotice("");
    try {
      const exported = await saveDeckPptxExport({
        artifact: props.detail.artifact,
        manifest: props.detail.deckManifest,
        projectId: props.projectId,
        title: props.detail.project.title,
      });
      console.info(`[ai-slide] Exported deck PPTX to ${exported.path}`);
      setExportNotice(`Exported PPTX to ${exported.path}`);
    } catch (error) {
      console.error(error);
    } finally {
      setPptxExporting(false);
    }
  };

  const exportPptxArtifact = async () => {
    if (props.detail?.artifact.type !== "pptx") return;
    setPptxExporting(true);
    setExportNotice("");
    try {
      const exported = await exportProjectPptxFile(props.projectId);
      console.info(`[ai-slide] Exported PPTX to ${exported.path}`);
      setExportNotice(`Exported PPTX to ${exported.path}`);
    } catch (error) {
      console.error(error);
    } finally {
      setPptxExporting(false);
    }
  };

  const openExportLocation = async () => {
    try {
      await openProjectExportsDir(props.projectId);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    props.onArtifactSaveStateChange(artifactType === "deck" ? deckSaveState : "saved");
  }, [artifactType, deckSaveState, props.onArtifactSaveStateChange]);

  return (
    <ArtifactEditorFrame
      className="bg-[#E6DDCD] text-[#2A2620]"
      sidebar={
        <AgentConversationPanel
          activeSelectionLabel={props.activeSelectionLabel}
          activeSelectionText={props.activeSelectionText}
          activeSelectionVisible={props.activeSelectionVisible}
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
      <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#E6DDCD] text-[#2A2620]">
        <ArtifactWorkspaceHeader
          title={props.detail?.project.title ?? "Untitled Presentation"}
          saveState={headerSaveState}
          agentWorking={agentProcessing}
          exportItems={slideExportItems(artifactType, exportDeckPptx, exportPptxArtifact, pptxExporting)}
          tone="lumen"
          onBackHome={props.onBackHome}
        />
        <ArtifactExportToast message={exportNotice} onClose={() => setExportNotice("")} onOpenLocation={() => void openExportLocation()} />
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
              onAgentSelectionPreviewChange={props.onDeckSelectionPreviewChange}
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

function slideExportItems(artifactType: SlideArtifactType, onExportDeckPptx: () => Promise<void>, onExportPptxArtifact: () => Promise<void>, pptxExporting: boolean) {
  if (artifactType === "pptx") {
    return [
      {
        label: pptxExporting ? "PPTX exporting..." : "PPTX",
        disabled: pptxExporting,
        onSelect: () => void onExportPptxArtifact(),
      },
      { label: "PDF", disabled: true, onSelect: () => undefined },
    ];
  }
  return [
    { label: "HTML deck", disabled: true, onSelect: () => undefined },
    {
      label: pptxExporting ? "PPTX exporting..." : "PPTX",
      disabled: pptxExporting,
      onSelect: () => void onExportDeckPptx(),
    },
  ];
}
