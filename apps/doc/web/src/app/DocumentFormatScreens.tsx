import { useRef } from "react";
import { ArtifactEditorWorkspace, type ArtifactSaveState as WorkspaceSaveState } from "@ai-app/ui/editor-frame";
import type { DocumentRunTimelineItem, LocalAgentProviderStatus, RuntimeProfile } from "@ai-doc/shared";
import type { DocxRuntimeState, DocxSelection } from "../artifact/docxArtifactAdapter";
import type { MarkdownRuntimeState, MarkdownSelection } from "../artifact/markdownArtifactAdapter";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { DocxPreview } from "./DocxPreview";
import { MarkdownEditor } from "./MarkdownEditor";
import { markdownParagraphCount, markdownWordCount } from "./documentWorkbenchContent";
import { artifactEditorCopy } from "../i18n/copy";
import { useI18n } from "../i18n";

type SharedShellProps = {
  activeSelectionText: string;
  agentConversationError: string;
  agentConversationItems: DocumentRunTimelineItem[];
  agentConversationLoading: boolean;
  agentSending: boolean;
  dirty: boolean;
  error: string;
  exportNotice: string;
  localAgentProviders: LocalAgentProviderStatus[];
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  onBackHome: () => void;
  onCancelAgentRun: (runId: string) => Promise<void>;
  onDismissExportNotice: () => void;
  onOpenExportLocation: () => void;
  onRuntimeProfileChange: (profileId: string) => void;
  onSendAgentPrompt: (prompt: string) => Promise<void>;
};

export function MarkdownDocumentScreen(props: SharedShellProps & {
  agentProcessing: boolean;
  loading: boolean;
  projectId: string | null;
  readOnly: boolean;
  runtime: MarkdownRuntimeState;
  saveState: WorkspaceSaveState;
  pdfExportAvailable: boolean;
  pdfExporting: boolean;
  onChange: (content: string, selection: MarkdownSelection) => void;
  onExportMarkdown: (markdown: string) => Promise<void>;
  onExportPdf: (markdown: string) => Promise<void>;
  onPendingTableCellEditChange: (pending: boolean) => void;
  onRedo: () => void;
  onSelectionChange: (selection: MarkdownSelection) => void;
  onTableCellCommitterChange: (committer: (() => boolean) | null) => void;
  onUndo: () => void;
}) {
  const { t } = useI18n();
  return (
    <ArtifactEditorWorkspace
      title={props.runtime.title || t("editor.untitledMarkdown")}
      saveState={props.saveState}
      agentWorking={props.agentProcessing}
      stats={[
        t("editor.wordCount", { count: markdownWordCount(props.runtime.content) }),
        t("editor.blockCount", { count: markdownParagraphCount(props.runtime.content) }),
      ]}
      copy={artifactEditorCopy(t)}
      exportItems={[
        {
          label: t("editor.docxComingSoon"),
          disabled: true,
          onSelect: () => undefined,
        },
        {
          label: props.pdfExporting ? t("editor.pdfExporting") : "PDF",
          disabled: props.pdfExporting || !props.pdfExportAvailable,
          loading: props.pdfExporting,
          onSelect: () => props.onExportPdf(props.runtime.content),
        },
      ]}
      exportNotice={props.exportNotice}
      bodyClassName="flex flex-col"
      tone="lumen"
      onBackHome={props.onBackHome}
      onDismissExportNotice={props.onDismissExportNotice}
      onOpenExportLocation={props.onOpenExportLocation}
      sidebar={<DocumentAgentSidebar artifactLabel="markdown" {...props} />}
    >
      <MarkdownEditor
        runtime={props.runtime}
        projectId={props.projectId}
        readOnly={props.readOnly}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onChange={props.onChange}
        onPendingTableCellEditChange={props.onPendingTableCellEditChange}
        onSelectionChange={props.onSelectionChange}
        onTableCellCommitterChange={props.onTableCellCommitterChange}
      />
    </ArtifactEditorWorkspace>
  );
}

export function DocxDocumentScreen(props: SharedShellProps & {
  agentProcessing: boolean;
  loading: boolean;
  pdfExportAvailable: boolean;
  pdfExporting: boolean;
  projectId: string | null;
  runtime: DocxRuntimeState;
  onExportPdf: (previewElement: HTMLElement | null) => Promise<void>;
  onSelectionChange: (selection: DocxSelection) => void;
}) {
  const { t } = useI18n();
  const previewRef = useRef<HTMLDivElement | null>(null);
  return (
    <ArtifactEditorWorkspace
      title={props.runtime.title || t("editor.untitledWordDoc")}
      saveState={props.loading ? "loading" : props.dirty ? "saving" : "saved"}
      agentWorking={props.agentProcessing}
      copy={artifactEditorCopy(t)}
      exportItems={[
        {
          label: props.pdfExporting ? t("editor.pdfExporting") : "PDF",
          disabled: props.pdfExporting || !props.pdfExportAvailable,
          loading: props.pdfExporting,
          onSelect: () => props.onExportPdf(previewRef.current),
        },
      ]}
      exportNotice={props.exportNotice}
      bodyClassName="flex flex-col"
      tone="lumen"
      onBackHome={props.onBackHome}
      onDismissExportNotice={props.onDismissExportNotice}
      onOpenExportLocation={props.onOpenExportLocation}
      sidebar={<DocumentAgentSidebar artifactLabel="docx" {...props} />}
    >
      <DocxPreview
        runtime={props.runtime}
        projectId={props.projectId}
        previewRef={previewRef}
        error={props.error}
        onSelectionChange={props.onSelectionChange}
      />
    </ArtifactEditorWorkspace>
  );
}

function DocumentAgentSidebar(props: SharedShellProps & { artifactLabel: "markdown" | "docx" }) {
  return (
    <AgentConversationPanel
      activeSelectionText={props.activeSelectionText}
      artifactLabel={props.artifactLabel}
      dirty={props.dirty}
      error={props.error || props.agentConversationError}
      items={props.agentConversationItems}
      localAgentProviders={props.localAgentProviders}
      loading={props.agentConversationLoading}
      runtimeProfiles={props.runtimeProfiles}
      selectedRuntimeProfileId={props.selectedRuntimeProfileId}
      sending={props.agentSending}
      onBackHome={props.onBackHome}
      onRuntimeProfileChange={props.onRuntimeProfileChange}
      onCancel={props.onCancelAgentRun}
      onSend={props.onSendAgentPrompt}
    />
  );
}
