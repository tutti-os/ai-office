import { HomePage } from "./HomePage";
import { ArtifactErrorBoundary, ArtifactSurfaceErrorFallback } from "@ai-app/ui/error-boundary";
import { DocxDocumentScreen, MarkdownDocumentScreen } from "./DocumentFormatScreens";
import { DocumentLoadingScreen, HtmlEditorScreen } from "./HtmlEditorScreen";
import { markdownParagraphCount, markdownWordCount } from "./documentWorkbenchContent";
import { indentBlock, outdentBlock, setElementStyle, toggleChecklist } from "../artifact/runtime/operations";
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
    applyAlignment,
    applyBackColor,
    applyFontFamily,
    applyFontSize,
    applyForeColor,
    applyFormat,
    applyHeading,
    applyLink,
    applyList,
    applyOperationPanel,
    applyRemoveLink,
    applyToolbarMoreAction,
    attributeDraft,
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
    frameRevision,
    frameSrcDoc,
    handleFrameLoad,
    handleImageFileInputChange,
    historyProjects,
    homeAttachments,
    homePanel,
    htmlEditorController,
    htmlToolbarActive,
    iframeRef,
    imageFileInputRef,
    importDocumentFile,
    imageDraft,
    linkDraft,
    linkEditorOpen,
    loadBlankDocument,
    loadFixture,
    loadPromptDocument,
    loadTemplate,
    loading,
    localAgentProviders,
    markdownRuntime,
    markdownSaveState,
    officeCliInstalling,
    officeCliStatus,
    openCurrentProjectExportsDir,
    openHistoryProject,
    openLinkEditor,
    operationDraft,
    operationIsHtml,
    operationPanelMode,
    operationPosition,
    operationWrapperTag,
    outputType,
    pdfExportAvailable,
    pdfExporting,
    prompt,
    redoMarkdown,
    requestHomeRoute,
    requestImageFileSelection,
    resetFrameFromRuntime,
    runtime,
    runtimeProfiles,
    saveState,
    selectedRuntimeProfileId,
    selectedTemplateCategory,
    sendAgentPrompt,
    exportCurrentDocxPdf,
    exportCurrentHtml,
    exportCurrentHtmlPdf,
    exportCurrentMarkdown,
    exportCurrentMarkdownPdf,
    setAttributeDraft,
    setEditorStats,
    setHomePanel,
    setImageDraft,
    setLinkDraft,
    setLinkEditorOpen,
    setMarkdownTableCellCommitter,
    setMarkdownTableCellEditPending,
    setOperationDraft,
    setOperationIsHtml,
    setOperationPanelMode,
    setOperationPosition,
    setOperationWrapperTag,
    setOutputType,
    setPrompt,
    setSelectedRuntimeProfileId,
    setSelectedTemplateCategory,
    setStyleDraft,
    setTableDraft,
    styleDraft,
    tableDraft,
    templateCategories,
    templateCounts,
    toolbarState,
    undoMarkdown,
    updateDocxSelection,
    updateMarkdownContent,
    updateMarkdownSelection,
  } = props.model;
  const artifactAgentProcessing = isArtifactAgentRunning(artifactInteraction);
  return (
    <main className="h-dvh min-h-0 overflow-hidden bg-[#E6DDCD] font-sans text-[#2A2620]">
      <input
        ref={imageFileInputRef}
        className="hidden"
        type="file"
        accept="image/*"
        onChange={(event) => void handleImageFileInputChange(event)}
      />
      {!editorOpen ? (
        <HomePage
          attachments={homeAttachments.attachments}
          categories={templateCategories}
          activePanel={homePanel}
          historyProjects={historyProjects}
          localAgentProviders={localAgentProviders}
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
            localAgentProviders={localAgentProviders}
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
            localAgentProviders={localAgentProviders}
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
          resetKeys={[currentProjectId, currentDocumentType, runtime.revision, frameRevision]}
          fallback={({ error, resetErrorBoundary }) => (
            <ArtifactSurfaceErrorFallback surfaceName="Document view" error={error} resetErrorBoundary={resetErrorBoundary} onBackHome={requestHomeRoute} />
          )}
        >
          <HtmlEditorScreen
            activeSelectionText={activeSelectionText}
            dirty={activeDirty}
            error={error}
            exportNotice={exportNotice}
            frameRevision={frameRevision}
            frameSrcDoc={frameSrcDoc}
            iframeRef={iframeRef}
            loading={loading}
            agentConversationItems={agentConversation.items}
            agentConversationLoading={agentConversation.loading}
            agentConversationError={agentConversation.error}
            agentSending={agentBusy}
            localAgentProviders={localAgentProviders}
            runtimeProfiles={runtimeProfiles}
            selectedRuntimeProfileId={selectedRuntimeProfileId}
            editorStats={editorStats}
            runtime={runtime}
            saveState={saveState}
            pdfExportAvailable={pdfExportAvailable}
            pdfExporting={pdfExporting}
            agentProcessing={artifactAgentProcessing}
            readOnly={artifactReadOnly}
            toolbarDisabled={!htmlToolbarActive || artifactReadOnly}
            toolbarState={toolbarState}
            linkDraft={linkDraft}
            linkEditorOpen={linkEditorOpen}
            operationDraft={operationDraft}
            operationIsHtml={operationIsHtml}
            operationPanelMode={operationPanelMode}
            operationPosition={operationPosition}
            operationWrapperTag={operationWrapperTag}
            attributeDraft={attributeDraft}
            imageDraft={imageDraft}
            tableDraft={tableDraft}
            styleDraft={styleDraft}
            onBackHome={requestHomeRoute}
            onDismissExportNotice={dismissExportNotice}
            onOpenExportLocation={openCurrentProjectExportsDir}
            onExportHtml={exportCurrentHtml}
            onExportPdf={exportCurrentHtmlPdf}
            onApplyLink={applyLink}
            onCloseLinkEditor={() => setLinkEditorOpen(false)}
            onCreateLink={openLinkEditor}
            onLinkDraftChange={setLinkDraft}
            onApplyOperation={applyOperationPanel}
            onAttributeDraftChange={setAttributeDraft}
            onCloseOperation={() => setOperationPanelMode(null)}
            onOperationDraftChange={setOperationDraft}
            onOperationHtmlChange={setOperationIsHtml}
            onImageDraftChange={setImageDraft}
            onPickImage={requestImageFileSelection}
            onTableDraftChange={setTableDraft}
            onStyleDraftChange={setStyleDraft}
            onBackColor={applyBackColor}
            onForeColor={applyForeColor}
            onLineHeight={(lineHeight) => htmlEditorController.executeOperation(runtime, {
              operationType: "setLineHeight",
              description: `Set line height ${lineHeight || "normal"}`,
              refocus: false,
              mutate: (doc, target) => setElementStyle(doc, target, { lineHeight }),
            })}
            onLetterSpacing={(letterSpacing) => htmlEditorController.executeOperation(runtime, {
              operationType: "setLetterSpacing",
              description: `Set letter spacing ${letterSpacing || "normal"}`,
              refocus: false,
              mutate: (doc, target) => setElementStyle(doc, target, { letterSpacing }),
            })}
            onLayoutChange={(attributes) => htmlEditorController.executeOperation(runtime, {
              operationType: "setLayout",
              description: "Set layout",
              refocus: false,
              mutate: (doc, target) => setElementStyle(doc, target, attributes),
            })}
            onOperationPositionChange={setOperationPosition}
            onOperationWrapperTagChange={setOperationWrapperTag}
            onRemoveLink={applyRemoveLink}
            onAlignment={applyAlignment}
            onFontFamily={applyFontFamily}
            onFontSize={applyFontSize}
            onFormat={applyFormat}
            onHeading={applyHeading}
            onIndent={() => htmlEditorController.executeOperation(runtime, {
              operationType: "indent",
              description: "Indent block",
              mutate: (doc, target) => indentBlock(doc, target),
            })}
            onChecklist={() => htmlEditorController.executeOperation(runtime, {
              operationType: "toggleChecklist",
              description: "Toggle checklist",
              mutate: (doc, target) => toggleChecklist(doc, target),
            })}
            onList={applyList}
            onLoadFixture={() => void loadFixture()}
            onMoreAction={applyToolbarMoreAction}
            onMutation={(operationType, description) => htmlEditorController.syncMutation(operationType, description)}
            onOutdent={() => htmlEditorController.executeOperation(runtime, {
              operationType: "outdent",
              description: "Outdent block",
              mutate: (doc, target) => outdentBlock(doc, target),
            })}
            onSendAgentPrompt={sendAgentPrompt}
            onRuntimeProfileChange={setSelectedRuntimeProfileId}
            onCancelAgentRun={cancelAgentRun}
            onRedo={() => htmlEditorController.applyHistoryOffset(runtime, 1)}
            onResetFrame={resetFrameFromRuntime}
            onSelection={() => htmlEditorController.syncSelection()}
            onToolbarInteractionStart={() => htmlEditorController.preserveSelection(runtime)}
            onUndo={() => htmlEditorController.applyHistoryOffset(runtime, -1)}
            onFrameLoad={handleFrameLoad}
          />
        </ArtifactErrorBoundary>
      ) : (
        <DocumentLoadingScreen error={error} loading={loading} />
      )}
    </main>
  );
}
