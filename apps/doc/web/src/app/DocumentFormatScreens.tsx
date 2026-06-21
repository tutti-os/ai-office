import { ArtifactEditorFrame } from "@ai-app/ui/editor-frame";
import type { DocumentRunTimelineItem, LocalAgentProviderStatus, RuntimeProfile } from "@ai-doc/shared";
import type { DocxRuntimeState, DocxSelection } from "../artifact/docxArtifactAdapter";
import type { MarkdownRuntimeState, MarkdownSelection } from "../artifact/markdownArtifactAdapter";
import type { ArtifactSaveState } from "../artifact/useHtmlArtifactRuntime";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { DocxPreview } from "./DocxPreview";
import { MarkdownEditor } from "./MarkdownEditor";

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
  saveState: ArtifactSaveState;
  pdfExportAvailable: boolean;
  pdfExporting: boolean;
  onChange: (content: string, selection: MarkdownSelection) => void;
  onExportDocx: (markdown: string) => Promise<void>;
  onExportMarkdown: (markdown: string) => Promise<void>;
  onExportPdf: (markdown: string) => Promise<void>;
  onPendingTableCellEditChange: (pending: boolean) => void;
  onRedo: () => void;
  onSelectionChange: (selection: MarkdownSelection) => void;
  onTableCellCommitterChange: (committer: (() => boolean) | null) => void;
  onUndo: () => void;
}) {
  return (
    <ArtifactEditorFrame sidebar={<DocumentAgentSidebar artifactLabel="markdown" {...props} />}>
      <MarkdownEditor
        runtime={props.runtime}
        projectId={props.projectId}
        dirty={props.dirty}
        exportNotice={props.exportNotice}
        saveState={props.saveState}
        loading={props.loading}
        agentProcessing={props.agentProcessing}
        readOnly={props.readOnly}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onChange={props.onChange}
        onExportDocx={props.onExportDocx}
        onExportMarkdown={props.onExportMarkdown}
        onExportPdf={props.onExportPdf}
        onDismissExportNotice={props.onDismissExportNotice}
        onOpenExportLocation={props.onOpenExportLocation}
        pdfExportAvailable={props.pdfExportAvailable}
        pdfExporting={props.pdfExporting}
        onPendingTableCellEditChange={props.onPendingTableCellEditChange}
        onSelectionChange={props.onSelectionChange}
        onTableCellCommitterChange={props.onTableCellCommitterChange}
      />
    </ArtifactEditorFrame>
  );
}

export function DocxDocumentScreen(props: SharedShellProps & {
  agentProcessing: boolean;
  loading: boolean;
  projectId: string | null;
  runtime: DocxRuntimeState;
  onSelectionChange: (selection: DocxSelection) => void;
}) {
  return (
    <ArtifactEditorFrame sidebar={<DocumentAgentSidebar artifactLabel="docx" {...props} />}>
      <DocxPreview
        runtime={props.runtime}
        projectId={props.projectId}
        dirty={props.dirty}
        error={props.error}
        agentProcessing={props.agentProcessing}
        loading={props.loading}
        onSelectionChange={props.onSelectionChange}
      />
    </ArtifactEditorFrame>
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
