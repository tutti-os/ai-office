import { useEffect, useState } from "react";
import { isArtifactAgentRunning } from "@ai-app/shared/artifact-runtime";
import { openExportLocation } from "@ai-app/shared/host-files";
import { ArtifactEditorWorkspace, type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { DeckEditor } from "./DeckEditor";
import { saveDeckPdfExport } from "./deckExport";
import { exportProjectHtmlDeck, openProjectExportsDir } from "../api/projects";
import { EditorInfoPanel } from "./EditorInfoPanel";
import { PptxPreview } from "./PptxPreview";
import { savePptxPdfExport } from "./pptxExport";
import { isTuttiPdfExportAvailable } from "./tuttiPdfBridge";
import { usePptxArtifactRuntime } from "../artifact/usePptxArtifactRuntime";
import { artifactEditorCopy } from "../i18n/copy";
import { useI18n } from "../i18n";
import type { DeckAgentRuntimeProvider } from "../artifact/deckArtifactAdapter";
import type { ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import type { LocalAgentTargetStatus, ProjectDetailResponse, RuntimeProfile, SlideArtifactType, SlideRunTimelineItem } from "@ai-slide/shared";

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
  localAgentTargets: LocalAgentTargetStatus[];
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
  const { t } = useI18n();
  const [deckSaveState, setDeckSaveState] = useState<ArtifactSaveState>("saved");
  const [htmlExporting, setHtmlExporting] = useState(false);
  const [pptxExporting, setPptxExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const [exportRevealPath, setExportRevealPath] = useState("");
  const artifactType = props.detail?.artifact.type ?? "deck";
  const pdfExportAvailable = isTuttiPdfExportAvailable();
  const headerSaveState: ArtifactSaveState = props.loading ? "loading" : props.pptxError ? "error" : artifactType === "deck" ? deckSaveState : "saved";
  const agentProcessing = isArtifactAgentRunning(props.artifactInteraction);
  const exportInProgress = htmlExporting || pdfExporting || pptxExporting;

  const exportDeckHtml = async () => {
    if (props.detail?.artifact.type !== "deck" || exportInProgress) return;
    setHtmlExporting(true);
    setExportNotice("");
    setExportRevealPath("");
    try {
      const exported = await exportProjectHtmlDeck(props.projectId);
      console.info(`[ai-slide] Exported HTML to ${exported.path}`);
      setExportRevealPath(exported.path);
      setExportNotice(t("editor.exportedHtml", { path: exported.path }));
    } catch (error) {
      console.error(error);
      setExportNotice(error instanceof Error ? error.message : t("editor.htmlExportFailed"));
    } finally {
      setHtmlExporting(false);
    }
  };

  const exportDeckPdf = async () => {
    if (!props.detail?.deckManifest || props.detail.artifact.type !== "deck" || exportInProgress) return;
    setPdfExporting(true);
    setExportNotice("");
    setExportRevealPath("");
    try {
      const exported = await saveDeckPdfExport({
        artifact: props.detail.artifact,
        manifest: props.detail.deckManifest,
        projectId: props.projectId,
        title: props.detail.project.title,
      });
      console.info(`[ai-slide] Exported deck PDF to ${exported.path}`);
      setExportRevealPath(exported.path);
      setExportNotice(t("editor.exportedPdf", { path: exported.path }));
    } catch (error) {
      console.error(error);
      setExportNotice(error instanceof Error ? error.message : t("editor.pdfExportFailed"));
    } finally {
      setPdfExporting(false);
    }
  };

  const exportPptxPdf = async () => {
    const presentation = props.pptxRuntime?.preview?.renderPresentation ?? null;
    if (props.detail?.artifact.type !== "pptx" || !presentation || exportInProgress) return;
    setPptxExporting(true);
    setExportNotice("");
    setExportRevealPath("");
    try {
      const exported = await savePptxPdfExport({
        presentation,
        projectId: props.projectId,
        title: props.detail.project.title,
      });
      console.info(`[ai-slide] Exported PPTX PDF to ${exported.path}`);
      setExportRevealPath(exported.path);
      setExportNotice(t("editor.exportedPdf", { path: exported.path }));
    } catch (error) {
      console.error(error);
      setExportNotice(error instanceof Error ? error.message : t("editor.pdfExportFailed"));
    } finally {
      setPptxExporting(false);
    }
  };

  const openExportedLocation = async () => {
    try {
      await openExportLocation({
        path: exportRevealPath,
        openExportsDir: () => openProjectExportsDir(props.projectId),
      });
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    props.onArtifactSaveStateChange(artifactType === "deck" ? deckSaveState : "saved");
  }, [artifactType, deckSaveState, props.onArtifactSaveStateChange]);

  return (
    <ArtifactEditorWorkspace
      title={props.detail?.project.title ?? t("editor.untitledPresentation")}
      saveState={headerSaveState}
      agentWorking={agentProcessing}
      exportItems={slideExportItems({
        artifactType,
        htmlExporting,
        onExportDeckHtml: exportDeckHtml,
        onExportDeckPdf: exportDeckPdf,
        onExportPptxPdf: exportPptxPdf,
        pdfExportAvailable,
        pdfExporting,
        pptxPdfReady: Boolean(props.pptxRuntime?.preview?.renderPresentation),
        pptxExporting,
        t,
      })}
      exportNotice={exportNotice}
      exportRevealPath={exportRevealPath}
      copy={artifactEditorCopy(t)}
      bodyClassName="flex flex-col"
      tone="lumen"
      onBackHome={props.onBackHome}
      onDismissExportNotice={() => {
        setExportNotice("");
        setExportRevealPath("");
      }}
      onOpenExportLocation={() => void openExportedLocation()}
      sidebar={
        <AgentConversationPanel
          activeSelectionLabel={props.activeSelectionLabel}
          activeSelectionText={props.activeSelectionText}
          activeSelectionVisible={props.activeSelectionVisible}
          artifactLabel={props.detail?.artifact.type ?? "deck"}
          dirty={false}
          error={props.conversationError || props.error || props.pptxError}
          items={props.conversationItems}
          localAgentTargets={props.localAgentTargets}
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
      {props.loading ? (
        <EditorInfoPanel title={t("editor.loadingPresentation")} />
      ) : props.error ? (
        <EditorInfoPanel detail={props.error} title={t("editor.presentationNotFound")} />
      ) : props.detail?.artifact.type === "deck" ? (
        <DeckEditor
          agentProcessing={agentProcessing}
          detail={props.detail}
          interaction={props.artifactInteraction}
          projectId={props.projectId}
          onAgentRuntimeProviderChange={props.onDeckAgentRuntimeProviderChange}
          onAgentSelectionPreviewChange={props.onDeckSelectionPreviewChange}
          onSaveStateChange={setDeckSaveState}
          selectedBlockLabel={t("editor.selectedBlock")}
          selectedTextLabel={t("editor.selectedText")}
        />
      ) : props.detail?.artifact.type === "pptx" && props.pptxRuntime ? (
        <PptxPreview
          agentProcessing={agentProcessing}
          runtime={props.pptxRuntime}
          error={props.pptxError}
          onSelectionChange={props.onPptxSelectionChange}
        />
      ) : props.detail ? (
        <EditorInfoPanel
          detail={t("editor.waitingForFile", { fileRef: props.detail.artifact.fileRef })}
          title={props.detail.project.title}
        />
      ) : null}
    </ArtifactEditorWorkspace>
  );
}

function slideExportItems(input: {
  artifactType: SlideArtifactType;
  htmlExporting: boolean;
  onExportDeckHtml: () => Promise<void>;
  onExportDeckPdf: () => Promise<void>;
  onExportPptxPdf: () => Promise<void>;
  pdfExportAvailable: boolean;
  pdfExporting: boolean;
  pptxPdfReady: boolean;
  pptxExporting: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (input.artifactType === "pptx") {
    return [
      {
        label: input.pptxExporting ? input.t("editor.pdfExporting") : "PDF",
        disabled: input.pptxExporting || !input.pdfExportAvailable || !input.pptxPdfReady,
        loading: input.pptxExporting,
        onSelect: () => input.onExportPptxPdf(),
      },
    ];
  }
  const items = [
    {
      label: input.htmlExporting ? input.t("editor.htmlExporting") : "HTML",
      disabled: input.htmlExporting,
      loading: input.htmlExporting,
      onSelect: () => input.onExportDeckHtml(),
    },
  ];
  if (input.pdfExportAvailable) {
    items.push({
      label: input.pdfExporting ? input.t("editor.pdfExporting") : "PDF",
      disabled: input.pdfExporting,
      loading: input.pdfExporting,
      onSelect: () => input.onExportDeckPdf(),
    });
  }
  items.push({
    label: input.t("editor.pptxComingSoon"),
    disabled: true,
    loading: false,
    onSelect: async () => {},
  });
  return items;
}
