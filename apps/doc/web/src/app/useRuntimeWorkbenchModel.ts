import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { HomePage } from "./HomePage";
import { DocxDocumentScreen, MarkdownDocumentScreen } from "./DocumentFormatScreens";
import { HtmlEditorController } from "./HtmlEditorController";
import { DocumentLoadingScreen, HtmlEditorScreen } from "./HtmlEditorScreen";
import {
  createInitialPromptAiEditRequest,
  initialContentForType,
  markdownParagraphCount,
  markdownTemplateSeed,
  markdownWordCount,
} from "./documentWorkbenchContent";
import { pushDocumentRoute, pushHomeRoute, readCurrentRoute, routePath, type AppRoute } from "./documentWorkbenchRoutes";
import {
  currentSelectionElement,
  frameEventTarget,
  imageAltFromFileName,
  imageFromNode,
  isContentBoundOperation,
  isFallbackOnlySelection,
  isOperationPanelMode,
  isPositionBoundOperation,
  isTableEditAction,
  parseCustomAttributes,
  positionImageSelectionOverlay,
  readCurrentAttributes,
  readCurrentImageAttributes,
  readCurrentLinkHref,
  readCurrentLinkText,
  readCurrentStyles,
  readFileAsDataUrl,
  readToolbarState,
  removeImageSelectionOverlay,
  removeSelectedImageObject,
  resolveEditorTarget,
  resizedImageSizeForHandle,
  selectElementInDocument,
  tableActionTitle,
  upsertSelectedImageObject,
} from "./htmlRuntimeDom";
import { renderImageSelectionOverlay } from "./htmlImageSelectionOverlay";
import { useAgentConversation } from "./useAgentConversation";
import { cancelRun, clearProjectHistory, createProject, getProject, listProjects, startAiEdit, updateProject } from "../api/projects";
import { fetchGensparkStudyPlanFixture } from "../api/fixtures";
import { fetchBootstrapSnapshot, fetchLocalAgentProviders, fetchOfficeCliStatus, fetchTemplates, installOfficeCli } from "../api/runtime";
import type { DocumentProject, DocumentType, LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import { editableArtifactInteraction, isArtifactReadOnly, type ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import { DocxArtifactRuntimeAdapter } from "../artifact/docxArtifactAdapter";
import { HtmlArtifactRuntimeAdapter } from "../artifact/htmlArtifactAdapter";
import { MarkdownArtifactRuntimeAdapter } from "../artifact/markdownArtifactAdapter";
import { useDocxArtifactRuntime } from "../artifact/useDocxArtifactRuntime";
import { useHtmlArtifactRuntime } from "../artifact/useHtmlArtifactRuntime";
import { useMarkdownArtifactRuntime } from "../artifact/useMarkdownArtifactRuntime";
import { RuntimeApplier } from "../artifact/runtime/applier";
import { runtimeDocumentFromFrame } from "../artifact/runtime/document";
import { enableEditableFrame, setEditableFrameInteraction } from "../artifact/runtime/frame";
import {
  applyInlineFormat,
  appendToElement,
  canEditElementContent,
  canMutateElement,
  canSetElementAttributes,
  clearTableCellSelection,
  cleanupAbandonedTypingStyleMarkers,
  cleanupTypingStyleMarkers,
  createLink,
  deleteSelectedElement,
  duplicateElement,
  editTable,
  getCurrentLinkHref,
  getCurrentLinkText,
  getCurrentImageAttributes,
  getEditorStats,
  getSelectedTableCells,
  getSelectedTableCellTarget,
  getTableActionAvailability,
  getTableHeaderState,
  indentBlock,
  insertAtPosition,
  insertHtml,
  insertTable,
  insertText,
  moveCursorToEnd,
  moveCursorToStart,
  moveSelectionCursorToEnd,
  moveSelectionCursorToStart,
  normalizeLinkUrl,
  outdentBlock,
  replaceSelection,
  removeImage,
  removeLink,
  selectionContainsLink,
  setAlignment,
  setBackColor,
  setElementAttributes,
  setElementStyle,
  setForeColor,
  setFontFamily,
  setFontSize,
  setHeading,
  tableEditActions,
  toggleChecklist,
  toggleList,
  upsertImage,
  wrapSelection,
  type AdjacentInsertPosition,
  type Alignment,
  type ElementStyleAttributes,
  type HeadingTag,
  type ImageAttributes,
  type InlineFormatTag,
  type ListKind,
} from "../artifact/runtime/operations";
import { captureSelectionState } from "../artifact/runtime/selection";
import type { RuntimeState, SelectionState } from "../artifact/runtime/types";
import {
  allTemplatesLabel,
  normalizeTemplates,
  templateCategoriesFor,
  templateCountsFor,
  templatesForCategory,
  type GensparkTemplate,
} from "../templates/gensparkTemplates";
import { useHomeAttachments } from "./useHomeAttachments";
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
  const [agentSending, setAgentSending] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState<DocumentType>("html");
  const [runtimeProfiles, setRuntimeProfiles] = useState<RuntimeProfile[]>([]);
  const [localAgentProviders, setLocalAgentProviders] = useState<LocalAgentProviderStatus[]>([]);
  const [officeCliStatus, setOfficeCliStatus] = useState<OfficeCliStatus | null>(null);
  const [officeCliInstalling, setOfficeCliInstalling] = useState(false);
  const [selectedRuntimeProfileId, setSelectedRuntimeProfileId] = useState("");
  const homeAttachments = useHomeAttachments();
  const [homePanel, setHomePanel] = useState<HomePanel>("templates");
  const [historyProjects, setHistoryProjects] = useState<DocumentProject[]>([]);
  const [templates, setTemplates] = useState<GensparkTemplate[]>([]);
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
  const htmlHasUnsavedChanges = Boolean(runtime?.dirty) || saveState === "saving" || saveState === "error";
  const markdownHasUnsavedChanges = markdownTableCellEditPending || Boolean(markdownRuntime?.dirty) || markdownSaveState === "saving" || markdownSaveState === "error";
  const docxHasUnsavedChanges = docxSaveState === "saving" || docxSaveState === "error";
  const activeHasUnsavedChanges =
    currentDocumentType === "markdown"
      ? markdownHasUnsavedChanges
      : currentDocumentType === "docx"
        ? docxHasUnsavedChanges
        : currentDocumentType === "html"
          ? htmlHasUnsavedChanges
          : false;
  const activeDirty =
    currentDocumentType === "markdown"
      ? markdownHasUnsavedChanges
      : currentDocumentType === "docx"
        ? docxHasUnsavedChanges
        : currentDocumentType === "html"
          ? htmlHasUnsavedChanges
          : false;
  const activeSelectionText =
    currentDocumentType === "markdown"
      ? markdownRuntime?.selection.selectedText ?? ""
      : currentDocumentType === "docx"
        ? docxRuntime?.selection.selectedText ?? ""
        : currentDocumentType === "html"
          ? runtime?.activeSelection?.selectedText ?? ""
          : "";

  const templateCategories = useMemo(() => templateCategoriesFor(templates), [templates]);
  const templateCounts = useMemo(() => templateCountsFor(templates), [templates]);
  const filteredTemplates = useMemo(
    () => templatesForCategory(templates, selectedTemplateCategory),
    [selectedTemplateCategory, templates],
  );

  useEffect(() => {
    let cancelled = false;
    const officeCliFallback: OfficeCliStatus = {
      available: false,
      source: "missing",
      canInstall: true,
      installing: false,
      reason: "Unable to check OfficeCLI status.",
    };
    void Promise.all([
      fetchBootstrapSnapshot(),
      fetchLocalAgentProviders(),
      fetchTemplates(),
      fetchOfficeCliStatus().catch((error) => ({
        officecli: {
          ...officeCliFallback,
          reason: error instanceof Error ? error.message : String(error),
        },
      })),
    ])
      .then(([snapshot, providerStatus, libraryTemplates, officeCli]) => {
        if (cancelled) return;
        const enabledProfiles = snapshot.runtimeProfiles.filter((profile) => profile.enabled && profile.kind === "local-agent");
        setRuntimeProfiles(enabledProfiles);
        setLocalAgentProviders(providerStatus.providers);
        setTemplates(normalizeTemplates(libraryTemplates));
        setOfficeCliStatus(officeCli.officecli);
        setSelectedRuntimeProfileId((current) => {
          if (enabledProfiles.some((profile) => profile.id === current)) return current;
          return enabledProfiles.find((profile) => profile.kind === "local-agent")?.id ?? enabledProfiles[0]?.id ?? "";
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const downloadOfficeCli = async () => {
    setError("");
    setOfficeCliInstalling(true);
    try {
      const response = await installOfficeCli();
      setOfficeCliStatus(response.officecli);
      if (!response.officecli.available) setError(response.officecli.reason ?? "Unable to install OfficeCLI");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      try {
        const response = await fetchOfficeCliStatus();
        setOfficeCliStatus(response.officecli);
      } catch {
        // Keep the original install error visible.
      }
    } finally {
      setOfficeCliInstalling(false);
    }
  };

  const loadHtmlDocument = (html: string, input: { title: string; source?: RuntimeState["source"] }) => {
    loadArtifact({ content: html, title: input.title, source: input.source });
    clearMarkdownArtifact();
    clearDocxArtifact();
    setMarkdownTableCellEditPending(false);
    markdownTableCellCommitterRef.current = null;
    setQueuedHomeNavigation(false);
    setToolbarState(defaultToolbarState);
    setHtmlToolbarActive(false);
    lastEditorTargetRef.current = null;
    lastResolvedTargetRef.current = null;
    lastSelectionRef.current = null;
    activeImageRef.current = null;
    setEditorStats({ characterCount: 0, wordCount: 0, paragraphCount: 0, elementCount: 0 });
  };

  const loadMarkdownDocument = (content: string, input: { title: string; source?: RuntimeState["source"] }) => {
    loadMarkdownArtifact({ content, title: input.title, source: input.source });
    clearArtifact();
    clearDocxArtifact();
    setMarkdownTableCellEditPending(false);
    setQueuedHomeNavigation(false);
    setToolbarState(defaultToolbarState);
    setHtmlToolbarActive(false);
    lastEditorTargetRef.current = null;
    lastResolvedTargetRef.current = null;
    lastSelectionRef.current = null;
    activeImageRef.current = null;
    setEditorStats({ characterCount: content.length, wordCount: markdownWordCount(content), paragraphCount: 0, elementCount: 0 });
  };

  const loadDocxDocument = async (project: DocumentProject) => {
    clearArtifact();
    clearMarkdownArtifact();
    setMarkdownTableCellEditPending(false);
    markdownTableCellCommitterRef.current = null;
    setQueuedHomeNavigation(false);
    setToolbarState(defaultToolbarState);
    setHtmlToolbarActive(false);
    lastEditorTargetRef.current = null;
    lastResolvedTargetRef.current = null;
    lastSelectionRef.current = null;
    activeImageRef.current = null;
    setEditorStats({ characterCount: 0, wordCount: 0, paragraphCount: 0, elementCount: 0 });
    await loadDocxArtifact(project.id, { content: project.content, title: project.title, source: "imported-html" });
  };

  const openProject = (project: { id: string }) => {
    setRoute(pushDocumentRoute(project.id));
  };

  const refreshProjectHistory = async () => {
    const projects = await listProjects();
    setHistoryProjects(projects);
    return projects;
  };

  const loadBlankDocument = async () => {
    setError("");
    setLoading(true);
    try {
      const project = await createProject({
        title: "Untitled Doc",
        content: outputType === "markdown" ? undefined : initialContentForType(outputType),
        type: outputType,
      });
      setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
      openProject(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadPromptDocument = async () => {
    setError("");
    setLoading(true);
    try {
      const userPrompt = prompt.trim();
      const title = userPrompt || "Untitled Doc";
      const attachmentTitle = homeAttachments.attachments[0]?.name ? `Doc from ${homeAttachments.attachments[0].name}` : title;
      const project = await createProject({
        title: attachmentTitle.length > 80 ? `${attachmentTitle.slice(0, 80).trim()}...` : attachmentTitle,
        content: initialContentForType(outputType),
        type: outputType,
      });
      homeAttachments.clearAttachments();
      setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
      openProject(project);
      setPrompt("");
      if (userPrompt) {
        await startAiEdit(project.id, createInitialPromptAiEditRequest({
          content: project.content,
          runtimeProfileId: selectedRuntimeProfileId || null,
          type: project.type,
          userPrompt,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = async (template: GensparkTemplate) => {
    setError("");
    setLoading(true);
    try {
      const project = await createProject({
        title: template.name,
        content: outputType === "markdown" ? markdownTemplateSeed(template.name, template.classification, template.content) : template.content,
        type: outputType,
        templateId: template.id,
        templateName: template.name,
      });
      setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
      openProject(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const openHistoryProject = (project: DocumentProject) => {
    setRoute(pushDocumentRoute(project.id));
  };

  const clearHistory = async () => {
    setError("");
    setLoading(true);
    try {
      const projects = await clearProjectHistory();
      setHistoryProjects(projects);
      setHomePanel("history");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadFixture = async () => {
    setLoading(true);
    setError("");
    try {
      const fixture = await fetchGensparkStudyPlanFixture();
      loadHtmlDocument(fixture.html, { source: "fixture", title: fixture.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    hasUnsavedChangesRef.current = activeHasUnsavedChanges;
  }, [activeHasUnsavedChanges]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const requestHomeRoute = () => {
    if (currentDocumentType === "markdown") {
      if (markdownTableCellEditPending) {
        const committed = markdownTableCellCommitterRef.current?.() ?? false;
        if (committed) {
          setQueuedHomeNavigation(true);
          setMarkdownSaveState("saving");
          return;
        }
      }
      if (markdownSaveState === "error") {
        if (!window.confirm("You have unsaved changes. Leave without saving?")) return;
      } else if (markdownHasUnsavedChanges) {
        setQueuedHomeNavigation(true);
        return;
      }
      setQueuedHomeNavigation(false);
      setRoute(pushHomeRoute());
      return;
    }
    if (activeHasUnsavedChanges && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    setQueuedHomeNavigation(false);
    setRoute(pushHomeRoute());
  };

  useEffect(() => {
    if (!queuedHomeNavigation || activeHasUnsavedChanges || loading) return;
    setQueuedHomeNavigation(false);
    setRoute(pushHomeRoute());
  }, [activeHasUnsavedChanges, loading, queuedHomeNavigation]);

  useEffect(() => {
    const handlePopState = () => {
      if (hasUnsavedChangesRef.current && !window.confirm("You have unsaved changes. Leave without saving?")) {
        window.history.pushState({}, "", routePath(routeRef.current));
        return;
      }
      setRoute(readCurrentRoute());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
      if (route.name === "home") {
      setCurrentProject(null);
      clearArtifact();
      clearMarkdownArtifact();
      clearDocxArtifact();
      setToolbarState(defaultToolbarState);
      setHtmlToolbarActive(false);
      void refreshProjectHistory().catch((err) => setError(err instanceof Error ? err.message : String(err)));
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    void getProject(route.projectId)
      .then(async (project) => {
        if (cancelled) return;
        setCurrentProject(project);
        if (project.type === "markdown") {
          loadMarkdownDocument(project.content, { title: project.title, source: "imported-html" });
        } else if (project.type === "docx") {
          await loadDocxDocument(project);
        } else {
          loadHtmlDocument(project.content, { title: project.title, source: "imported-html" });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [route]);

  useEffect(() => {
    if (currentDocumentType !== "html" || !currentProjectId || !runtime?.dirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const saveGeneration = htmlSaveGenerationRef.current + 1;
    htmlSaveGenerationRef.current = saveGeneration;
    const saveRevision = runtime.revision;
    setSaveState("saving");
    saveTimerRef.current = setTimeout(() => {
      void updateProject(currentProjectId, {
        title: runtime.title,
        content: serializeHtmlRuntime(runtime),
        type: "html",
        updatedBy: "human",
      })
        .then(() => {
          if (htmlSaveGenerationRef.current !== saveGeneration) return;
          setRuntime((current) => (current && current.revision === saveRevision ? { ...current, dirty: false } : current));
          setSaveState("saved");
        })
        .catch((err) => {
          if (htmlSaveGenerationRef.current !== saveGeneration) return;
          setSaveState("error");
          setError(err instanceof Error ? err.message : String(err));
        });
    }, 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [currentDocumentType, currentProjectId, runtime?.dirty, runtime?.revision, runtime?.title, serializeHtmlRuntime, setRuntime]);

  useEffect(() => {
    if (currentDocumentType !== "markdown" || !currentProjectId || !markdownRuntime?.dirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const saveGeneration = markdownSaveGenerationRef.current + 1;
    markdownSaveGenerationRef.current = saveGeneration;
    const saveRevision = markdownRuntime.revision;
    setMarkdownSaveState("saving");
    saveTimerRef.current = setTimeout(() => {
      void updateProject(currentProjectId, {
        title: markdownRuntime.title,
        content: serializeMarkdownRuntime(markdownRuntime),
        type: "markdown",
        updatedBy: "human",
      })
        .then((project) => {
          if (markdownSaveGenerationRef.current !== saveGeneration) return;
          setCurrentProject(project);
          setMarkdownRuntime((current) => (current && current.revision === saveRevision ? { ...current, dirty: false } : current));
          setMarkdownSaveState("saved");
        })
        .catch((err) => {
          if (markdownSaveGenerationRef.current !== saveGeneration) return;
          setMarkdownSaveState("error");
          setError(err instanceof Error ? err.message : String(err));
        });
    }, 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [currentDocumentType, currentProjectId, markdownRuntime?.dirty, markdownRuntime?.revision, markdownRuntime?.title, serializeMarkdownRuntime, setMarkdownRuntime]);

  const agentConversation = useAgentConversation({
    projectId: currentProjectId,
    onProjectUpdated: (project) => {
      if (project.id !== currentProjectId || project.updatedBy !== "ai") return;
      if (!isNewerDocumentProject(project, currentProject)) return;
      setCurrentProject(project);
      if (project.type === "markdown") {
        loadMarkdownDocument(project.content, { title: project.title, source: "imported-html" });
      } else if (project.type === "docx") {
        void loadDocxDocument(project).catch((err) => setError(err instanceof Error ? err.message : String(err)));
      } else {
        loadHtmlDocument(project.content, { title: project.title, source: "imported-html" });
      }
      setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
    },
  });
  const agentBusy = agentSending || agentConversation.items.some((item) => item.run.status === "accepted" || item.run.status === "running");
  const artifactInteraction: ArtifactInteractionPolicy = useMemo(
    () => (agentBusy ? { mode: "read-only", readOnlyReason: "agent-running" } : editableArtifactInteraction),
    [agentBusy],
  );
  const artifactReadOnly = isArtifactReadOnly(artifactInteraction);
  artifactReadOnlyRef.current = artifactReadOnly;

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc?.body) setEditableFrameInteraction(doc, artifactInteraction);
    if (artifactReadOnly) {
      setLinkEditorOpen(false);
      setOperationPanelMode(null);
      pendingImageTargetRef.current = null;
      if (doc) removeImageSelectionOverlay(doc);
    }
  }, [artifactInteraction, artifactReadOnly]);

  const sendAgentPrompt = async (userPrompt: string) => {
    if (!currentProjectId) throw new Error("Project is not open");
    setAgentSending(true);
    setError("");
    try {
      if (currentDocumentType === "markdown") {
        if (!markdownRuntime) throw new Error("Markdown runtime is not ready");
        await startAiEdit(currentProjectId, createMarkdownAiEditRequest({
          projectId: currentProjectId,
          runtime: markdownRuntime,
          userPrompt,
          runtimeProfileId: selectedRuntimeProfileId || null,
        }));
      } else if (currentDocumentType === "docx") {
        if (!docxRuntime) throw new Error("DOCX runtime is not ready");
        await startAiEdit(currentProjectId, createDocxAiEditRequest({
          projectId: currentProjectId,
          runtime: docxRuntime,
          userPrompt,
          runtimeProfileId: selectedRuntimeProfileId || null,
        }));
      } else {
        if (!runtime) throw new Error("Doc runtime is not ready");
        await startAiEdit(currentProjectId, createAiEditRequest({
          projectId: currentProjectId,
          runtime,
          userPrompt,
          runtimeProfileId: selectedRuntimeProfileId || null,
        }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setAgentSending(false);
    }
  };

  const cancelAgentRun = async (runId: string) => {
    setError("");
    try {
      await cancelRun(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const handleFrameLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    if (initializedFrameDocsRef.current.has(doc)) return;
    initializedFrameDocsRef.current.add(doc);
    enableEditableFrame(doc, artifactInteraction);
    setEditorStats(getEditorStats(doc));
    const queueSelectionSync = (fallbackNode?: Node | null) => {
      htmlEditorController.syncSelection(fallbackNode);
      const run = () => htmlEditorController.syncSelection(fallbackNode);
      if (doc.defaultView?.requestAnimationFrame) {
        doc.defaultView.requestAnimationFrame(run);
      } else {
        doc.defaultView?.setTimeout(run, 0);
      }
    };
    const activateToolbarFromFrame = () => setHtmlToolbarActive(true);
    doc.addEventListener("selectionchange", () => {
      if (doc.hasFocus() && doc.getSelection()?.rangeCount) activateToolbarFromFrame();
      queueSelectionSync(lastEditorTargetRef.current);
    });
    const syncFromFrameEvent = (event: Event) => {
      activateToolbarFromFrame();
      lastEditorTargetRef.current = frameEventTarget(doc, event);
      queueSelectionSync(lastEditorTargetRef.current);
    };
    const syncClickFromFrameEvent = (event: Event) => {
      activateToolbarFromFrame();
      const target = frameEventTarget(doc, event);
      const image = imageFromNode(target, doc);
      if (image) {
        event.preventDefault();
        event.stopPropagation();
        selectImageObject(doc, image);
        return;
      }
      clearImageObjectSelection(doc);
      lastEditorTargetRef.current = target;
      queueSelectionSync(target);
    };
    clearTableCellSelection(doc);
    removeImageSelectionOverlay(doc);
    doc.addEventListener("focusin", activateToolbarFromFrame, true);
    doc.addEventListener("pointerdown", activateToolbarFromFrame, true);
    doc.addEventListener("keyup", syncFromFrameEvent, true);
    doc.addEventListener("click", syncClickFromFrameEvent, true);
    doc.addEventListener("input", () => {
      activateToolbarFromFrame();
      htmlEditorController.syncMutation("input", "User edited doc body");
    });
    setRuntime((current) => {
      if (!current) return current;
      const loaded = applier.apply(current, {
        type: "frame-loaded",
        document: runtimeDocumentFromFrame(doc),
      });
      return loaded.history.snapshots.length > 0
        ? loaded
        : applier.recordSnapshot(loaded, doc, {
            operationType: "initial",
            description: "Initial doc load",
          });
    });
  };

  useEffect(() => {
    if (!editorOpen || currentDocumentType !== "html" || !frameSrcDoc) return;
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc?.body) return;
    const frameWindow = doc.defaultView;
    const run = () => handleFrameLoad();
    if (frameWindow?.requestAnimationFrame) {
      const id = frameWindow.requestAnimationFrame(run);
      return () => frameWindow.cancelAnimationFrame(id);
    }
    const id = window.setTimeout(run, 0);
    return () => window.clearTimeout(id);
  }, [currentDocumentType, editorOpen, frameRevision, frameSrcDoc]);

  const applyFormat = (tagName: InlineFormatTag) => {
    htmlEditorController.executeOperation(runtime, {
      operationType: `set_${tagName}`,
      description: `Apply ${tagName} formatting`,
      mutate: (doc, target) => applyInlineFormat(doc, tagName, target),
    });
  };

  const applyHeading = (tagName: HeadingTag) => {
    htmlEditorController.executeOperation(runtime, {
      operationType: "setHeading",
      description: `Set block to ${tagName}`,
      mutate: (doc, target) => setHeading(doc, tagName, target),
    });
  };

  const openLinkEditor = () => {
    const doc = iframeRef.current?.contentDocument ?? null;
    const liveTarget = doc ? currentSelectionElement(doc) ?? lastResolvedTargetRef.current : null;
    const liveSelection = doc ? captureSelectionState(doc, liveTarget ?? lastEditorTargetRef.current) : null;
    const currentHref = readCurrentLinkHref(doc, liveTarget ?? lastEditorTargetRef.current);
    const currentText = readCurrentLinkText(doc, liveTarget ?? lastEditorTargetRef.current);
    const selectedText = liveSelection?.selectedText || runtime?.activeSelection?.selectedText || "";
    const hasLinkableSelection = Boolean(liveSelection && liveSelection.selectionType !== "write");
    const hasStoredLinkableSelection = Boolean(runtime?.activeSelection && runtime.activeSelection.selectionType !== "write");
    const hasInsertionTarget = Boolean(liveTarget ?? lastEditorTargetRef.current);
    if (!currentHref && !hasLinkableSelection && !hasStoredLinkableSelection && !toolbarState.table && !hasInsertionTarget) return;
    setLinkDraft({
      text: currentHref ? currentText : selectedText,
      href: currentHref || "https://",
    });
    setOperationPanelMode(null);
    setLinkEditorOpen((current) => !current);
  };

  const applyLink = (draft: LinkDraft) => {
    if (!draft.href.trim() || draft.href.trim() === "https://") return;
    const applied = htmlEditorController.executeOperation(runtime, {
      operationType: "createLink",
      description: "Create link",
      mutate: (doc, target) => createLink(doc, draft.href, target, draft.text),
    });
    if (!applied) return;
    setLinkEditorOpen(false);
    htmlEditorController.refocusFrame();
  };

  const applyRemoveLink = () => {
    if (!toolbarState.link) return;
    const applied = htmlEditorController.executeOperation(runtime, {
      operationType: "removeLink",
      description: "Remove link",
      mutate: (doc, target) => removeLink(doc, target),
    });
    if (!applied) return;
    setLinkEditorOpen(false);
    htmlEditorController.refocusFrame();
  };

  const applyFontFamily = (fontFamily: string) => {
    htmlEditorController.executeOperation(runtime, {
      operationType: "setFontFamily",
      description: `Set font family ${fontFamily}`,
      preferTypingSelection: true,
      mutate: (doc, target) => setFontFamily(doc, fontFamily, target),
    });
  };

  const applyFontSize = (fontSize: string) => {
    htmlEditorController.executeOperation(runtime, {
      operationType: "setFontSize",
      description: `Set font size ${fontSize}`,
      preferTypingSelection: true,
      mutate: (doc, target) => setFontSize(doc, fontSize, target),
    });
  };

  const applyForeColor = (color: string) => {
    htmlEditorController.executeOperation(runtime, {
      operationType: "setForeColor",
      description: `Set text color ${color}`,
      preferTypingSelection: true,
      mutate: (doc, target) => setForeColor(doc, color, target),
    });
  };

  const applyBackColor = (color: string) => {
    htmlEditorController.executeOperation(runtime, {
      operationType: "setBackColor",
      description: `Set fill color ${color}`,
      preferTypingSelection: true,
      mutate: (doc, target) => setBackColor(doc, color, target),
    });
  };

  const applyAlignment = (alignment: Alignment) => {
    htmlEditorController.executeOperation(runtime, {
      operationType: "setAlignment",
      description: `Set alignment ${alignment}`,
      mutate: (doc, target) => setAlignment(doc, alignment, target),
    });
  };

  const selectImageObject = (doc: Document, image: ImageObjectElement) => {
    if (!doc.body.contains(image)) return;
    activeImageRef.current = image;
    lastEditorTargetRef.current = image;
    lastResolvedTargetRef.current = image;
    selectElementInDocument(doc, image);
    htmlEditorController.syncSelection(image);
    renderImageSelectionOverlay({
      doc,
      image,
      onReplace: requestImageFileSelection,
      onResizeStart: beginResizeImage,
    });
  };

  const clearImageObjectSelection = (doc: Document) => {
    activeImageRef.current = null;
    removeImageSelectionOverlay(doc);
  };

  const beginResizeImage = (handle: ResizeHandle, image: ImageObjectElement, overlay: HTMLElement, event: globalThis.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (artifactReadOnlyRef.current) return;
    if (!image.ownerDocument.body.contains(image)) return;
    const initial = image.getBoundingClientRect();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const target = event.currentTarget;
    if (target instanceof Element && "setPointerCapture" in target) target.setPointerCapture(event.pointerId);
    const ownerWindow = image.ownerDocument.defaultView ?? window;

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;
      const next = resizedImageSizeForHandle(handle, initial.width, initial.height, deltaX, deltaY);
      image.style.width = `${Math.round(next.width)}px`;
      if (next.height !== null) image.style.height = `${Math.round(next.height)}px`;
      positionImageSelectionOverlay(image, overlay);
    };

    const onPointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault();
      ownerWindow.removeEventListener("pointermove", onPointerMove);
      ownerWindow.removeEventListener("pointerup", onPointerEnd);
      ownerWindow.removeEventListener("pointercancel", onPointerEnd);
      activeImageRef.current = image;
      lastEditorTargetRef.current = image;
      lastResolvedTargetRef.current = image;
      selectElementInDocument(image.ownerDocument, image);
      positionImageSelectionOverlay(image, overlay);
      htmlEditorController.syncMutation("resizeImage", "Resize image");
    };

    ownerWindow.addEventListener("pointermove", onPointerMove);
    ownerWindow.addEventListener("pointerup", onPointerEnd);
    ownerWindow.addEventListener("pointercancel", onPointerEnd);
  };

  const applyList = (kind: ListKind) => {
    htmlEditorController.executeOperation(runtime, {
      operationType: `toggle_${kind}_list`,
      description: `Toggle ${kind} list`,
      mutate: (doc, target) => toggleList(doc, kind, target),
    });
  };

  const requestImageFileSelection = (image?: ImageObjectElement | null) => {
    if (artifactReadOnlyRef.current) return;
    const doc = iframeRef.current?.contentDocument ?? null;
    const currentImage =
      image ??
      (doc
        ? imageFromNode(lastEditorTargetRef.current, doc) ??
          imageFromNode(currentSelectionElement(doc), doc) ??
          imageFromNode(lastResolvedTargetRef.current, doc)
        : null);
    pendingImageTargetRef.current = currentImage && currentImage.ownerDocument === doc && doc.body.contains(currentImage) ? currentImage : null;
    setLinkEditorOpen(false);
    setOperationPanelMode(null);
    const input = imageFileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const handleImageFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (artifactReadOnlyRef.current) return;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    let src = "";
    try {
      src = await readFileAsDataUrl(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      pendingImageTargetRef.current = null;
      return;
    }
    const pendingImage = pendingImageTargetRef.current;
    pendingImageTargetRef.current = null;
    const doc = iframeRef.current?.contentDocument ?? null;
    const existingAttributes =
      pendingImage && doc && pendingImage.ownerDocument === doc && doc.body.contains(pendingImage)
        ? readCurrentImageAttributes(doc, pendingImage)
        : { src: "", alt: "", width: "", height: "" };
    const attributes: ImageAttributes = {
      ...existingAttributes,
      src,
      alt: existingAttributes.alt?.trim() || imageAltFromFileName(file.name),
    };
    htmlEditorController.executeOperation(runtime, {
      operationType: pendingImage ? "replaceImage" : "insertImage",
      description: pendingImage ? "Replace image" : "Insert image",
      mutate: (operationDoc, target) => {
        const activeImage =
          pendingImage && pendingImage.ownerDocument === operationDoc && operationDoc.body.contains(pendingImage)
            ? pendingImage
            : null;
        return upsertSelectedImageObject(operationDoc, attributes, target, activeImage);
      },
    });
  };

  const applyToolbarMoreAction = (action: string) => {
    if (!action) return;
    if (action === "image") {
      requestImageFileSelection();
      return;
    }
    if (isOperationPanelMode(action)) {
      if (action === "setAttributes" && !toolbarState.attributeElement) return;
      if (isContentBoundOperation(action) && !toolbarState.contentElement) return;
      if (isPositionBoundOperation(action) && !toolbarState.mutableElement) return;
      setLinkEditorOpen(false);
      setOperationPanelMode(action);
      setOperationDraft(action === "insertHtml" || action === "appendHtml" || action === "insertAtPosition" ? "<p></p>" : "");
      setOperationIsHtml(action === "insertHtml" || action === "appendHtml" || action === "insertAtPosition");
      if (action === "image") {
        setImageDraft(readCurrentImageAttributes(iframeRef.current?.contentDocument ?? null, lastEditorTargetRef.current));
      }
      if (action === "style") {
        setStyleDraft(readCurrentStyles(iframeRef.current?.contentDocument ?? null, lastEditorTargetRef.current));
      }
      if (action === "setAttributes") {
        setAttributeDraft(readCurrentAttributes(iframeRef.current?.contentDocument ?? null, lastEditorTargetRef.current));
      }
      if (action === "wrapSelection") {
        setAttributeDraft({ id: "", className: "", title: "", custom: "" });
      }
      if (action === "table") {
        setTableDraft({ rows: "3", columns: "3" });
      }
      if (action === "insertAtPosition") setOperationPosition("afterend");
    } else if (action === "insertTable") {
      setLinkEditorOpen(false);
      setOperationPanelMode("table");
      setTableDraft({ rows: "3", columns: "3" });
    } else if (isTableEditAction(action)) {
      if (!toolbarState.tableActions[action]) return;
      htmlEditorController.executeOperation(runtime, {
        operationType: action,
        description: tableActionTitle(action, toolbarState.tableHeaderState),
        mutate: (doc, target) => {
          const latestTarget = resolveEditorTarget(
            doc,
            lastEditorTargetRef.current,
            lastSelectionRef.current?.commonAncestorPath ?? runtime?.activeSelection?.commonAncestorPath ?? "",
          );
          const applied = editTable(doc, action, latestTarget ?? target);
          return applied ? currentSelectionElement(doc) ?? latestTarget ?? target ?? true : false;
        },
      });
    } else if (action === "removeImage") {
      if (!toolbarState.image) return;
      htmlEditorController.executeOperation(runtime, {
        operationType: "removeImage",
        description: "Remove image",
        mutate: (doc, target) => removeSelectedImageObject(doc, target, activeImageRef.current),
      });
    } else if (action === "duplicateElement") {
      if (!toolbarState.mutableElement) return;
      htmlEditorController.executeOperation(runtime, {
        operationType: "duplicateElement",
        description: "Duplicate selected element",
        mutate: (doc, target) => duplicateElement(doc, target),
      });
    } else if (action === "deleteElement") {
      if (!toolbarState.mutableElement) return;
      htmlEditorController.executeOperation(runtime, {
        operationType: "deleteElement",
        description: "Delete selected element",
        mutate: (doc, target) => deleteSelectedElement(doc, target),
      });
    } else if (action === "cursorStart") {
      if (!toolbarState.contentElement && !toolbarState.rangeSelection) return;
      htmlEditorController.executeOperation(runtime, {
        operationType: "moveCursorToStart",
        description: "Move cursor to start",
        mutate: (doc, target) => (toolbarState.rangeSelection ? moveSelectionCursorToStart(doc) : target ? moveCursorToStart(doc, target) : false),
      });
    } else if (action === "cursorEnd") {
      if (!toolbarState.contentElement && !toolbarState.rangeSelection) return;
      htmlEditorController.executeOperation(runtime, {
        operationType: "moveCursorToEnd",
        description: "Move cursor to end",
        mutate: (doc, target) => (toolbarState.rangeSelection ? moveSelectionCursorToEnd(doc) : target ? moveCursorToEnd(doc, target) : false),
      });
    }
  };

  const applyOperationPanel = () => {
    if (!operationPanelMode) return;
    const content = operationDraft;
    const hasContent = content.length > 0;
    const attributes = {
      id: attributeDraft.id.trim() || null,
      class: attributeDraft.className.trim() || null,
      title: attributeDraft.title.trim() || null,
      ...parseCustomAttributes(attributeDraft.custom),
    };
    const applied = htmlEditorController.executeOperation(runtime, {
      operationType: operationPanelMode,
      description: operationPanelTitle[operationPanelMode],
      requiresSelection: operationPanelMode === "wrapSelection" || operationPanelMode === "replaceSelection",
      mutate: (doc, target) => {
        if (operationPanelMode === "insertText") return hasContent ? insertText(doc, content, target) : false;
        if (operationPanelMode === "insertHtml") return hasContent ? insertHtml(doc, content, target) : false;
        if (operationPanelMode === "replaceSelection") return replaceSelection(doc, content, operationIsHtml, target);
        if (operationPanelMode === "appendText") return Boolean(target && hasContent && appendToElement(doc, target, content, false));
        if (operationPanelMode === "appendHtml") return Boolean(target && hasContent && appendToElement(doc, target, content, true));
        if (operationPanelMode === "insertAtPosition") return Boolean(target && hasContent && insertAtPosition(doc, target, content, operationPosition, operationIsHtml));
        if (operationPanelMode === "setAttributes") return setElementAttributes(doc, target, attributes);
        if (operationPanelMode === "wrapSelection") return wrapSelection(doc, operationWrapperTag, attributes, target);
        if (operationPanelMode === "image") return upsertSelectedImageObject(doc, imageDraft, target, activeImageRef.current);
        if (operationPanelMode === "style") return setElementStyle(doc, target, styleDraft);
        if (operationPanelMode === "table") {
          const rows = Number.parseInt(tableDraft.rows, 10);
          const columns = Number.parseInt(tableDraft.columns, 10);
          return insertTable(doc, target, Number.isFinite(rows) ? rows : 3, Number.isFinite(columns) ? columns : 3);
        }
        return false;
      },
    });
    if (!applied) return;
    setOperationPanelMode(null);
    setOperationDraft("");
    htmlEditorController.refocusFrame();
  };

  const resetFrameFromRuntime = () => {
    if (!runtime) return;
    setToolbarState(defaultToolbarState);
    resetHtmlFrameFromRuntime();
  };

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
    docxError,
    docxLoading,
    docxRuntime,
    downloadOfficeCli,
    editorOpen,
    editorStats,
    error,
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

function isNewerDocumentProject(next: DocumentProject, current: DocumentProject | null) {
  if (!current || current.id !== next.id) return true;
  return timestampMs(next.updatedAt) > timestampMs(current.updatedAt);
}

function timestampMs(value: string | null | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}
