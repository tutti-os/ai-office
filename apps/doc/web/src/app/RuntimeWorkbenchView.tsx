import { HomePage } from "./HomePage";
import { ArtifactErrorBoundary, ArtifactSurfaceErrorFallback } from "@ai-app/ui/error-boundary";
import { DocxDocumentScreen, MarkdownDocumentScreen } from "./DocumentFormatScreens";
import { DocumentLoadingScreen, HtmlEditorScreen } from "./HtmlEditorScreen";
import { markdownParagraphCount, markdownWordCount } from "./documentWorkbenchContent";
import type { useRuntimeWorkbenchModel } from "./useRuntimeWorkbenchModel";
import { isArtifactAgentRunning } from "@ai-app/shared/artifact-runtime";

export function RuntimeWorkbenchView(props: { model: ReturnType<typeof useRuntimeWorkbenchModel> }) {
  const {
    activeDirty,
    activeSelectionText,
    agentBusy,
    agentConversation,
    artifactInteraction,
    artifactReadOnly,
    cancelAgentRun,
    clearHistory,
    currentDocumentType,
    currentProjectId,
    deleteHistoryProject,
    docxError,
    docxLoading,
    docxRuntime,
    downloadOfficeCli,
    editorOpen,
    editorStats,
    error,
    exportNotice,
    dismissExportNotice,
    filteredTemplates,
    historyProjects,
    homeAttachments,
    homePanel,
    htmlToolbarActive,
    importDocumentFile,
    linkDraft,
    linkEditorOpen,
    loadBlankDocument,
    loadFixture,
    loadPromptDocument,
    loadTemplate,
    loading,
    localAgentTargets,
    markdownRuntime,
    markdownSaveState,
    officeCliInstalling,
    officeCliStatus,
    openCurrentProjectExportsDir,
    openHistoryProject,
    outputType,
    pdfExportAvailable,
    pdfExporting,
    prompt,
    redoMarkdown,
    requestHomeRoute,
    runtime,
    runtimeProfiles,
    saveState,
    selectedRuntimeProfileId,
    selectedTemplateCategory,
    sendAgentPrompt,
    syncHtmlEditorBody,
    exportCurrentDocxPdf,
    exportCurrentHtml,
    exportCurrentHtmlPdf,
    exportCurrentMarkdown,
    exportCurrentMarkdownPdf,
    setEditorStats,
    setHomePanel,
    setLinkDraft,
    setLinkEditorOpen,
    setMarkdownTableCellCommitter,
    setMarkdownTableCellEditPending,
    setOutputType,
    setPrompt,
    setSelectedRuntimeProfileId,
    setSelectedTemplateCategory,
    templateCategories,
    templateCounts,
    toolbarState,
    undoMarkdown,
    updateHtmlEditorSelection,
    uploadHtmlEditorImageFile,
    updateDocxSelection,
    updateMarkdownContent,
    updateMarkdownSelection,
  } = props.model;
  const artifactAgentProcessing = isArtifactAgentRunning(artifactInteraction);
  return (
    <main className="h-dvh min-h-0 overflow-hidden bg-[#EEE8DC] font-sans text-[#2A2620]">
      {!editorOpen ? (
        <HomePage
          attachments={homeAttachments.attachments}
          categories={templateCategories}
          activePanel={homePanel}
          historyProjects={historyProjects}
          localAgentTargets={localAgentTargets}
          officeCliInstalling={officeCliInstalling}
          officeCliStatus={officeCliStatus}
          outputType={outputType}
          selectedCategory={selectedTemplateCategory}
          selectedRuntimeProfileId={selectedRuntimeProfileId}
          runtimeProfiles={runtimeProfiles}
          templateCounts={templateCounts}
          templates={filteredTemplates}
          error={error}
          loading={loading}
          prompt={prompt}
          onActivePanelChange={setHomePanel}
          onAddFiles={homeAttachments.addFiles}
          onPromptChange={setPrompt}
          onCategoryChange={setSelectedTemplateCategory}
          onCreateBlank={loadBlankDocument}
          onCreateFromPrompt={loadPromptDocument}
          onClearHistory={clearHistory}
          onDeleteHistoryProject={deleteHistoryProject}
          onImportFile={importDocumentFile}
          onOpenHistoryProject={openHistoryProject}
          onInstallOfficeCli={downloadOfficeCli}
          onOutputTypeChange={setOutputType}
          onRemoveAttachment={homeAttachments.removeAttachment}
          onRuntimeProfileChange={setSelectedRuntimeProfileId}
          onSelectTemplate={loadTemplate}
        />
      ) : currentDocumentType === "markdown" && markdownRuntime ? (
        <ArtifactErrorBoundary
          resetKeys={[currentProjectId, currentDocumentType, markdownRuntime.revision]}
          fallback={({ error, resetErrorBoundary }) => (
            <ArtifactSurfaceErrorFallback surfaceName="Document view" error={error} resetErrorBoundary={resetErrorBoundary} onBackHome={requestHomeRoute} />
          )}
        >
          <MarkdownDocumentScreen
            activeSelectionText={activeSelectionText}
            agentConversationError={agentConversation.error}
            agentConversationItems={agentConversation.items}
            agentConversationLoading={agentConversation.loading}
            agentSending={agentBusy}
            dirty={activeDirty}
            error={error}
            exportNotice={exportNotice}
            localAgentTargets={localAgentTargets}
            loading={loading}
            projectId={currentProjectId}
            runtime={markdownRuntime}
            runtimeProfiles={runtimeProfiles}
            agentProcessing={artifactAgentProcessing}
            readOnly={artifactReadOnly}
            saveState={activeDirty && markdownSaveState === "saved" ? "saving" : markdownSaveState}
            selectedRuntimeProfileId={selectedRuntimeProfileId}
            onBackHome={requestHomeRoute}
            onCancelAgentRun={cancelAgentRun}
            onDismissExportNotice={dismissExportNotice}
            onOpenExportLocation={openCurrentProjectExportsDir}
            onChange={(content, selection) => {
              updateMarkdownContent(content, selection);
              setEditorStats({ characterCount: content.length, wordCount: markdownWordCount(content), paragraphCount: markdownParagraphCount(content), elementCount: 0 });
            }}
            onPendingTableCellEditChange={setMarkdownTableCellEditPending}
            onExportMarkdown={exportCurrentMarkdown}
            onExportPdf={exportCurrentMarkdownPdf}
            pdfExportAvailable={pdfExportAvailable}
            pdfExporting={pdfExporting}
            onRedo={redoMarkdown}
            onRuntimeProfileChange={setSelectedRuntimeProfileId}
            onSelectionChange={updateMarkdownSelection}
            onSendAgentPrompt={sendAgentPrompt}
            onTableCellCommitterChange={setMarkdownTableCellCommitter}
            onUndo={undoMarkdown}
          />
        </ArtifactErrorBoundary>
      ) : currentDocumentType === "docx" && docxRuntime ? (
        <ArtifactErrorBoundary
          resetKeys={[currentProjectId, currentDocumentType, docxRuntime.revision]}
          fallback={({ error, resetErrorBoundary }) => (
            <ArtifactSurfaceErrorFallback surfaceName="Document view" error={error} resetErrorBoundary={resetErrorBoundary} onBackHome={requestHomeRoute} />
          )}
        >
          <DocxDocumentScreen
            activeSelectionText={activeSelectionText}
            agentConversationError={agentConversation.error}
            agentConversationItems={agentConversation.items}
            agentConversationLoading={agentConversation.loading}
            agentSending={agentBusy}
            dirty={activeDirty}
            error={error || docxError}
            exportNotice={exportNotice}
            localAgentTargets={localAgentTargets}
            loading={loading || docxLoading}
            projectId={currentProjectId}
            runtime={docxRuntime}
            runtimeProfiles={runtimeProfiles}
            agentProcessing={artifactAgentProcessing}
            pdfExportAvailable={pdfExportAvailable}
            pdfExporting={pdfExporting}
            selectedRuntimeProfileId={selectedRuntimeProfileId}
            onBackHome={requestHomeRoute}
            onCancelAgentRun={cancelAgentRun}
            onDismissExportNotice={dismissExportNotice}
            onExportPdf={exportCurrentDocxPdf}
            onOpenExportLocation={openCurrentProjectExportsDir}
            onRuntimeProfileChange={setSelectedRuntimeProfileId}
            onSelectionChange={updateDocxSelection}
            onSendAgentPrompt={sendAgentPrompt}
          />
        </ArtifactErrorBoundary>
      ) : !currentDocumentType ? (
        <DocumentLoadingScreen error={error} loading={loading} />
      ) : currentDocumentType === "html" && runtime ? (
        <ArtifactErrorBoundary
          resetKeys={[currentProjectId, currentDocumentType, runtime.id, runtime.revision]}
          fallback={({ error, resetErrorBoundary }) => (
            <ArtifactSurfaceErrorFallback surfaceName="Document view" error={error} resetErrorBoundary={resetErrorBoundary} onBackHome={requestHomeRoute} />
          )}
        >
          <HtmlEditorScreen
            activeSelectionText={activeSelectionText}
            dirty={activeDirty}
            error={error}
            exportNotice={exportNotice}
            loading={loading}
            agentConversationItems={agentConversation.items}
            agentConversationLoading={agentConversation.loading}
            agentConversationError={agentConversation.error}
            agentSending={agentBusy}
            localAgentTargets={localAgentTargets}
            runtimeProfiles={runtimeProfiles}
            selectedRuntimeProfileId={selectedRuntimeProfileId}
            editorStats={editorStats}
            runtime={runtime}
            saveState={saveState}
            projectId={currentProjectId}
            pdfExportAvailable={pdfExportAvailable}
            pdfExporting={pdfExporting}
            agentProcessing={artifactAgentProcessing}
            readOnly={artifactReadOnly}
            toolbarDisabled={!htmlToolbarActive || artifactReadOnly}
            toolbarState={toolbarState}
            linkDraft={linkDraft}
            linkEditorOpen={linkEditorOpen}
            onBackHome={requestHomeRoute}
            onTiptapBodyChange={syncHtmlEditorBody}
            onTiptapSelectionChange={updateHtmlEditorSelection}
            onToolbarInteractionStart={() => undefined}
            onDismissExportNotice={dismissExportNotice}
            onOpenExportLocation={openCurrentProjectExportsDir}
            onExportHtml={exportCurrentHtml}
            onExportPdf={exportCurrentHtmlPdf}
            onCloseLinkEditor={() => setLinkEditorOpen(false)}
            onCreateLink={() => {
              setLinkEditorOpen((current) => !current);
            }}
            onLinkDraftChange={setLinkDraft}
            onUploadImageFile={uploadHtmlEditorImageFile}
            onApplyLink={() => undefined}
            onBackColor={() => undefined}
            onForeColor={() => undefined}
            onLineHeight={() => undefined}
            onLetterSpacing={() => undefined}
            onLayoutChange={() => undefined}
            onRemoveLink={() => undefined}
            onAlignment={() => undefined}
            onFontFamily={() => undefined}
            onFontSize={() => undefined}
            onFormat={() => undefined}
            onHeading={() => undefined}
            onIndent={() => undefined}
            onChecklist={() => undefined}
            onList={() => undefined}
            onLoadFixture={() => void loadFixture()}
            onMoreAction={() => undefined}
            onOutdent={() => undefined}
            onPickImage={() => undefined}
            onSendAgentPrompt={sendAgentPrompt}
            onRuntimeProfileChange={setSelectedRuntimeProfileId}
            onCancelAgentRun={cancelAgentRun}
            onRedo={() => undefined}
            onUndo={() => undefined}
          />
        </ArtifactErrorBoundary>
      ) : (
        <DocumentLoadingScreen error={error} loading={loading} />
      )}
    </main>
  );
}
