import { useMemo, useRef, useState } from "react";
import { isTuttiPdfExportAvailable } from "./tuttiPdfBridge";
import { resolveDocumentActiveState } from "./documentActiveState";
import { createDocumentRuntimeLoaders } from "./documentRuntimeLoaders";
import { createDocumentExportActions } from "./useDocumentExportActions";
import { useDocumentAgentRuntime } from "./useDocumentAgentRuntime";
import { useDocumentRouteLifecycle } from "./useDocumentRouteLifecycle";
import { pushDocumentRoute, pushHomeRoute, readCurrentRoute, routePath, type AppRoute } from "./documentWorkbenchRoutes";
import { uploadHtmlEditorImageFileAsset } from "./htmlEditorUploads";
import type { DocumentProject, DocumentType, LocalAgentTargetStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import { DocxArtifactRuntimeAdapter } from "../artifact/docxArtifactAdapter";
import { HtmlArtifactRuntimeAdapter } from "../artifact/htmlArtifactAdapter";
import { MarkdownArtifactRuntimeAdapter } from "../artifact/markdownArtifactAdapter";
import { useDocxArtifactRuntime } from "../artifact/useDocxArtifactRuntime";
import { useHtmlArtifactRuntime } from "../artifact/useHtmlArtifactRuntime";
import { useMarkdownArtifactRuntime } from "../artifact/useMarkdownArtifactRuntime";
import { RuntimeApplier } from "../artifact/runtime/applier";
import type { RuntimeState, SelectionState } from "../artifact/runtime/types";
import {
  allTemplatesLabel,
  normalizeTemplates,
  templateCategoriesFor,
  templateCountsFor,
  templatesForCategory,
  type TuttiTemplate,
} from "../templates/tuttiTemplates";
import { updateProject } from "../api/projects";
import { useHomeAttachments } from "./useHomeAttachments";
import { createHomeDocumentActions } from "./useHomeDocumentActions";
import { useDocumentWorkbenchBootstrap } from "./useDocumentWorkbenchBootstrap";
import { useI18n } from "../i18n";
import {
  defaultToolbarState,
  type EditorStats,
  type HomePanel,
  type ImageAttributes,
  type LinkDraft,
  type ToolbarState,
} from "./runtimeWorkbenchTypes";

export function useRuntimeWorkbenchModel() {
  const { t } = useI18n();
  const lastSelectionRef = useRef<SelectionState | null>(null);
  const artifactReadOnlyRef = useRef(false);
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
    saveState,
    setSaveState,
    loadArtifact,
    clearArtifact,
    serialize: serializeHtmlRuntime,
    createAiEditRequest,
  } = htmlArtifact;
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
    setRuntime: setDocxRuntime,
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
  const homeBusyRef = useRef(false);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState<DocumentType>("html");
  const [tshWorkspaceApp, setTshWorkspaceApp] = useState(false);
  const [parentPath, setParentPath] = useState("/workspace");
  const [runtimeProfiles, setRuntimeProfiles] = useState<RuntimeProfile[]>([]);
  const [localAgentTargets, setLocalAgentTargets] = useState<LocalAgentTargetStatus[]>([]);
  const [officeCliStatus, setOfficeCliStatus] = useState<OfficeCliStatus | null>(null);
  const [officeCliInstalling, setOfficeCliInstalling] = useState(false);
  const [sourceExporting, setSourceExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const [exportRevealPath, setExportRevealPath] = useState("");
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
  const [markdownTableCellEditPending, setMarkdownTableCellEditPending] = useState(false);
  const [queuedHomeNavigation, setQueuedHomeNavigation] = useState(false);
  const [editorStats, setEditorStats] = useState<EditorStats>({ characterCount: 0, wordCount: 0, paragraphCount: 0, elementCount: 0 });
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
    setLocalAgentTargets,
    setOfficeCliStatus,
    setParentPath,
    setRuntimeProfiles,
    setSelectedRuntimeProfileId,
    setTemplates,
    setTshWorkspaceApp,
  });

  const { loadDocxDocument, loadHtmlDocument, loadMarkdownDocument } = createDocumentRuntimeLoaders({
    clearArtifact,
    clearDocxArtifact,
    clearMarkdownArtifact,
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
    homeBusyRef,
    loadHtmlDocument,
    outputType,
    parentPath,
    prompt,
    selectedRuntimeProfileId,
    tshWorkspaceApp,
    setError,
    setHistoryProjects,
    setHomePanel,
    setLoading,
    setOfficeCliInstalling,
    setOfficeCliStatus,
    setPrompt,
    setRoute,
    t,
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
    loadDocxDocument,
    loadHtmlDocument,
    loadMarkdownDocument,
    markdownRuntime,
    runtime,
    selectedRuntimeProfileId,
    setCurrentProject,
    setError,
    setHistoryProjects,
    setLinkEditorOpen,
  });

  const { requestHomeRoute } = useDocumentRouteLifecycle({
    activeHasUnsavedChanges,
    agentBusy,
    clearArtifact,
    clearDocxArtifact,
    clearMarkdownArtifact,
    currentDocumentType,
    currentProjectId,
    currentProjectUpdatedAt: loadedCurrentProject?.updatedAt ?? null,
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

  const syncHtmlEditorBody = (bodyInnerHTML: string, selection: SelectionState | null) => {
    // Agent / read-only sessions must not mark human dirty or trigger autosave.
    if (artifactReadOnlyRef.current) return;
    setRuntime((current) =>
      current
        ? applier.syncFromEditorBody(current, bodyInnerHTML, {
            operationType: "editHtmlBody",
            description: "Edit HTML body",
            replaceCurrentSnapshot: true,
            selection,
          })
        : current,
    );
  };

  const updateHtmlEditorSelection = (selection: SelectionState | null, nextToolbarState?: ToolbarState) => {
    lastSelectionRef.current = selection;
    if (nextToolbarState) {
      setToolbarState(nextToolbarState);
      setHtmlToolbarActive(true);
    }
    setRuntime((current) => (current ? applier.apply(current, { type: "selection-changed", selection }) : current));
  };

  const uploadHtmlEditorImageFile = async (file: File): Promise<ImageAttributes> => {
    return uploadHtmlEditorImageFileAsset({
      artifactReadOnly: artifactReadOnlyRef.current,
      currentProjectId: currentProjectId ?? "",
      file,
      onError: setError,
    });
  };

  const renameCurrentProjectTitle = async (title: string) => {
    const projectId = currentProjectId;
    if (!projectId) return;
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const previousTitle =
      currentDocumentType === "markdown"
        ? markdownRuntime?.title
        : currentDocumentType === "docx"
          ? docxRuntime?.title
          : runtime?.title;
    const applyTitle = (value: string) => {
      setCurrentProject((current) => (current ? { ...current, title: value } : current));
      setHistoryProjects((current) =>
        current.map((item) => (item.id === projectId ? { ...item, title: value } : item)),
      );
      setRuntime((current) => (current ? { ...current, title: value } : current));
      setMarkdownRuntime((current) => (current ? { ...current, title: value } : current));
      setDocxRuntime((current) => (current ? { ...current, title: value } : current));
    };
    applyTitle(nextTitle);
    try {
      const project = await updateProject(projectId, { title: nextTitle, updatedBy: "human" });
      applyTitle(project.title);
      setCurrentProject(project);
      setHistoryProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
    } catch (error) {
      if (previousTitle) applyTitle(previousTitle);
      setError(error instanceof Error ? error.message : String(error));
      throw error;
    }
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
    exportRevealPath,
    markdownRuntime,
    runtime,
    serializeHtmlRuntime,
    setError,
    setExportNotice,
    setExportRevealPath,
    setPdfExporting,
    setSourceExporting,
    t,
    tshWorkspaceApp,
  });

  return {
    activeDirty,
    activeSelectionText,
    agentBusy,
    agentConversation,
    artifactInteraction,
    artifactReadOnly,
    cancelAgentRun,
    clearHistory,
    currentDocumentType,
    currentProject,
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
    exportRevealPath,
    dismissExportNotice: () => {
      setExportNotice("");
      setExportRevealPath("");
    },
    openCurrentProjectExportsDir,
    filteredTemplates,
    historyProjects,
    homeAttachments,
    homePanel,
    htmlToolbarActive,
    linkDraft,
    linkEditorOpen,
    loadBlankDocument,
    loadFixture,
    importDocumentFile,
    loadPromptDocument,
    loadTemplate,
    loading,
    localAgentTargets,
    markdownRuntime,
    markdownSaveState,
    officeCliInstalling,
    officeCliStatus,
    openHistoryProject,
    outputType,
    parentPath,
    pdfExportAvailable: isTuttiPdfExportAvailable(),
    pdfExporting,
    prompt,
    tshWorkspaceApp,
    redoMarkdown,
    renameCurrentProjectTitle,
    requestHomeRoute,
    runtime,
    runtimeProfiles,
    saveState,
    selectedRuntimeProfileId,
    selectedTemplateCategory,
    sendAgentPrompt,
    syncHtmlEditorBody,
    uploadHtmlEditorImageFile,
    sourceExporting,
    exportCurrentDocxPdf,
    exportCurrentHtml,
    exportCurrentHtmlPdf,
    exportCurrentMarkdown,
    exportCurrentMarkdownPdf,
    setEditorStats,
    setHomePanel,
    setLinkDraft,
    setLinkEditorOpen,
    setOutputType,
    setParentPath,
    setPrompt,
    setRoute,
    setSelectedRuntimeProfileId,
    setSelectedTemplateCategory,
    templateCategories,
    templateCounts,
    toolbarState,
    updateHtmlEditorSelection,
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
