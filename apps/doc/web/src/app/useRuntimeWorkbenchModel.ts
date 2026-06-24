import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { HomePage } from "./HomePage";
import { DocxDocumentScreen, MarkdownDocumentScreen } from "./DocumentFormatScreens";
import { HtmlEditorController } from "./HtmlEditorController";
import { DocumentLoadingScreen, HtmlEditorScreen } from "./HtmlEditorScreen";
import { isTuttiPdfExportAvailable } from "./tuttiPdfBridge";
import { resolveDocumentActiveState } from "./documentActiveState";
import { createDocumentRuntimeLoaders } from "./documentRuntimeLoaders";
import { createDocumentExportActions } from "./useDocumentExportActions";
import { useDocumentAgentRuntime } from "./useDocumentAgentRuntime";
import { useDocumentRouteLifecycle } from "./useDocumentRouteLifecycle";
import { pushDocumentRoute, pushHomeRoute, readCurrentRoute, routePath, type AppRoute } from "./documentWorkbenchRoutes";
import { renderImageSelectionOverlay } from "./htmlImageSelectionOverlay";
import { uploadProjectAsset } from "../api/projects";
import type { DocumentProject, DocumentType, LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import { DocxArtifactRuntimeAdapter } from "../artifact/docxArtifactAdapter";
import { HtmlArtifactRuntimeAdapter } from "../artifact/htmlArtifactAdapter";
import { MarkdownArtifactRuntimeAdapter } from "../artifact/markdownArtifactAdapter";
import { useDocxArtifactRuntime } from "../artifact/useDocxArtifactRuntime";
import { useHtmlArtifactRuntime } from "../artifact/useHtmlArtifactRuntime";
import { useMarkdownArtifactRuntime } from "../artifact/useMarkdownArtifactRuntime";
import { RuntimeApplier } from "../artifact/runtime/applier";
import { runtimeDocumentFromFrame } from "../artifact/runtime/document";
import { htmlProjectAssetRuntimeUrl } from "../artifact/runtime/projectAssets";
import {
  type AdjacentInsertPosition,
  type ElementStyleAttributes,
  type ImageAttributes,
} from "../artifact/runtime/operations";
import { captureSelectionState } from "../artifact/runtime/selection";
import type { RuntimeState, SelectionState } from "../artifact/runtime/types";
import {
  allTemplatesLabel,
  normalizeTemplates,
  templateCategoriesFor,
  templateCountsFor,
  templatesForCategory,
  type TuttiTemplate,
} from "../templates/tuttiTemplates";
import { useHomeAttachments } from "./useHomeAttachments";
import { createHomeDocumentActions } from "./useHomeDocumentActions";
import { createHtmlEditorActions } from "./useHtmlEditorActions";
import { useHtmlFrameLifecycle } from "./useHtmlFrameLifecycle";
import { useDocumentWorkbenchBootstrap } from "./useDocumentWorkbenchBootstrap";
import {
  defaultToolbarState,
  operationPanelTitle,
  type AttributeDraft,
  type EditorStats,
  type HomePanel,
  type ImageObjectElement,
  type LinkDraft,
  type OperationPanelMode,
  type ResizeHandle,
  type ToolbarState,
} from "./runtimeWorkbenchTypes";

export function useRuntimeWorkbenchModel() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const runtimeRef = useRef<RuntimeState | null>(null);
  const lastEditorTargetRef = useRef<Node | null>(null);
  const lastResolvedTargetRef = useRef<Element | null>(null);
  const lastSelectionRef = useRef<SelectionState | null>(null);
  const activeImageRef = useRef<ImageObjectElement | null>(null);
  const pendingImageTargetRef = useRef<ImageObjectElement | null>(null);
  const artifactReadOnlyRef = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedFrameDocsRef = useRef<WeakSet<Document>>(new WeakSet());
  const toolbarSelectionPreserveTimestampRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlSaveGenerationRef = useRef(0);
  const markdownSaveGenerationRef = useRef(0);
  const routeRef = useRef<AppRoute>(readCurrentRoute());
  const hasUnsavedChangesRef = useRef(false);
  const markdownTableCellCommitterRef = useRef<(() => boolean) | null>(null);
  const applier = useMemo(() => new RuntimeApplier(), []);
  const htmlArtifactAdapter = useMemo(() => new HtmlArtifactRuntimeAdapter(applier), [applier]);
  const markdownArtifactAdapter = useMemo(() => new MarkdownArtifactRuntimeAdapter(), []);
  const docxArtifactAdapter = useMemo(() => new DocxArtifactRuntimeAdapter(), []);
  const htmlArtifact = useHtmlArtifactRuntime(htmlArtifactAdapter);
  const markdownArtifact = useMarkdownArtifactRuntime(markdownArtifactAdapter);
  const docxArtifact = useDocxArtifactRuntime(docxArtifactAdapter);
  const {
    runtime,
    setRuntime,
    frameSrcDoc,
    frameRevision,
    saveState,
    setSaveState,
    loadArtifact,
    clearArtifact,
    resetFrameFromRuntime: resetHtmlFrameFromRuntime,
    serialize: serializeHtmlRuntime,
    createAiEditRequest,
  } = htmlArtifact;
  runtimeRef.current = runtime;
  const {
    runtime: markdownRuntime,
    setRuntime: setMarkdownRuntime,
    saveState: markdownSaveState,
    setSaveState: setMarkdownSaveState,
    loadArtifact: loadMarkdownArtifact,
    clearArtifact: clearMarkdownArtifact,
    updateContent: updateMarkdownContent,
    updateSelection: updateMarkdownSelection,
    undo: undoMarkdown,
    redo: redoMarkdown,
    serialize: serializeMarkdownRuntime,
    createAiEditRequest: createMarkdownAiEditRequest,
  } = markdownArtifact;
  const {
    runtime: docxRuntime,
    saveState: docxSaveState,
    loadArtifact: loadDocxArtifact,
    clearArtifact: clearDocxArtifact,
    updateSelection: updateDocxSelection,
    createAiEditRequest: createDocxAiEditRequest,
    loading: docxLoading,
    error: docxError,
  } = docxArtifact;
  const [route, setRoute] = useState<AppRoute>(() => readCurrentRoute());
  const [currentProject, setCurrentProject] = useState<DocumentProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState<DocumentType>("html");
  const [runtimeProfiles, setRuntimeProfiles] = useState<RuntimeProfile[]>([]);
  const [localAgentProviders, setLocalAgentProviders] = useState<LocalAgentProviderStatus[]>([]);
  const [officeCliStatus, setOfficeCliStatus] = useState<OfficeCliStatus | null>(null);
  const [officeCliInstalling, setOfficeCliInstalling] = useState(false);
  const [sourceExporting, setSourceExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const [selectedRuntimeProfileId, setSelectedRuntimeProfileId] = useState("");
  const homeAttachments = useHomeAttachments();
  const [homePanel, setHomePanel] = useState<HomePanel>("templates");
  const [historyProjects, setHistoryProjects] = useState<DocumentProject[]>([]);
  const [templates, setTemplates] = useState<TuttiTemplate[]>([]);
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState(allTemplatesLabel);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(defaultToolbarState);
  const [htmlToolbarActive, setHtmlToolbarActive] = useState(false);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<LinkDraft>({ text: "", href: "https://" });
  const [operationPanelMode, setOperationPanelMode] = useState<OperationPanelMode>(null);
  const [operationDraft, setOperationDraft] = useState("");
  const [operationPosition, setOperationPosition] = useState<AdjacentInsertPosition>("afterend");
  const [operationIsHtml, setOperationIsHtml] = useState(false);
  const [operationWrapperTag, setOperationWrapperTag] = useState("span");
  const [attributeDraft, setAttributeDraft] = useState<AttributeDraft>({ id: "", className: "", title: "", custom: "" });
  const [imageDraft, setImageDraft] = useState<ImageAttributes>({ src: "", alt: "", width: "", height: "" });
  const [tableDraft, setTableDraft] = useState({ rows: "3", columns: "3" });
  const [markdownTableCellEditPending, setMarkdownTableCellEditPending] = useState(false);
  const [queuedHomeNavigation, setQueuedHomeNavigation] = useState(false);
  const [styleDraft, setStyleDraft] = useState<ElementStyleAttributes>({
    width: "",
    height: "",
    lineHeight: "",
    letterSpacing: "",
    verticalAlign: "",
    borderWidth: "",
    borderStyle: "",
    borderColor: "#d0d5dd",
    borderRadius: "",
    padding: "",
    paddingTop: "",
    paddingRight: "",
    paddingBottom: "",
    paddingLeft: "",
    marginTop: "",
    marginRight: "",
    marginBottom: "",
    marginLeft: "",
  });
  const [editorStats, setEditorStats] = useState<EditorStats>({ characterCount: 0, wordCount: 0, paragraphCount: 0, elementCount: 0 });
  const htmlEditorController = useMemo(
    () =>
      new HtmlEditorController({
        applier,
        iframeRef,
        lastEditorTargetRef,
        lastResolvedTargetRef,
        lastSelectionRef,
        toolbarSelectionPreserveTimestampRef,
        isReadOnly: () => artifactReadOnlyRef.current,
        setEditorStats,
        setRuntime,
        setToolbarState,
      }),
    [applier, setRuntime],
  );
  const editorOpen = route.name === "document";
  const currentProjectId = route.name === "document" ? route.projectId : null;
  const loadedCurrentProject = currentProjectId && currentProject?.id === currentProjectId ? currentProject : null;
  const currentDocumentType: DocumentType | null = loadedCurrentProject?.type ?? null;
  const { activeDirty, activeHasUnsavedChanges, activeSelectionText, markdownHasUnsavedChanges } = resolveDocumentActiveState({
    currentDocumentType,
    docxRuntime,
    docxSaveState,
    markdownRuntime,
    markdownSaveState,
    markdownTableCellEditPending,
    runtime,
    saveState,
  });

  const templateCategories = useMemo(() => templateCategoriesFor(templates), [templates]);
  const templateCounts = useMemo(() => templateCountsFor(templates), [templates]);
  const filteredTemplates = useMemo(
    () => templatesForCategory(templates, selectedTemplateCategory),
    [selectedTemplateCategory, templates],
  );

  useDocumentWorkbenchBootstrap({
    setError,
    setLocalAgentProviders,
    setOfficeCliStatus,
    setRuntimeProfiles,
    setSelectedRuntimeProfileId,
    setTemplates,
  });

  const { loadDocxDocument, loadHtmlDocument, loadMarkdownDocument } = createDocumentRuntimeLoaders({
    activeImageRef,
    clearArtifact,
    clearDocxArtifact,
    clearMarkdownArtifact,
    lastEditorTargetRef,
    lastResolvedTargetRef,
    lastSelectionRef,
    loadArtifact,
    loadDocxArtifact,
    loadMarkdownArtifact,
    markdownTableCellCommitterRef,
    setEditorStats,
    setHtmlToolbarActive,
    setMarkdownTableCellEditPending,
    setQueuedHomeNavigation,
    setToolbarState,
  });

  const {
    clearHistory,
    deleteHistoryProject,
    downloadOfficeCli,
    importDocumentFile,
    loadBlankDocument,
    loadFixture,
    loadPromptDocument,
    loadTemplate,
    openHistoryProject,
    refreshProjectHistory,
  } = createHomeDocumentActions({
    homeAttachments,
    loadHtmlDocument,
    outputType,
    prompt,
    selectedRuntimeProfileId,
    setError,
    setHistoryProjects,
    setHomePanel,
    setLoading,
    setOfficeCliInstalling,
    setOfficeCliStatus,
    setPrompt,
    setRoute,
  });

  const { requestHomeRoute } = useDocumentRouteLifecycle({
    activeHasUnsavedChanges,
    clearArtifact,
    clearDocxArtifact,
    clearMarkdownArtifact,
    currentDocumentType,
    currentProjectId,
    hasUnsavedChangesRef,
    htmlSaveGenerationRef,
    loadDocxDocument,
    loadHtmlDocument,
    loadMarkdownDocument,
    loading,
    markdownHasUnsavedChanges,
    markdownRuntime,
    markdownSaveGenerationRef,
    markdownSaveState,
    markdownTableCellCommitterRef,
    markdownTableCellEditPending,
    queuedHomeNavigation,
    refreshProjectHistory,
    route,
    routeRef,
    runtime,
    saveTimerRef,
    serializeHtmlRuntime,
    serializeMarkdownRuntime,
    setCurrentProject,
    setError,
    setHtmlToolbarActive,
    setLoading,
    setMarkdownRuntime,
    setMarkdownSaveState,
    setQueuedHomeNavigation,
    setRoute,
    setRuntime,
    setSaveState,
    setToolbarState,
  });

  const {
    agentBusy,
    agentConversation,
    artifactInteraction,
    artifactReadOnly,
    cancelAgentRun,
    sendAgentPrompt,
  } = useDocumentAgentRuntime({
    artifactReadOnlyRef,
    createAiEditRequest,
    createDocxAiEditRequest,
    createMarkdownAiEditRequest,
    currentDocumentType,
    currentProject,
    currentProjectId,
    docxRuntime,
    iframeRef,
    loadDocxDocument,
    loadHtmlDocument,
    loadMarkdownDocument,
    markdownRuntime,
    pendingImageTargetRef,
    runtime,
    selectedRuntimeProfileId,
    setCurrentProject,
    setError,
    setHistoryProjects,
    setLinkEditorOpen,
    setOperationPanelMode,
  });

  const {
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
    clearImageObjectSelection,
    handleImageFileInputChange,
    openLinkEditor,
    requestImageFileSelection,
    selectImageObject,
  } = createHtmlEditorActions({
    activeImageRef,
    artifactReadOnlyRef,
    attributeDraft,
    currentProjectId,
    htmlEditorController,
    iframeRef,
    imageDraft,
    imageFileInputRef,
    lastEditorTargetRef,
    lastResolvedTargetRef,
    lastSelectionRef,
    operationDraft,
    operationIsHtml,
    operationPanelMode,
    operationPosition,
    operationWrapperTag,
    pendingImageTargetRef,
    runtime,
    setAttributeDraft,
    setError,
    setImageDraft,
    setLinkDraft,
    setLinkEditorOpen,
    setOperationDraft,
    setOperationIsHtml,
    setOperationPanelMode,
    setOperationPosition,
    setStyleDraft,
    setTableDraft,
    styleDraft,
    tableDraft,
    toolbarState,
  });

  const { handleFrameLoad } = useHtmlFrameLifecycle({
    applier,
    artifactInteraction,
    artifactReadOnlyRef,
    clearImageObjectSelection,
    currentDocumentType,
    editorOpen,
    frameRevision,
    frameSrcDoc,
    htmlEditorController,
    iframeRef,
    initializedFrameDocsRef,
    lastEditorTargetRef,
    runtimeRef,
    selectImageObject,
    setEditorStats,
    setHtmlToolbarActive,
    setRuntime,
  });

  const resetFrameFromRuntime = () => {
    if (!runtime) return;
    setToolbarState(defaultToolbarState);
    resetHtmlFrameFromRuntime();
  };

  const exportInProgress = sourceExporting || pdfExporting;

  const {
    exportCurrentDocxPdf,
    exportCurrentHtml,
    exportCurrentHtmlPdf,
    exportCurrentMarkdown,
    exportCurrentMarkdownPdf,
    openCurrentProjectExportsDir,
  } = createDocumentExportActions({
    currentProject,
    currentProjectId,
    docxRuntime,
    exportInProgress,
    markdownRuntime,
    runtime,
    serializeHtmlRuntime,
    setError,
    setExportNotice,
    setPdfExporting,
    setSourceExporting,
  });

  return {
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
    dismissExportNotice: () => setExportNotice(""),
    openCurrentProjectExportsDir,
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
    imageDraft,
    linkDraft,
    linkEditorOpen,
    loadBlankDocument,
    loadFixture,
    importDocumentFile,
    loadPromptDocument,
    loadTemplate,
    loading,
    localAgentProviders,
    markdownRuntime,
    markdownSaveState,
    officeCliInstalling,
    officeCliStatus,
    openHistoryProject,
    openLinkEditor,
    operationDraft,
    operationIsHtml,
    operationPanelMode,
    operationPosition,
    operationWrapperTag,
    outputType,
    pdfExportAvailable: isTuttiPdfExportAvailable(),
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
    sourceExporting,
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
    setOperationDraft,
    setOperationIsHtml,
    setOperationPanelMode,
    setOperationPosition,
    setOperationWrapperTag,
    setOutputType,
    setPrompt,
    setRoute,
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
    setMarkdownTableCellEditPending,
    setMarkdownTableCellCommitter: (committer: (() => boolean) | null) => {
      markdownTableCellCommitterRef.current = committer;
    },
  };
}
