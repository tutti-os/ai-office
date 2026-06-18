import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  Bold,
  Columns2,
  Copy,
  Image,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Loader2,
  Minus,
  PaintBucket,
  PanelLeft,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { ArtifactEditorFrame, ArtifactWorkspaceHeader, type ArtifactSaveState as WorkspaceSaveState } from "@ai-app/ui/editor-frame";
import {
  FontSizeControl,
  IconButtonLight,
  Toolbar,
  ToolbarColorInput,
  ToolbarDivider,
  ToolbarGroup,
  ToolbarLayoutMenu,
  ToolbarRow,
  ToolbarSelect,
  ToolbarSpacingMenu,
  type ToolbarLayoutValue,
} from "@ai-app/ui/toolbar";
import { HomePage } from "./HomePage";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { DocxPreview } from "./DocxPreview";
import { MarkdownEditor } from "./MarkdownEditor";
import { useAgentConversation } from "./useAgentConversation";
import { cancelRun, clearProjectHistory, createProject, getProject, listProjects, startAiEdit, updateProject } from "../api/projects";
import { fetchGensparkStudyPlanFixture } from "../api/fixtures";
import { fetchBootstrapSnapshot, fetchLocalAgentProviders, fetchTemplates } from "../api/runtime";
import type { DocumentProject, DocumentRunTimelineItem, DocumentType, LocalAgentProviderStatus, RuntimeProfile } from "@ai-doc/shared";
import { createEmptyDocxDocumentManifest, serializeDocxDocumentManifest } from "@ai-doc/shared";
import { DocxArtifactRuntimeAdapter } from "../artifact/docxArtifactAdapter";
import { HtmlArtifactRuntimeAdapter } from "../artifact/htmlArtifactAdapter";
import { MarkdownArtifactRuntimeAdapter, defaultMarkdownDocument } from "../artifact/markdownArtifactAdapter";
import { useDocxArtifactRuntime } from "../artifact/useDocxArtifactRuntime";
import { useHtmlArtifactRuntime } from "../artifact/useHtmlArtifactRuntime";
import { useMarkdownArtifactRuntime } from "../artifact/useMarkdownArtifactRuntime";
import { RuntimeApplier } from "../artifact/runtime/applier";
import { runtimeDocumentFromFrame } from "../artifact/runtime/document";
import { blankHtmlDocument } from "../artifact/runtime/documentSeeds";
import { enableEditableFrame } from "../artifact/runtime/frame";
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
  type TableActionAvailability,
  type TableEditAction,
  type TableHeaderState,
} from "../artifact/runtime/operations";
import { captureSelectionState, restoreSelectionState } from "../artifact/runtime/selection";
import { applyRuntimeSnapshot, createRuntimeSnapshot } from "../artifact/runtime/snapshot";
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

type ToolbarState = {
  targetLabel: string;
  block: HeadingTag;
  fontFamily: string;
  fontSize: string;
  foreColor: string;
  backColor: string;
  lineHeight: string;
  letterSpacing: string;
  layout: ToolbarLayoutValue;
  alignment: Alignment;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  link: boolean;
  list: ListKind | null;
  checklist: boolean;
  table: boolean;
  tableActions: TableActionAvailability;
  tableHeaderState: TableHeaderState;
  image: boolean;
  attributeElement: boolean;
  mutableElement: boolean;
  contentElement: boolean;
  textSelection: boolean;
  rangeSelection: boolean;
};

type AttributeDraft = { id: string; className: string; title: string; custom: string };

const operationPanelModes = [
  "insertText",
  "insertHtml",
  "replaceSelection",
  "appendText",
  "appendHtml",
  "insertAtPosition",
  "setAttributes",
  "wrapSelection",
  "image",
  "style",
  "table",
] as const;
type OperationPanelMode = (typeof operationPanelModes)[number] | null;

type EditorStats = ReturnType<typeof getEditorStats>;
type HomePanel = "templates" | "history";
type ResizeHandle = "top-left" | "top" | "top-right" | "right" | "bottom-right" | "bottom" | "bottom-left" | "left";
type ImageObjectElement = HTMLElement;
type LinkDraft = {
  text: string;
  href: string;
};
type LinkEditorPosition = {
  left: number;
  top: number;
  width: number;
};

const imageResizeHandles: ResizeHandle[] = ["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"];
const linkEditorPanelWidth = 300;
const linkEditorViewportMargin = 8;
const linkEditorAnchorGap = 8;

const defaultToolbarState: ToolbarState = {
  targetLabel: "document",
  block: "p",
  fontFamily: "Arial, sans-serif",
  fontSize: "",
  foreColor: "#111111",
  backColor: "#fff2a8",
  lineHeight: "",
  letterSpacing: "",
  layout: {
    marginTop: "",
    marginRight: "",
    marginBottom: "",
    marginLeft: "",
    paddingTop: "",
    paddingRight: "",
    paddingBottom: "",
    paddingLeft: "",
  },
  alignment: "left",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  link: false,
  list: null,
  checklist: false,
  table: false,
  tableActions: defaultTableActions(),
  tableHeaderState: defaultTableHeaderState(),
  image: false,
  attributeElement: false,
  mutableElement: false,
  contentElement: false,
  textSelection: false,
  rangeSelection: false,
};

function defaultTableActions(): TableActionAvailability {
  return tableEditActions.reduce((actions, action) => {
    actions[action] = false;
    return actions;
  }, {} as TableActionAvailability);
}

function defaultTableHeaderState(): TableHeaderState {
  return {
    rowHeader: false,
    columnHeader: false,
  };
}

const operationPanelTitle: Record<Exclude<OperationPanelMode, null>, string> = {
  insertText: "Insert text",
  insertHtml: "Insert HTML",
  replaceSelection: "Replace selection",
  appendText: "Append text",
  appendHtml: "Append HTML",
  insertAtPosition: "Insert at position",
  setAttributes: "Set attributes",
  wrapSelection: "Wrap selection",
  image: "Image",
  style: "Style",
  table: "Table",
};
const minimumHtmlFrameHeight = 860;
const mergeableColorOperationTypes = new Set(["setForeColor", "setBackColor"]);
const colorHistoryMergeWindowMs = 2000;
const mergeableInputOperationTypes = new Set(["input", "setLineHeight", "setLetterSpacing", "setLayout"]);
const inputHistoryMergeWindowMs = 3000;

function initialContentForType(type: DocumentType) {
  if (type === "markdown") return defaultMarkdownDocument;
  if (type === "docx") return serializeDocxDocumentManifest(createEmptyDocxDocumentManifest());
  return blankHtmlDocument;
}

function markdownPromptSeed(prompt: string) {
  return `# ${prompt.trim() || "Untitled Document"}

## Overview

Write the main idea here.

## Details

- Add supporting detail
- Add examples
- Add next steps
`;
}

function markdownTemplateSeed(name: string, description: string, prompt: string) {
  return `# ${name}

${description}

## Brief

${plainTextPreview(prompt)}

## Draft

- Replace this outline with your content.
`;
}

function plainTextPreview(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function markdownWordCount(content: string) {
  return content.trim().match(/\S+/g)?.length ?? 0;
}

function markdownParagraphCount(content: string) {
  return content.split(/\n{2,}/).filter((block) => block.trim()).length;
}

type AppRoute = { name: "home" } | { name: "document"; projectId: string };

function readCurrentRoute(): AppRoute {
  const match = window.location.pathname.match(/^\/(?:doc|d)\/([^/]+)\/?$/);
  if (match?.[1]) return { name: "document", projectId: decodeURIComponent(match[1]) };
  return { name: "home" };
}

function documentPath(projectId: string) {
  return `/doc/${encodeURIComponent(projectId)}`;
}

function pushDocumentRoute(projectId: string) {
  window.history.pushState({}, "", documentPath(projectId));
  return readCurrentRoute();
}

function pushHomeRoute() {
  window.history.pushState({}, "", "/");
  return readCurrentRoute();
}

export function RuntimeWorkbench() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastEditorTargetRef = useRef<Node | null>(null);
  const lastResolvedTargetRef = useRef<Element | null>(null);
  const lastSelectionRef = useRef<SelectionState | null>(null);
  const activeImageRef = useRef<ImageObjectElement | null>(null);
  const pendingImageTargetRef = useRef<ImageObjectElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedFrameDocsRef = useRef<WeakSet<Document>>(new WeakSet());
  const toolbarSelectionPreserveTimestampRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [selectedRuntimeProfileId, setSelectedRuntimeProfileId] = useState("");
  const homeAttachments = useHomeAttachments();
  const [homePanel, setHomePanel] = useState<HomePanel>("templates");
  const [historyProjects, setHistoryProjects] = useState<DocumentProject[]>([]);
  const [templates, setTemplates] = useState<GensparkTemplate[]>([]);
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState(allTemplatesLabel);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(defaultToolbarState);
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
  const editorOpen = route.name === "document";
  const currentProjectId = route.name === "document" ? route.projectId : null;
  const loadedCurrentProject = currentProjectId && currentProject?.id === currentProjectId ? currentProject : null;
  const currentDocumentType: DocumentType | null = loadedCurrentProject?.type ?? null;
  const activeDirty =
    currentDocumentType === "markdown"
      ? markdownSaveState !== "saved"
      : currentDocumentType === "docx"
        ? docxSaveState !== "saved"
        : currentDocumentType === "html"
          ? saveState !== "saved"
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
    void Promise.all([fetchBootstrapSnapshot(), fetchLocalAgentProviders(), fetchTemplates()])
      .then(([snapshot, providerStatus, libraryTemplates]) => {
        if (cancelled) return;
        const enabledProfiles = snapshot.runtimeProfiles.filter((profile) => profile.enabled && profile.kind === "local-agent");
        setRuntimeProfiles(enabledProfiles);
        setLocalAgentProviders(providerStatus.providers);
        setTemplates(normalizeTemplates(libraryTemplates));
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

  const loadHtmlDocument = (html: string, input: { title: string; source?: RuntimeState["source"] }) => {
    loadArtifact({ content: html, title: input.title, source: input.source });
    clearMarkdownArtifact();
    clearDocxArtifact();
    setToolbarState(defaultToolbarState);
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
    setToolbarState(defaultToolbarState);
    lastEditorTargetRef.current = null;
    lastResolvedTargetRef.current = null;
    lastSelectionRef.current = null;
    activeImageRef.current = null;
    setEditorStats({ characterCount: content.length, wordCount: markdownWordCount(content), paragraphCount: 0, elementCount: 0 });
  };

  const loadDocxDocument = async (project: DocumentProject) => {
    clearArtifact();
    clearMarkdownArtifact();
    setToolbarState(defaultToolbarState);
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
        title: "Untitled Document",
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
      const title = prompt.trim() || "Untitled Document";
      const attachmentTitle = homeAttachments.attachments[0]?.name ? `Document from ${homeAttachments.attachments[0].name}` : title;
      const project = await createProject({
        title: attachmentTitle.length > 80 ? `${attachmentTitle.slice(0, 80).trim()}...` : attachmentTitle,
        content: outputType === "markdown" && title.trim() ? markdownPromptSeed(title) : initialContentForType(outputType),
        type: outputType,
      });
      homeAttachments.clearAttachments();
      setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
      openProject(project);
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
    const handlePopState = () => setRoute(readCurrentRoute());
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
    setSaveState("saving");
    saveTimerRef.current = setTimeout(() => {
      void updateProject(currentProjectId, {
        title: runtime.title,
        content: serializeHtmlRuntime(runtime),
        type: "html",
        updatedBy: "human",
      })
        .then(() => setSaveState("saved"))
        .catch((err) => {
          setSaveState("error");
          setError(err instanceof Error ? err.message : String(err));
        });
    }, 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [currentDocumentType, currentProjectId, runtime?.dirty, runtime?.revision, runtime?.title, serializeHtmlRuntime]);

  useEffect(() => {
    if (currentDocumentType !== "markdown" || !currentProjectId || !markdownRuntime?.dirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setMarkdownSaveState("saving");
    saveTimerRef.current = setTimeout(() => {
      void updateProject(currentProjectId, {
        title: markdownRuntime.title,
        content: serializeMarkdownRuntime(markdownRuntime),
        type: "markdown",
        updatedBy: "human",
      })
        .then((project) => {
          setCurrentProject(project);
          setMarkdownSaveState("saved");
        })
        .catch((err) => {
          setMarkdownSaveState("error");
          setError(err instanceof Error ? err.message : String(err));
        });
    }, 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [currentDocumentType, currentProjectId, markdownRuntime?.dirty, markdownRuntime?.revision, markdownRuntime?.title, serializeMarkdownRuntime]);

  const agentConversation = useAgentConversation({
    projectId: currentProjectId,
    onProjectUpdated: (project) => {
      if (project.id !== currentProjectId || project.updatedBy !== "ai") return;
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
        if (!runtime) throw new Error("Document runtime is not ready");
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
    enableEditableFrame(doc);
    setEditorStats(getEditorStats(doc));
    const queueSelectionSync = (fallbackNode?: Node | null) => {
      syncSelection(fallbackNode);
      const run = () => syncSelection(fallbackNode);
      if (doc.defaultView?.requestAnimationFrame) {
        doc.defaultView.requestAnimationFrame(run);
      } else {
        doc.defaultView?.setTimeout(run, 0);
      }
    };
    doc.addEventListener("selectionchange", () => queueSelectionSync(lastEditorTargetRef.current));
    const syncFromFrameEvent = (event: Event) => {
      lastEditorTargetRef.current = frameEventTarget(doc, event);
      queueSelectionSync(lastEditorTargetRef.current);
    };
    const syncClickFromFrameEvent = (event: Event) => {
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
    doc.addEventListener("keyup", syncFromFrameEvent, true);
    doc.addEventListener("click", syncClickFromFrameEvent, true);
    doc.addEventListener("input", () => syncMutation("input", "User edited document body"));
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
            description: "Initial document load",
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

  const syncSelection = (fallbackNode?: Node | null) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const markerCleaned = cleanupAbandonedTypingStyleMarkers(doc);
    const selection = captureSelectionState(doc, fallbackNode);
    rememberEditorContext(doc, selection, fallbackNode ?? null);
    const fallbackTarget = resolveEditorTarget(doc, fallbackNode ?? null, selection?.commonAncestorPath ?? "");
    const liveSelectionTarget = currentSelectionElement(doc);
    const stableTarget = fallbackTarget ?? liveSelectionTarget ?? lastResolvedTargetRef.current ?? null;
    const toolbarTarget = fallbackTarget ?? liveSelectionTarget ?? fallbackNode ?? null;
    setToolbarState(readToolbarState(doc, toolbarTarget, selection?.commonAncestorPath ?? ""));
    setEditorStats(getEditorStats(doc));
    setRuntime((current) =>
      current
        ? markerCleaned
          ? applier.syncFromFrame(current, doc, {
              operationType: "cleanupTypingStyleMarker",
              description: "Clean unused typing style marker",
              replaceCurrentSnapshot: true,
              selection,
            })
          : applier.apply(current, { type: "selection-changed", selection })
        : current,
    );
  };

  const syncMutation = (operationType: string, description: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    cleanupTypingStyleMarkers(doc);
    clearTableCellSelection(doc);
    const selection = captureSelectionState(doc, lastEditorTargetRef.current);
    rememberEditorContext(doc, selection, lastEditorTargetRef.current);
    setEditorStats(getEditorStats(doc));
    setRuntime((current) =>
      current
        ? applier.syncFromFrame(current, doc, {
            operationType,
            description,
            replaceCurrentSnapshot: shouldMergeEditorHistory(current, operationType),
            selection,
          })
        : current,
    );
  };

  const preserveEditorSelection = () => {
    const now = Date.now();
    if (now - toolbarSelectionPreserveTimestampRef.current < 16) return;
    toolbarSelectionPreserveTimestampRef.current = now;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const target =
      resolveEditorTarget(doc, lastEditorTargetRef.current, lastSelectionRef.current?.commonAncestorPath ?? runtime?.activeSelection?.commonAncestorPath ?? "") ??
      currentSelectionElement(doc) ??
      lastResolvedTargetRef.current ??
      null;
    const selection = captureSelectionState(doc, target ?? lastEditorTargetRef.current);
    rememberEditorContext(doc, selection, target ?? lastEditorTargetRef.current);
    setRuntime((current) => (current ? applier.apply(current, { type: "selection-changed", selection }) : current));
  };

  const rememberEditorContext = (doc: Document, selection: SelectionState | null, fallbackNode?: Node | null) => {
    if (usableSelection(selection)) lastSelectionRef.current = selection;
    const fallbackTarget = resolveEditorTarget(doc, fallbackNode ?? lastEditorTargetRef.current, selection?.commonAncestorPath ?? "");
    const target = fallbackTarget ?? currentSelectionElement(doc) ?? null;
    if (target && target !== doc.body) {
      lastResolvedTargetRef.current = target;
      lastEditorTargetRef.current = target;
    }
  };

  const restoreFailedOperation = (
    doc: Document,
    snapshot: ReturnType<typeof createRuntimeSnapshot>,
    previousTarget: Element | null,
    fallbackPath: string,
  ) => {
    applyRuntimeSnapshot(doc, snapshot);
    const restoredSelection = snapshot.selectionState;
    const restoredTarget =
      currentSelectionElement(doc) ??
      resolveEditorTarget(doc, previousTarget && doc.body.contains(previousTarget) ? previousTarget : lastEditorTargetRef.current, restoredSelection?.commonAncestorPath ?? fallbackPath) ??
      null;
    setToolbarState(readToolbarState(doc, restoredTarget, restoredSelection?.commonAncestorPath ?? fallbackPath));
    setEditorStats(getEditorStats(doc));
  };

  const focusEditorFrame = () => {
    const frame = iframeRef.current;
    frame?.focus();
    frame?.contentWindow?.focus();
  };

  const refocusEditorFrame = () => {
    focusEditorFrame();
    requestAnimationFrame(focusEditorFrame);
  };

  const executeEditorOperation = (input: {
    operationType: string;
    description: string;
    requiresSelection?: boolean;
    preferTypingSelection?: boolean;
    mutate: (doc: Document, target: Element | null) => boolean | Element;
  }) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !runtime) return false;
    const shouldMergeHistory = shouldMergeEditorHistory(runtime, input.operationType);
    const liveSelectionTarget = currentSelectionElement(doc);
    const stableTarget = liveSelectionTarget ?? lastResolvedTargetRef.current ?? null;
    const liveSelection = captureSelectionState(doc, stableTarget ?? lastEditorTargetRef.current);
    const storedSelection = lastSelectionRef.current ?? runtime.activeSelection;
    const operationSelection =
      input.preferTypingSelection && isFallbackOnlySelection(liveSelection) && usableSelection(storedSelection)
        ? storedSelection
        : usableSelection(liveSelection)
          ? liveSelection
          : storedSelection;
    if (input.requiresSelection && (!operationSelection || operationSelection.selectionType === "write")) return false;
    const operationFallbackPath = operationSelection?.commonAncestorPath ?? "";
    const hasRangeSelection = Boolean(operationSelection && operationSelection.selectionType !== "write");
    const hasPreciseTypingSelection = Boolean(
      input.preferTypingSelection &&
        operationSelection?.selectionType === "write" &&
        operationSelection.startPath &&
        operationSelection.endPath,
    );
    const target = hasRangeSelection
      ? resolveEditorTarget(doc, null, operationFallbackPath) ?? stableTarget
      : resolveEditorTarget(doc, stableTarget ?? lastEditorTargetRef.current, operationFallbackPath) ?? stableTarget;
    restoreSelectionState(doc, operationSelection);
    if (!hasPreciseTypingSelection) {
      ensureEditorSelection(doc, target ?? lastEditorTargetRef.current, {
        forceFallback: !hasRangeSelection && !operationSelection?.startPath,
        fallbackPath: operationFallbackPath,
      });
    }
    const before = shouldMergeHistory
      ? runtime
      : applier.recordSnapshot(runtime, doc, {
          operationType: `before_${input.operationType}`,
          description: `Before ${input.description}`,
        });
    const rollbackSnapshot = createRuntimeSnapshot(doc, {
      operationType: `rollback_${input.operationType}`,
      description: `Rollback ${input.description}`,
    });
    let changed: boolean | Element;
    try {
      changed = input.mutate(doc, hasPreciseTypingSelection ? null : target);
    } catch (error) {
      console.error(`Editor operation failed: ${input.operationType}`, error);
      restoreFailedOperation(doc, rollbackSnapshot, target, operationFallbackPath);
      return false;
    }
    if (!changed) {
      restoreFailedOperation(doc, rollbackSnapshot, target, operationFallbackPath);
      return false;
    }
    clearTableCellSelection(doc);
    const nextTarget = isElementNode(changed) ? changed : currentSelectionElement(doc) ?? target;
    const nextSelection = captureSelectionState(doc, nextTarget);
    rememberEditorContext(doc, nextSelection, nextTarget);
    lastEditorTargetRef.current = nextTarget;
    lastResolvedTargetRef.current = nextTarget;
    setToolbarState(readToolbarState(doc, nextTarget, nextSelection?.commonAncestorPath ?? operationFallbackPath));
    setEditorStats(getEditorStats(doc));
    setRuntime(applier.syncFromFrame(before, doc, { ...input, replaceCurrentSnapshot: shouldMergeHistory, selection: nextSelection }));
    refocusEditorFrame();
    return true;
  };

  const applyFormat = (tagName: InlineFormatTag) => {
    executeEditorOperation({
      operationType: `set_${tagName}`,
      description: `Apply ${tagName} formatting`,
      mutate: (doc, target) => applyInlineFormat(doc, tagName, target),
    });
  };

  const applyHeading = (tagName: HeadingTag) => {
    executeEditorOperation({
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
    const applied = executeEditorOperation({
      operationType: "createLink",
      description: "Create link",
      mutate: (doc, target) => createLink(doc, draft.href, target, draft.text),
    });
    if (!applied) return;
    setLinkEditorOpen(false);
    refocusEditorFrame();
  };

  const applyRemoveLink = () => {
    if (!toolbarState.link) return;
    const applied = executeEditorOperation({
      operationType: "removeLink",
      description: "Remove link",
      mutate: (doc, target) => removeLink(doc, target),
    });
    if (!applied) return;
    setLinkEditorOpen(false);
    refocusEditorFrame();
  };

  const applyFontFamily = (fontFamily: string) => {
    executeEditorOperation({
      operationType: "setFontFamily",
      description: `Set font family ${fontFamily}`,
      preferTypingSelection: true,
      mutate: (doc, target) => setFontFamily(doc, fontFamily, target),
    });
  };

  const applyFontSize = (fontSize: string) => {
    executeEditorOperation({
      operationType: "setFontSize",
      description: `Set font size ${fontSize}`,
      preferTypingSelection: true,
      mutate: (doc, target) => setFontSize(doc, fontSize, target),
    });
  };

  const applyForeColor = (color: string) => {
    executeEditorOperation({
      operationType: "setForeColor",
      description: `Set text color ${color}`,
      preferTypingSelection: true,
      mutate: (doc, target) => setForeColor(doc, color, target),
    });
  };

  const applyBackColor = (color: string) => {
    executeEditorOperation({
      operationType: "setBackColor",
      description: `Set fill color ${color}`,
      preferTypingSelection: true,
      mutate: (doc, target) => setBackColor(doc, color, target),
    });
  };

  const applyAlignment = (alignment: Alignment) => {
    executeEditorOperation({
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
    syncSelection(image);
    renderImageSelectionOverlay(doc, image);
  };

  const clearImageObjectSelection = (doc: Document) => {
    activeImageRef.current = null;
    removeImageSelectionOverlay(doc);
  };

  const renderImageSelectionOverlay = (doc: Document, image: ImageObjectElement) => {
    removeImageSelectionOverlay(doc);
    if (!doc.body.contains(image)) return;
    const overlay = doc.createElement("div");
    overlay.setAttribute("data-runtime-editor-overlay", "image-selection");
    overlay.contentEditable = "false";
    Object.assign(overlay.style, {
      position: "absolute",
      zIndex: "2147483647",
      pointerEvents: "none",
      border: "2px solid #2684ff",
      boxSizing: "border-box",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.95)",
    } satisfies Partial<CSSStyleDeclaration>);

    const menu = doc.createElement("div");
    Object.assign(menu.style, {
      position: "absolute",
      left: "50%",
      top: "-8px",
      transform: "translate(-50%, -100%)",
      display: "grid",
      width: "32px",
      height: "32px",
      boxSizing: "border-box",
      placeItems: "center",
      alignItems: "center",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: "8px",
      background: "#fff",
      padding: "0",
      boxShadow: "0 6px 18px rgba(0,0,0,0.14)",
      pointerEvents: "auto",
    } satisfies Partial<CSSStyleDeclaration>);
    const replaceButton = doc.createElement("button");
    replaceButton.type = "button";
    replaceButton.title = "Replace image";
    replaceButton.setAttribute("aria-label", "Replace image");
    Object.assign(replaceButton.style, {
      appearance: "none",
      width: "28px",
      minWidth: "28px",
      height: "28px",
      minHeight: "28px",
      boxSizing: "border-box",
      border: "0",
      borderRadius: "7px",
      background: "transparent",
      padding: "0",
      margin: "0",
      color: "rgba(0,0,0,0.62)",
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      lineHeight: "1",
    } satisfies Partial<CSSStyleDeclaration>);
    const replaceIcon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    replaceIcon.setAttribute("width", "16");
    replaceIcon.setAttribute("height", "16");
    replaceIcon.setAttribute("viewBox", "0 0 24 24");
    replaceIcon.setAttribute("fill", "none");
    replaceIcon.setAttribute("stroke", "currentColor");
    replaceIcon.setAttribute("stroke-width", "2");
    replaceIcon.setAttribute("stroke-linecap", "round");
    replaceIcon.setAttribute("stroke-linejoin", "round");
    replaceIcon.setAttribute("aria-hidden", "true");
    Object.assign(replaceIcon.style, {
      display: "block",
      width: "16px",
      height: "16px",
      flex: "0 0 auto",
    } satisfies Partial<CSSStyleDeclaration>);
    const imagePath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    imagePath.setAttribute("d", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7");
    const mountainPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    mountainPath.setAttribute("d", "m21 15-3.1-3.1a2 2 0 0 0-2.8 0L9 18");
    const imageLinePath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    imageLinePath.setAttribute("d", "m3 15 4-4a2 2 0 0 1 2.8 0L13 14");
    const circle = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "9");
    circle.setAttribute("cy", "9");
    circle.setAttribute("r", "2");
    const replacePath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    replacePath.setAttribute("d", "M17 3h4v4");
    const arrowPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "m21 3-5 5");
    replaceIcon.append(imagePath, mountainPath, imageLinePath, circle, replacePath, arrowPath);
    replaceButton.append(replaceIcon);
    replaceButton.addEventListener("mouseenter", () => {
      replaceButton.style.background = "rgba(0,0,0,0.06)";
      replaceButton.style.color = "#111";
    });
    replaceButton.addEventListener("mouseleave", () => {
      replaceButton.style.background = "transparent";
      replaceButton.style.color = "rgba(0,0,0,0.62)";
    });
    replaceButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    replaceButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestImageFileSelection(image);
    });
    menu.append(replaceButton);
    overlay.append(menu);

    imageResizeHandles.forEach((handle) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Resize ${handle}`);
      button.setAttribute("data-handle", handle);
      Object.assign(button.style, imageResizeHandleStyle(handle));
      button.addEventListener("pointerdown", (event) => beginResizeImage(handle, image, overlay, event));
      overlay.append(button);
    });

    doc.body.append(overlay);
    positionImageSelectionOverlay(image, overlay);
    image.addEventListener("load", () => positionImageSelectionOverlay(image, overlay), { once: true });
  };

  const beginResizeImage = (handle: ResizeHandle, image: ImageObjectElement, overlay: HTMLElement, event: globalThis.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
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
      syncMutation("resizeImage", "Resize image");
    };

    ownerWindow.addEventListener("pointermove", onPointerMove);
    ownerWindow.addEventListener("pointerup", onPointerEnd);
    ownerWindow.addEventListener("pointercancel", onPointerEnd);
  };

  const applyList = (kind: ListKind) => {
    executeEditorOperation({
      operationType: `toggle_${kind}_list`,
      description: `Toggle ${kind} list`,
      mutate: (doc, target) => toggleList(doc, kind, target),
    });
  };

  const requestImageFileSelection = (image?: ImageObjectElement | null) => {
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
    executeEditorOperation({
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
      executeEditorOperation({
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
      executeEditorOperation({
        operationType: "removeImage",
        description: "Remove image",
        mutate: (doc, target) => removeSelectedImageObject(doc, target, activeImageRef.current),
      });
    } else if (action === "duplicateElement") {
      if (!toolbarState.mutableElement) return;
      executeEditorOperation({
        operationType: "duplicateElement",
        description: "Duplicate selected element",
        mutate: (doc, target) => duplicateElement(doc, target),
      });
    } else if (action === "deleteElement") {
      if (!toolbarState.mutableElement) return;
      executeEditorOperation({
        operationType: "deleteElement",
        description: "Delete selected element",
        mutate: (doc, target) => deleteSelectedElement(doc, target),
      });
    } else if (action === "cursorStart") {
      if (!toolbarState.contentElement && !toolbarState.rangeSelection) return;
      executeEditorOperation({
        operationType: "moveCursorToStart",
        description: "Move cursor to start",
        mutate: (doc, target) => (toolbarState.rangeSelection ? moveSelectionCursorToStart(doc) : target ? moveCursorToStart(doc, target) : false),
      });
    } else if (action === "cursorEnd") {
      if (!toolbarState.contentElement && !toolbarState.rangeSelection) return;
      executeEditorOperation({
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
    const applied = executeEditorOperation({
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
    refocusEditorFrame();
  };

  const applyHistoryOffset = (offset: -1 | 1) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !runtime) return;
    const nextIndex = runtime.history.currentIndex + offset;
    const snapshot = runtime.history.snapshots[nextIndex];
    if (!snapshot) return;
    applyRuntimeSnapshot(doc, snapshot);
    const restoredSelection = captureSelectionState(doc);
    const restoredTarget =
      currentSelectionElement(doc) ??
      resolveEditorTarget(doc, lastEditorTargetRef.current, restoredSelection?.commonAncestorPath ?? "") ??
      lastResolvedTargetRef.current;
    rememberEditorContext(doc, restoredSelection, restoredTarget);
    lastEditorTargetRef.current = restoredTarget ?? null;
    lastResolvedTargetRef.current = restoredTarget ?? null;
    setToolbarState(readToolbarState(doc, restoredTarget, restoredSelection?.commonAncestorPath ?? ""));
    setEditorStats(getEditorStats(doc));
    setRuntime((current) =>
      current
        ? applier.apply(current, {
            type: "apply-history-index",
            index: nextIndex,
            document: runtimeDocumentFromFrame(doc),
            selection: restoredSelection,
          })
        : current,
    );
    setToolbarState(readToolbarState(doc, restoredTarget, restoredSelection?.commonAncestorPath ?? ""));
  };

  const resetFrameFromRuntime = () => {
    if (!runtime) return;
    setToolbarState(defaultToolbarState);
    resetHtmlFrameFromRuntime();
  };

  return (
    <main className="h-screen overflow-hidden bg-[#1f1f1f] font-sans text-white">
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
          onOpenHistoryProject={openHistoryProject}
          onOutputTypeChange={setOutputType}
          onRemoveAttachment={homeAttachments.removeAttachment}
          onRuntimeProfileChange={setSelectedRuntimeProfileId}
          onSelectTemplate={loadTemplate}
        />
      ) : currentDocumentType === "markdown" && markdownRuntime ? (
        <ArtifactEditorFrame
          sidebar={
            <AgentConversationPanel
              activeSelectionText={activeSelectionText}
              artifactLabel="markdown"
              dirty={activeDirty}
              error={error || agentConversation.error}
              items={agentConversation.items}
              loading={agentConversation.loading}
              sending={agentBusy}
              onBackHome={() => setRoute(pushHomeRoute())}
              onCancel={cancelAgentRun}
              onSend={sendAgentPrompt}
            />
          }
        >
          <MarkdownEditor
            runtime={markdownRuntime}
            dirty={activeDirty}
            saveState={markdownSaveState}
            loading={loading}
            onUndo={undoMarkdown}
            onRedo={redoMarkdown}
            onChange={(content, selection) => {
              updateMarkdownContent(content, selection);
              setEditorStats({ characterCount: content.length, wordCount: markdownWordCount(content), paragraphCount: markdownParagraphCount(content), elementCount: 0 });
            }}
            onSelectionChange={updateMarkdownSelection}
          />
        </ArtifactEditorFrame>
      ) : currentDocumentType === "docx" && docxRuntime ? (
        <ArtifactEditorFrame
          sidebar={
            <AgentConversationPanel
              activeSelectionText={activeSelectionText}
              artifactLabel="docx"
              dirty={activeDirty}
              error={error || docxError || agentConversation.error}
              items={agentConversation.items}
              loading={agentConversation.loading}
              sending={agentBusy}
              onBackHome={() => setRoute(pushHomeRoute())}
              onCancel={cancelAgentRun}
              onSend={sendAgentPrompt}
            />
          }
        >
          <DocxPreview
            runtime={docxRuntime}
            projectId={currentProjectId}
            dirty={activeDirty}
            error={docxError}
            loading={loading || docxLoading}
            onSelectionChange={updateDocxSelection}
          />
        </ArtifactEditorFrame>
      ) : !currentDocumentType ? (
        <DocumentLoadingScreen error={error} loading={loading} />
      ) : currentDocumentType === "html" && runtime ? (
        <EditorScreen
          activeSelectionText={activeSelectionText}
          dirty={activeDirty}
          error={error}
          frameRevision={frameRevision}
          frameSrcDoc={frameSrcDoc}
          iframeRef={iframeRef}
          loading={loading}
          agentConversationItems={agentConversation.items}
          agentConversationLoading={agentConversation.loading}
          agentConversationError={agentConversation.error}
          agentSending={agentBusy}
          editorStats={editorStats}
          runtime={runtime}
          saveState={saveState}
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
          onBackHome={() => setRoute(pushHomeRoute())}
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
          onLineHeight={(lineHeight) => executeEditorOperation({
            operationType: "setLineHeight",
            description: `Set line height ${lineHeight || "normal"}`,
            mutate: (doc, target) => setElementStyle(doc, target, { lineHeight }),
          })}
          onLetterSpacing={(letterSpacing) => executeEditorOperation({
            operationType: "setLetterSpacing",
            description: `Set letter spacing ${letterSpacing || "normal"}`,
            mutate: (doc, target) => setElementStyle(doc, target, { letterSpacing }),
          })}
          onLayoutChange={(attributes) => executeEditorOperation({
            operationType: "setLayout",
            description: "Set layout",
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
          onIndent={() => executeEditorOperation({
            operationType: "indent",
            description: "Indent block",
            mutate: (doc, target) => indentBlock(doc, target),
          })}
          onChecklist={() => executeEditorOperation({
            operationType: "toggleChecklist",
            description: "Toggle checklist",
            mutate: (doc, target) => toggleChecklist(doc, target),
          })}
          onList={applyList}
          onLoadFixture={() => void loadFixture()}
          onMoreAction={applyToolbarMoreAction}
          onMutation={syncMutation}
          onOutdent={() => executeEditorOperation({
            operationType: "outdent",
            description: "Outdent block",
            mutate: (doc, target) => outdentBlock(doc, target),
          })}
          onSendAgentPrompt={sendAgentPrompt}
          onCancelAgentRun={cancelAgentRun}
          onRedo={() => applyHistoryOffset(1)}
          onResetFrame={resetFrameFromRuntime}
          onSelection={syncSelection}
          onToolbarInteractionStart={preserveEditorSelection}
          onUndo={() => applyHistoryOffset(-1)}
          onFrameLoad={handleFrameLoad}
        />
      ) : (
        <DocumentLoadingScreen error={error} loading={loading} />
      )}
    </main>
  );
}

function DocumentLoadingScreen(props: { error: string; loading: boolean }) {
  return (
    <section className="relative flex min-h-0 flex-col bg-[#1f1f1f]">
      <header className="flex h-12 shrink-0 items-center border-b border-white/8 px-5">
        <div className="min-w-0 truncate text-[13px] font-semibold text-white">Loading document</div>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center bg-[#2a2a2a] px-6 text-center">
        <div className="max-w-[360px] text-[13px] font-semibold text-white/58">
          {props.error ? (
            props.error
          ) : (
            <span className="inline-flex items-center gap-2">
              {props.loading ? <Loader2 className="animate-spin" size={16} /> : null}
              Loading document...
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function EditorScreen(props: {
  activeSelectionText: string;
  dirty: boolean;
  error: string;
  editorStats: EditorStats;
  frameRevision: number;
  frameSrcDoc: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  agentConversationItems: DocumentRunTimelineItem[];
  agentConversationLoading: boolean;
  agentConversationError: string;
  agentSending: boolean;
  attributeDraft: AttributeDraft;
  imageDraft: ImageAttributes;
  tableDraft: { rows: string; columns: string };
  styleDraft: ElementStyleAttributes;
  linkDraft: LinkDraft;
  linkEditorOpen: boolean;
  loading: boolean;
  operationDraft: string;
  operationIsHtml: boolean;
  operationPanelMode: OperationPanelMode;
  operationPosition: AdjacentInsertPosition;
  operationWrapperTag: string;
  runtime: RuntimeState | null;
  saveState: WorkspaceSaveState;
  toolbarState: ToolbarState;
  onAlignment: (alignment: Alignment) => void;
  onApplyLink: (draft: LinkDraft) => void;
  onApplyOperation: () => void;
  onAttributeDraftChange: (value: AttributeDraft) => void;
  onBackHome: () => void;
  onCloseLinkEditor: () => void;
  onCloseOperation: () => void;
  onBackColor: (color: string) => void;
  onForeColor: (color: string) => void;
  onTableDraftChange: (value: { rows: string; columns: string }) => void;
  onStyleDraftChange: (value: ElementStyleAttributes) => void;
  onLineHeight: (lineHeight: string) => void;
  onLetterSpacing: (letterSpacing: string) => void;
  onLayoutChange: (attributes: Partial<ToolbarLayoutValue>) => void;
  onCreateLink: () => void;
  onFontFamily: (fontFamily: string) => void;
  onFontSize: (fontSize: string) => void;
  onFrameLoad: () => void;
  onFormat: (tagName: InlineFormatTag) => void;
  onHeading: (tagName: HeadingTag) => void;
  onImageDraftChange: (value: ImageAttributes) => void;
  onIndent: () => void;
  onChecklist: () => void;
  onList: (kind: ListKind) => void;
  onLinkDraftChange: (value: LinkDraft) => void;
  onLoadFixture: () => void;
  onMoreAction: (action: string) => void;
  onMutation: (operationType: string, description: string) => void;
  onOperationDraftChange: (value: string) => void;
  onOperationHtmlChange: (value: boolean) => void;
  onOperationPositionChange: (value: AdjacentInsertPosition) => void;
  onOperationWrapperTagChange: (value: string) => void;
  onOutdent: () => void;
  onPickImage: () => void;
  onSendAgentPrompt: (prompt: string) => Promise<void>;
  onCancelAgentRun: (runId: string) => Promise<void>;
  onRemoveLink: () => void;
  onRedo: () => void;
  onResetFrame: () => void;
  onSelection: () => void;
  onToolbarInteractionStart: () => void;
  onUndo: () => void;
}) {
  const canUndo = Boolean(props.runtime && props.runtime.history.currentIndex > 0);
  const canRedo = Boolean(props.runtime && props.runtime.history.currentIndex < props.runtime.history.snapshots.length - 1);
  const [spacingMenuOpen, setSpacingMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [frameHeight, setFrameHeight] = useState(minimumHtmlFrameHeight);
  const linkEditorRef = useRef<HTMLDivElement | null>(null);
  const linkEditorPanelRef = useRef<HTMLFormElement | null>(null);
  const frameScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const frameResizeRafRef = useRef<number | null>(null);
  const [linkEditorPosition, setLinkEditorPosition] = useState<LinkEditorPosition | null>(null);
  const hasPreservedRangeSelection = Boolean(props.runtime?.activeSelection && props.runtime.activeSelection.selectionType !== "write");
  const hasPreservedWriteSelection = Boolean(props.runtime?.activeSelection?.selectionType === "write" && props.runtime.activeSelection.commonAncestorPath);
  const canUseRangeSelection = props.toolbarState.rangeSelection || hasPreservedRangeSelection;
  const canCreateLink = canUseRangeSelection || hasPreservedWriteSelection || props.toolbarState.table || props.toolbarState.contentElement;

  const updateHtmlFrameHeight = (pass = 0) => {
    const frame = props.iframeRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) return;
    const nextHeight = measureHtmlFrameContentHeight(doc);
    frame.style.height = `${nextHeight}px`;
    setFrameHeight((current) => (current === nextHeight ? current : nextHeight));
    if (pass >= 2) return;
    frameResizeRafRef.current = window.requestAnimationFrame(() => {
      frameResizeRafRef.current = null;
      const renderedHeight = Math.ceil(frame.getBoundingClientRect().height);
      if (measureHtmlFrameContentHeight(doc) > renderedHeight) updateHtmlFrameHeight(pass + 1);
    });
  };

  const scheduleHtmlFrameResize = () => {
    if (frameResizeRafRef.current !== null) window.cancelAnimationFrame(frameResizeRafRef.current);
    frameResizeRafRef.current = window.requestAnimationFrame(() => {
      frameResizeRafRef.current = null;
      updateHtmlFrameHeight();
    });
  };

  useEffect(() => {
    setFrameHeight(minimumHtmlFrameHeight);
    scheduleHtmlFrameResize();

    const doc = props.iframeRef.current?.contentDocument ?? null;
    if (!doc?.body) {
      return () => {
        if (frameResizeRafRef.current !== null) window.cancelAnimationFrame(frameResizeRafRef.current);
      };
    }

    const mutationObserver = new MutationObserver(scheduleHtmlFrameResize);
    mutationObserver.observe(doc.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    doc.addEventListener("load", scheduleHtmlFrameResize, true);

    return () => {
      mutationObserver.disconnect();
      doc.removeEventListener("load", scheduleHtmlFrameResize, true);
      if (frameResizeRafRef.current !== null) window.cancelAnimationFrame(frameResizeRafRef.current);
      frameResizeRafRef.current = null;
    };
  }, [props.frameRevision, props.frameSrcDoc]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== props.iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; deltaX?: unknown; deltaY?: unknown };
      if (!data || data.type !== "ai-doc-frame-wheel") return;
      const scroller = frameScrollContainerRef.current;
      if (!scroller) return;
      scroller.scrollLeft += typeof data.deltaX === "number" ? data.deltaX : 0;
      scroller.scrollTop += typeof data.deltaY === "number" ? data.deltaY : 0;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [props.iframeRef]);

  useLayoutEffect(() => {
    if (!props.linkEditorOpen) {
      setLinkEditorPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchor = linkEditorRef.current?.querySelector("button");
      const panel = linkEditorPanelRef.current;
      if (!anchor || !panel) return;
      const anchorRect = anchor.getBoundingClientRect();
      const availableWidth = Math.max(0, window.innerWidth - linkEditorViewportMargin * 2);
      const panelWidth = Math.min(linkEditorPanelWidth, availableWidth);
      const panelHeight = panel.offsetHeight;
      const centeredLeft = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
      const maxLeft = window.innerWidth - linkEditorViewportMargin - panelWidth;
      const left = clampNumber(centeredLeft, linkEditorViewportMargin, Math.max(linkEditorViewportMargin, maxLeft));
      const belowTop = anchorRect.bottom + linkEditorAnchorGap;
      const aboveTop = anchorRect.top - linkEditorAnchorGap - panelHeight;
      const maxTop = window.innerHeight - linkEditorViewportMargin - panelHeight;
      const top =
        belowTop + panelHeight <= window.innerHeight - linkEditorViewportMargin || aboveTop < linkEditorViewportMargin
          ? clampNumber(belowTop, linkEditorViewportMargin, Math.max(linkEditorViewportMargin, maxTop))
          : clampNumber(aboveTop, linkEditorViewportMargin, Math.max(linkEditorViewportMargin, maxTop));
      setLinkEditorPosition((current) =>
        current && current.left === left && current.top === top && current.width === panelWidth
          ? current
          : { left, top, width: panelWidth },
      );
    };

    const raf = window.requestAnimationFrame(updatePosition);
    const scroller = frameScrollContainerRef.current;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    scroller?.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      scroller?.removeEventListener("scroll", updatePosition);
    };
  }, [props.linkEditorOpen]);

  useEffect(() => {
    if (!props.linkEditorOpen) return;
    const doc = props.iframeRef.current?.contentDocument;
    if (!doc) return;
    const onFramePointerDown = () => props.onCloseLinkEditor();
    doc.addEventListener("pointerdown", onFramePointerDown, true);
    return () => doc.removeEventListener("pointerdown", onFramePointerDown, true);
  }, [props.frameRevision, props.iframeRef, props.linkEditorOpen, props.onCloseLinkEditor]);

  useEffect(() => {
    if (!props.linkEditorOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (linkEditorRef.current?.contains(event.target as Node) || linkEditorPanelRef.current?.contains(event.target as Node)) return;
      props.onCloseLinkEditor();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onCloseLinkEditor();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [props.linkEditorOpen, props.onCloseLinkEditor]);

  const linkEditorStyle: CSSProperties = linkEditorPosition
    ? { left: linkEditorPosition.left, top: linkEditorPosition.top, width: linkEditorPosition.width }
    : { visibility: "hidden" };
  const linkEditorPortal =
    props.linkEditorOpen && typeof document !== "undefined"
      ? createPortal(
          <form
            ref={linkEditorPanelRef}
            data-toolbar-skip-selection-preserve="true"
            className="fixed z-50 grid w-[300px] max-w-[calc(100vw-16px)] gap-1.5 rounded-lg border border-black/10 bg-white p-2 shadow-[0_12px_28px_rgba(0,0,0,0.14)]"
            style={linkEditorStyle}
            onSubmit={(event) => {
              event.preventDefault();
              props.onApplyLink(props.linkDraft);
            }}
          >
            <input
              className="h-7 w-full rounded-md border border-black/10 bg-white px-2 text-[11px] font-medium text-[#333] outline-none"
              value={props.linkDraft.text}
              onChange={(event) => props.onLinkDraftChange({ ...props.linkDraft, text: event.currentTarget.value })}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder="Text"
              aria-label="Link text"
            />
            <div className="flex min-w-0 items-center gap-1">
              <input
                className="h-7 min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 text-[11px] font-medium text-[#333] outline-none"
                value={props.linkDraft.href}
                onChange={(event) => props.onLinkDraftChange({ ...props.linkDraft, href: event.currentTarget.value })}
                onMouseDown={(event) => event.stopPropagation()}
                placeholder="https://"
                aria-label="Link URL"
              />
              <button className="h-7 rounded-md bg-black px-2.5 text-[10px] font-semibold text-white" type="submit">
                Apply
              </button>
            </div>
          </form>,
          document.body,
        )
      : null;

  return (
    <>
    <ArtifactEditorFrame
      sidebar={
        <AgentConversationPanel
          activeSelectionText={props.activeSelectionText}
          artifactLabel="html"
          dirty={props.dirty}
          error={props.error || props.agentConversationError}
          items={props.agentConversationItems}
          loading={props.agentConversationLoading}
          sending={props.agentSending}
          onBackHome={props.onBackHome}
          onCancel={props.onCancelAgentRun}
          onSend={props.onSendAgentPrompt}
        />
      }
    >
      <section className="relative flex min-h-0 flex-col bg-[#1f1f1f]">
        <ArtifactWorkspaceHeader
          title={props.runtime?.title ?? "Untitled Document"}
          saveState={props.saveState}
          exportItems={[
            { label: "PDF", disabled: true, onSelect: () => undefined },
            { label: "DOCX", disabled: true, onSelect: () => undefined },
          ]}
        />

        <div ref={frameScrollContainerRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#2a2a2a] px-3 py-5 md:px-6 md:py-7">
          <Toolbar
            className="relative -translate-y-1.5 overflow-visible !shadow-[0_16px_44px_rgba(0,0,0,0.24)]"
            display={{ maxWidth: 1500, width: "content" }}
            onMouseDownCapture={(event) => {
              if (!shouldSkipToolbarSelectionPreserve(event.target)) props.onToolbarInteractionStart();
              if (shouldKeepEditorSelectionOnToolbarCommand(event.target)) event.preventDefault();
            }}
            onPointerDownCapture={(event) => {
              if (!shouldSkipToolbarSelectionPreserve(event.target)) props.onToolbarInteractionStart();
            }}
          >
            <ToolbarRow wrap className="gap-y-1.5">
              <ToolbarGroup>
                <IconButtonLight disabled={!canUndo} title="Undo" onClick={props.onUndo}><Undo2 size={18} /></IconButtonLight>
                <IconButtonLight disabled={!canRedo} title="Redo" onClick={props.onRedo}><Redo2 size={18} /></IconButtonLight>
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup className="[column-gap:4px]">
                <ToolbarSelect title="Block style" value={props.toolbarState.block} onChange={(value) => props.onHeading(value as HeadingTag)}>
                  <option value="p">Normal Text</option>
                  <option value="h1">Heading 1</option>
                  <option value="h2">Heading 2</option>
                  <option value="h3">Heading 3</option>
                  <option value="h4">Heading 4</option>
                  <option value="blockquote">Quote</option>
                </ToolbarSelect>
                <ToolbarSelect title="Font family" value={props.toolbarState.fontFamily} onChange={props.onFontFamily}>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Inter, sans-serif">Inter</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'Times New Roman', serif">Times</option>
                  <option value="'Courier New', monospace">Courier</option>
                </ToolbarSelect>
                <FontSizeControl value={props.toolbarState.fontSize || "14px"} onChange={props.onFontSize} />
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <IconButtonLight active={props.toolbarState.bold} title="Bold" onClick={() => props.onFormat("strong")}><Bold size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.italic} title="Italic" onClick={() => props.onFormat("em")}><Italic size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.underline} title="Underline" onClick={() => props.onFormat("u")}><Underline size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.strikethrough} title="Strikethrough" onClick={() => props.onFormat("s")}><Strikethrough size={19} /></IconButtonLight>
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <IconButtonLight active={props.toolbarState.alignment === "left"} title="Align left" onClick={() => props.onAlignment("left")}><AlignLeft size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.alignment === "center"} title="Align center" onClick={() => props.onAlignment("center")}><AlignCenter size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.alignment === "right"} title="Align right" onClick={() => props.onAlignment("right")}><AlignRight size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.alignment === "justify"} title="Justify" onClick={() => props.onAlignment("justify")}><AlignJustify size={19} /></IconButtonLight>
                <ToolbarSpacingMenu
                  lineHeight={props.toolbarState.lineHeight}
                  letterSpacing={props.toolbarState.letterSpacing}
                  open={spacingMenuOpen}
                  onLineHeightChange={props.onLineHeight}
                  onLetterSpacingChange={props.onLetterSpacing}
                  onOpenChange={(open) => {
                    setSpacingMenuOpen(open);
                    if (open) setLayoutMenuOpen(false);
                  }}
                />
                <ToolbarLayoutMenu
                  open={layoutMenuOpen}
                  targetLabel={props.toolbarState.targetLabel}
                  value={props.toolbarState.layout}
                  onOpenChange={(open) => {
                    setLayoutMenuOpen(open);
                    if (open) setSpacingMenuOpen(false);
                  }}
                  onChange={props.onLayoutChange}
                />
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <IconButtonLight active={props.toolbarState.list === "ordered"} title="Numbered list" onClick={() => props.onList("ordered")}><ListOrdered size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.list === "unordered"} title="Bulleted list" onClick={() => props.onList("unordered")}><List size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.checklist} title="Checklist" onClick={props.onChecklist}><ListTodo size={19} /></IconButtonLight>
                <IconButtonLight title="Indent" onClick={props.onIndent}><IndentIncrease size={19} /></IconButtonLight>
                <IconButtonLight title="Outdent" onClick={props.onOutdent}><IndentDecrease size={19} /></IconButtonLight>
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <ToolbarColorInput
                  title="Text color"
                  color={props.toolbarState.foreColor}
                  onChange={props.onForeColor}
                />
                <ToolbarColorInput
                  title="Fill color"
                  color={props.toolbarState.backColor}
                  icon={<PaintBucket size={17} />}
                  onChange={props.onBackColor}
                />
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <IconButtonLight active={props.toolbarState.image} title="Image" onClick={props.onPickImage}><Image size={18} /></IconButtonLight>
                <div ref={linkEditorRef} className="relative inline-grid">
                  <IconButtonLight
                    active={props.toolbarState.link}
                    disabled={!props.toolbarState.link && !canCreateLink}
                    title="Create link"
                    onClick={props.toolbarState.link ? props.onRemoveLink : props.onCreateLink}
                  >
                    <Link2 size={18} />
                  </IconButtonLight>
                </div>
                <IconButtonLight title="Insert table" onClick={() => props.onMoreAction("insertTable")}><Table2 size={18} /></IconButtonLight>
              </ToolbarGroup>
              {props.toolbarState.table ? (
                <>
                  <ToolbarDivider />
                  <ToolbarGroup>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.addColumnAfter} title="Add column" onClick={() => props.onMoreAction("addColumnAfter")}><Columns2 size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.deleteColumn} title="Delete column" onClick={() => props.onMoreAction("deleteColumn")}><BetweenHorizontalEnd size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.addRowAfter} title="Add row" onClick={() => props.onMoreAction("addRowAfter")}><Rows3 size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.deleteRow} title="Delete row" onClick={() => props.onMoreAction("deleteRow")}><Minus size={18} /></IconButtonLight>
                  </ToolbarGroup>
                  <ToolbarDivider />
                  <ToolbarGroup>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.copyRow} title="Copy row" onClick={() => props.onMoreAction("copyRow")}><Copy size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.copyColumn} title="Copy column" onClick={() => props.onMoreAction("copyColumn")}><Copy className="rotate-90" size={18} /></IconButtonLight>
                  </ToolbarGroup>
                  <ToolbarDivider />
                  <ToolbarGroup>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.moveColumnLeft} title="Move column left" onClick={() => props.onMoreAction("moveColumnLeft")}><ArrowLeft size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.moveColumnRight} title="Move column right" onClick={() => props.onMoreAction("moveColumnRight")}><ArrowRight size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.moveRowUp} title="Move row up" onClick={() => props.onMoreAction("moveRowUp")}><ArrowUp size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.moveRowDown} title="Move row down" onClick={() => props.onMoreAction("moveRowDown")}><ArrowUp className="rotate-180" size={18} /></IconButtonLight>
                  </ToolbarGroup>
                </>
              ) : null}
            </ToolbarRow>

            {props.operationPanelMode ? (
              <form
                data-toolbar-skip-selection-preserve="true"
                className="absolute left-3 right-3 top-full z-30 mt-2 flex min-h-9 w-fit max-w-[calc(100%-1.5rem)] shrink-0 items-center gap-1.5 overflow-x-auto rounded-lg border border-black/10 bg-white px-2.5 py-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.14)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onSubmit={(event) => {
                  event.preventDefault();
                  props.onApplyOperation();
                }}
              >
                <span className="shrink-0 px-1 text-[11px] font-bold text-[#555]">{operationPanelTitle[props.operationPanelMode]}</span>
                {props.operationPanelMode === "insertAtPosition" || props.operationPanelMode === "replaceSelection" ? (
                  <>
                    {props.operationPanelMode === "insertAtPosition" ? (
                      <select
                        aria-label="Insert position"
                        className="h-8 rounded-lg border border-black/10 bg-white px-2 text-[12px] font-semibold text-[#333] outline-none"
                        value={props.operationPosition}
                        onChange={(event) => props.onOperationPositionChange(event.currentTarget.value as AdjacentInsertPosition)}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <option value="beforebegin">Before element</option>
                        <option value="afterbegin">At start</option>
                        <option value="beforeend">At end</option>
                        <option value="afterend">After element</option>
                      </select>
                    ) : null}
                    <label className="flex h-8 items-center gap-1 rounded-lg border border-black/10 bg-white px-2 text-[11px] font-semibold text-[#555]">
                      <input
                        checked={props.operationIsHtml}
                        type="checkbox"
                        onChange={(event) => props.onOperationHtmlChange(event.currentTarget.checked)}
                        onMouseDown={(event) => event.stopPropagation()}
                      />
                      HTML
                    </label>
                  </>
                ) : null}
                {props.operationPanelMode === "wrapSelection" ? (
                  <select
                    aria-label="Wrapper tag"
                    className="h-8 rounded-lg border border-black/10 bg-white px-2 text-[12px] font-semibold text-[#333] outline-none"
                    value={props.operationWrapperTag}
                    onChange={(event) => props.onOperationWrapperTagChange(event.currentTarget.value)}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <option value="span">span</option>
                    <option value="strong">strong</option>
                    <option value="em">em</option>
                    <option value="mark">mark</option>
                    <option value="code">code</option>
                    <option value="p">p</option>
                    <option value="h1">h1</option>
                    <option value="h2">h2</option>
                    <option value="h3">h3</option>
                    <option value="h4">h4</option>
                    <option value="h5">h5</option>
                    <option value="h6">h6</option>
                    <option value="div">div</option>
                    <option value="section">section</option>
                    <option value="article">article</option>
                    <option value="blockquote">blockquote</option>
                    <option value="pre">pre</option>
                    <option value="ul">ul</option>
                    <option value="ol">ol</option>
                    <option value="li">li</option>
                  </select>
                ) : null}
                {props.operationPanelMode === "table" ? (
                  <>
                    <input
                      aria-label="Table rows"
                      className="h-8 w-[86px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      inputMode="numeric"
                      placeholder="rows"
                      value={props.tableDraft.rows}
                      onChange={(event) => props.onTableDraftChange({ ...props.tableDraft, rows: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Table columns"
                      className="h-8 w-[96px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      inputMode="numeric"
                      placeholder="columns"
                      value={props.tableDraft.columns}
                      onChange={(event) => props.onTableDraftChange({ ...props.tableDraft, columns: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                  </>
                ) : props.operationPanelMode === "style" ? (
                  <>
                    <input
                      aria-label="Width"
                      className="h-8 w-[82px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="width"
                      value={props.styleDraft.width ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, width: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Height"
                      className="h-8 w-[82px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="height"
                      value={props.styleDraft.height ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, height: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Line height"
                      className="h-8 w-[88px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="line"
                      value={props.styleDraft.lineHeight ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, lineHeight: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Letter spacing"
                      className="h-8 w-[88px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="spacing"
                      value={props.styleDraft.letterSpacing ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, letterSpacing: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <select
                      aria-label="Vertical align"
                      className="h-8 rounded-lg border border-black/10 bg-white px-2 text-[12px] font-semibold text-[#333] outline-none"
                      value={props.styleDraft.verticalAlign ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, verticalAlign: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <option value="">vertical</option>
                      <option value="top">top</option>
                      <option value="middle">middle</option>
                      <option value="bottom">bottom</option>
                      <option value="baseline">baseline</option>
                    </select>
                    <input
                      aria-label="Border width"
                      className="h-8 w-[82px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="border"
                      value={props.styleDraft.borderWidth ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderWidth: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <select
                      aria-label="Border style"
                      className="h-8 rounded-lg border border-black/10 bg-white px-2 text-[12px] font-semibold text-[#333] outline-none"
                      value={props.styleDraft.borderStyle ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderStyle: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <option value="">border style</option>
                      <option value="none">none</option>
                      <option value="solid">solid</option>
                      <option value="dashed">dashed</option>
                      <option value="dotted">dotted</option>
                      <option value="double">double</option>
                    </select>
                    <label className="flex h-8 items-center gap-2 rounded-lg border border-black/10 bg-white px-2 text-[11px] font-semibold text-[#555]">
                      Border
                      <input
                        aria-label="Border color"
                        className="size-5 rounded border border-black/10"
                        type="color"
                        value={props.styleDraft.borderColor || "#d0d5dd"}
                        onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderColor: event.currentTarget.value })}
                        onMouseDown={(event) => event.stopPropagation()}
                      />
                    </label>
                    <input
                      aria-label="Border color value"
                      className="h-8 w-[92px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="#d0d5dd"
                      value={props.styleDraft.borderColor ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderColor: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Border radius"
                      className="h-8 w-[82px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="radius"
                      value={props.styleDraft.borderRadius ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, borderRadius: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Padding"
                      className="h-8 w-[82px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="padding"
                      value={props.styleDraft.padding ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, padding: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Margin top"
                      className="h-8 w-[82px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="before"
                      value={props.styleDraft.marginTop ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, marginTop: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Margin bottom"
                      className="h-8 w-[82px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="after"
                      value={props.styleDraft.marginBottom ?? ""}
                      onChange={(event) => props.onStyleDraftChange({ ...props.styleDraft, marginBottom: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                  </>
                ) : props.operationPanelMode === "image" ? (
                  <>
                    <input
                      aria-label="Image URL"
                      className="h-8 w-[260px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="https://... or data:image/..."
                      value={props.imageDraft.src}
                      onChange={(event) => props.onImageDraftChange({ ...props.imageDraft, src: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Image alt text"
                      className="h-8 w-[140px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="alt"
                      value={props.imageDraft.alt ?? ""}
                      onChange={(event) => props.onImageDraftChange({ ...props.imageDraft, alt: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Image width"
                      className="h-8 w-[86px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="width"
                      value={props.imageDraft.width ?? ""}
                      onChange={(event) => props.onImageDraftChange({ ...props.imageDraft, width: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Image height"
                      className="h-8 w-[86px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="height"
                      value={props.imageDraft.height ?? ""}
                      onChange={(event) => props.onImageDraftChange({ ...props.imageDraft, height: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                  </>
                ) : props.operationPanelMode === "setAttributes" || props.operationPanelMode === "wrapSelection" ? (
                  <>
                    <input
                      aria-label="Element id"
                      className="h-8 w-[96px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="id"
                      value={props.attributeDraft.id}
                      onChange={(event) => props.onAttributeDraftChange({ ...props.attributeDraft, id: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Element class"
                      className="h-8 w-[128px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="class"
                      value={props.attributeDraft.className}
                      onChange={(event) => props.onAttributeDraftChange({ ...props.attributeDraft, className: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <input
                      aria-label="Element title"
                      className="h-8 w-[140px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      placeholder="title"
                      value={props.attributeDraft.title}
                      onChange={(event) => props.onAttributeDraftChange({ ...props.attributeDraft, title: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <textarea
                      aria-label="Custom attributes"
                      className="h-14 w-[220px] resize-none rounded-lg border border-black/10 bg-white px-2 py-1 text-[12px] font-medium leading-4 text-[#333] outline-none"
                      placeholder={"data-key=value\naria-label=Name"}
                      value={props.attributeDraft.custom}
                      onChange={(event) => props.onAttributeDraftChange({ ...props.attributeDraft, custom: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                  </>
                ) : (
                  <textarea
                    aria-label={operationPanelTextLabel(props.operationPanelMode)}
                    className="h-14 w-[280px] resize-none rounded-lg border border-black/10 bg-white px-2 py-1 text-[12px] font-medium leading-4 text-[#333] outline-none"
                    placeholder={operationPanelPlaceholder(props.operationPanelMode)}
                    value={props.operationDraft}
                    onChange={(event) => props.onOperationDraftChange(event.currentTarget.value)}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                )}
                <button className="h-8 rounded-lg bg-black px-3 text-[11px] font-semibold text-white" type="submit">
                  Apply
                </button>
                <button
                  className="h-8 rounded-lg px-3 text-[11px] font-semibold text-[#555] hover:bg-black/5"
                  type="button"
                  onClick={props.onCloseOperation}
                >
                  Cancel
                </button>
              </form>
            ) : null}
          </Toolbar>

          {props.frameSrcDoc ? (
            <iframe
              key={props.frameRevision}
              ref={props.iframeRef}
              className="mx-auto block min-h-[860px] w-full max-w-[980px] overflow-clip rounded-[2px] border border-black/30 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
              style={{ height: frameHeight }}
              title={props.runtime?.title ?? "Runtime document"}
              sandbox="allow-scripts allow-same-origin"
              scrolling="no"
              srcDoc={props.frameSrcDoc}
              onLoad={() => {
                props.onFrameLoad();
                scheduleHtmlFrameResize();
              }}
              onInput={() => {
                props.onMutation("input", "User edited document body");
                scheduleHtmlFrameResize();
              }}
              onKeyUp={props.onSelection}
              onMouseUp={props.onSelection}
            />
          ) : (
            <div className="mx-auto grid min-h-[620px] max-w-[860px] place-items-center rounded border border-white/10 bg-[#202020] text-center text-white/42">
              Loading document...
            </div>
          )}
        </div>
      </section>
    </ArtifactEditorFrame>
    {linkEditorPortal}
    </>
  );
}

function isOperationPanelMode(action: string): action is Exclude<OperationPanelMode, null> {
  return (operationPanelModes as readonly string[]).includes(action);
}

function measureHtmlFrameContentHeight(doc: Document) {
  const body = doc.body;
  const view = doc.defaultView;
  const computed = view?.getComputedStyle(body);
  const contentBottom = measureBodyContentBottom(doc);
  const paddingBottom = Number.parseFloat(computed?.paddingBottom || "") || 0;
  const borderBottom = Number.parseFloat(computed?.borderBottomWidth || "") || 0;
  const marginBottom = Number.parseFloat(computed?.marginBottom || "") || 0;
  return Math.ceil(Math.max(minimumHtmlFrameHeight, contentBottom + (view?.scrollY ?? 0) + paddingBottom + borderBottom + marginBottom)) + 2;
}

function measureBodyContentBottom(doc: Document) {
  const childBottom = Array.from(doc.body.children).reduce((bottom, child) => {
    const rect = child.getBoundingClientRect();
    return Math.max(bottom, rect.bottom);
  }, 0);
  if (childBottom > 0) return childBottom;
  const range = doc.createRange();
  range.selectNodeContents(doc.body);
  const rangeRect = range.getBoundingClientRect();
  range.detach();
  if (rangeRect.width || rangeRect.height) return rangeRect.bottom;
  return doc.body.getBoundingClientRect().bottom;
}

function isContentBoundOperation(action: string) {
  return action === "appendText" || action === "appendHtml";
}

function isPositionBoundOperation(action: string) {
  return action === "insertAtPosition";
}

function isTableEditAction(action: string): action is TableEditAction {
  return (tableEditActions as readonly string[]).includes(action);
}

function tableActionTitle(action: TableEditAction, headerState: TableHeaderState = defaultTableHeaderState()) {
  const titles: Record<TableEditAction, string> = {
    addRowBefore: "Add row before",
    addRowAfter: "Add row after",
    addColumnBefore: "Add column before",
    addColumnAfter: "Add column after",
    toggleHeaderRow: headerState.rowHeader ? "Remove row header" : "Set row header",
    toggleHeaderColumn: headerState.columnHeader ? "Remove column header" : "Set column header",
    distributeRows: "Distribute rows",
    distributeColumns: "Distribute columns",
    copyRow: "Copy row",
    copyColumn: "Copy column",
    moveRowUp: "Move row up",
    moveRowDown: "Move row down",
    moveColumnLeft: "Move column left",
    moveColumnRight: "Move column right",
    deleteRow: "Delete row",
    deleteColumn: "Delete column",
    deleteTable: "Delete table",
    mergeCellRight: "Merge cell right",
    mergeCellDown: "Merge cell down",
    splitCell: "Split cell",
  };
  return titles[action];
}

function shouldMergeEditorHistory(runtime: RuntimeState, operationType: string) {
  if (runtime.history.currentIndex !== runtime.history.snapshots.length - 1) return false;
  const currentSnapshot = runtime.history.snapshots[runtime.history.currentIndex];
  if (!currentSnapshot || currentSnapshot.operationType !== operationType) return false;
  if (mergeableColorOperationTypes.has(operationType)) return Date.now() - currentSnapshot.timestamp < colorHistoryMergeWindowMs;
  if (mergeableInputOperationTypes.has(operationType)) return Date.now() - currentSnapshot.timestamp < inputHistoryMergeWindowMs;
  return false;
}

function operationPanelTextLabel(mode: OperationPanelMode) {
  if (mode === "replaceSelection") return "Replacement content";
  if (mode === "insertHtml" || mode === "appendHtml") return "HTML to insert";
  if (mode === "insertAtPosition") return "Content to insert at position";
  if (mode === "appendText") return "Text to append";
  return "Text to insert";
}

function operationPanelPlaceholder(mode: OperationPanelMode) {
  if (mode === "replaceSelection") return "Replacement text or HTML...";
  if (mode === "insertHtml" || mode === "appendHtml" || mode === "insertAtPosition") return "<p>Paste HTML or text...</p>";
  if (mode === "appendText") return "Text to append...";
  return "Text to insert...";
}

function parseCustomAttributes(input: string) {
  const attributes: Record<string, string | null> = {};
  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separator = line.indexOf("=");
      if (separator < 0) {
        attributes[line] = null;
        return;
      }
      const name = line.slice(0, separator).trim();
      if (!name) return;
      attributes[name] = line.slice(separator + 1).trim();
    });
  return attributes;
}

function usableSelection(selection: SelectionState | null) {
  return Boolean(selection?.startPath || selection?.commonAncestorPath || selection?.selectedText);
}

function isFallbackOnlySelection(selection: SelectionState | null) {
  return Boolean(selection?.selectionType === "write" && selection.startPath && !selection.anchorPath && !selection.focusPath);
}

function ensureEditorSelection(
  doc: Document,
  fallbackNode: Node | null,
  input: { forceFallback?: boolean; fallbackPath?: string } = {},
) {
  const selection = doc.getSelection();
  if (!selection) return;
  if (!input.forceFallback && selection.rangeCount > 0) return;
  let element = isElementNode(fallbackNode) ? fallbackNode : fallbackNode?.parentElement;
  if (element && !doc.body.contains(element)) element = null;
  if (!element && input.fallbackPath) element = resolveRuntimePath(doc, input.fallbackPath);
  if (!element && input.fallbackPath?.startsWith("body:nth-of-type(1) > ")) {
    element = doc.body.querySelector(input.fallbackPath.replace("body:nth-of-type(1) > ", ""));
  }
  if (!element || !doc.body.contains(element)) return;
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function resolveEditorTarget(doc: Document, fallbackNode: Node | null, fallbackPath: string) {
  let element = isElementNode(fallbackNode) ? fallbackNode : fallbackNode?.parentElement ?? null;
  if (element && !doc.body.contains(element)) element = null;
  if (!element && fallbackPath) element = resolveRuntimePath(doc, fallbackPath);
  if (!element && fallbackPath.startsWith("body:nth-of-type(1) > ")) {
    element = doc.body.querySelector(fallbackPath.replace("body:nth-of-type(1) > ", ""));
  }
  if (element === doc.body) element = firstEditableChildForToolbar(doc.body);
  return element && doc.body.contains(element) ? element : null;
}

function currentSelectionElement(doc: Document) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const element = selectedElementFromSelection(selection, doc) ?? nearestElementInDocument(selection.getRangeAt(0).commonAncestorContainer, doc);
  return element && element !== doc.body ? element : null;
}

function frameEventTarget(doc: Document, event: Event) {
  const pointer = event as Event & { clientX?: number; clientY?: number };
  if (typeof pointer.clientX === "number" && typeof pointer.clientY === "number") {
    const pointed = doc.elementFromPoint(pointer.clientX, pointer.clientY);
    if (pointed && pointed !== doc.body && doc.body.contains(pointed)) return pointed;
  }
  return event.target instanceof Node ? event.target : null;
}

function readToolbarState(doc: Document, fallbackNode: Node | null, fallbackPath: string): ToolbarState {
  const selection = doc.getSelection();
  const rangeElement =
    selection && selection.rangeCount > 0
      ? selectedElementFromSelection(selection, doc) ?? nearestElementInDocument(selection.getRangeAt(0).commonAncestorContainer, doc)
      : null;
  const fallbackTarget = resolveEditorTarget(doc, fallbackNode, fallbackPath);
  const selectionTarget = nearestSelectionTarget(doc, selection);
  const target = fallbackTarget ?? (rangeElement && rangeElement !== doc.body ? rangeElement : null) ?? selectionTarget ?? firstEditableChildForToolbar(doc.body) ?? doc.body;
  const block = nearestBlockForToolbar(target, doc);
  const styleTarget = target !== doc.body && !isToolbarBlock(target) ? target : block ?? target;
  const computed = doc.defaultView?.getComputedStyle(styleTarget);
  const inline = inlineStyleOf(styleTarget);
  const backgroundTarget = target.closest("td, th") ?? styleTarget;
  const backgroundComputed = doc.defaultView?.getComputedStyle(backgroundTarget);
  const tableTarget = tableToolbarTarget(doc, target, fallbackTarget);
  const tableActions = tableTarget ? getTableActionAvailability(doc, tableTarget) : defaultTableActions();
  const tableHeaderState = tableTarget ? getTableHeaderState(doc, tableTarget) : defaultTableHeaderState();
  const selectedTableCells = getSelectedTableCells(doc);
  return {
    targetLabel: styleTarget.tagName.toLowerCase(),
    block: blockTagForToolbar(block),
    fontFamily: normalizeToolbarFont(computed?.fontFamily || ""),
    fontSize: normalizeToolbarFontSize(computed?.fontSize || ""),
    foreColor: rgbToHex(computed?.color || "") || "#111111",
    backColor: colorStyleValue(backgroundComputed?.backgroundColor) || "#fff2a8",
    lineHeight: inline?.lineHeight || "",
    letterSpacing: inline?.letterSpacing || "",
    layout: {
      marginTop: inline?.marginTop || "",
      marginRight: inline?.marginRight || "",
      marginBottom: inline?.marginBottom || "",
      marginLeft: inline?.marginLeft || "",
      paddingTop: inline?.paddingTop || "",
      paddingRight: inline?.paddingRight || "",
      paddingBottom: inline?.paddingBottom || "",
      paddingLeft: inline?.paddingLeft || "",
    },
    alignment: normalizeToolbarAlignment(computed?.textAlign || ""),
    bold: toolbarFormatActive(doc, selection, target, selectedTableCells, ["strong", "b"], (style) => Number(style.fontWeight) >= 600),
    italic: toolbarFormatActive(doc, selection, target, selectedTableCells, ["em", "i"], (style) => style.fontStyle === "italic"),
    underline: toolbarFormatActive(doc, selection, target, selectedTableCells, ["u"], (style) => style.textDecorationLine.includes("underline")),
    strikethrough: toolbarFormatActive(doc, selection, target, selectedTableCells, ["s", "strike", "del"], (style) => style.textDecorationLine.includes("line-through")),
    link: selectedTableCells.length > 0 ? selectedTableCells.some((cell) => Boolean(cell.querySelector("a"))) : Boolean(target.closest("a")) || selectionContainsLink(doc),
    list: selectedTableCells.length > 0 ? listKindForToolbarCells(selectedTableCells) : listKindForToolbar(target),
    checklist: selectedTableCells.length > 0 ? selectedTableCells.every((cell) => Boolean(cell.querySelector(':scope > ul[data-ai-checklist="true"]'))) : Boolean(target.closest('ul[data-ai-checklist="true"]')),
    table: Object.values(tableActions).some(Boolean),
    tableActions,
    tableHeaderState,
    image: Boolean(imageFromNode(target, doc)),
    attributeElement: canSetElementAttributes(doc, target),
    mutableElement: canMutateElement(doc, target),
    contentElement: canEditElementContent(doc, target),
    textSelection: Boolean(selection?.toString().trim()),
    rangeSelection: Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed),
  };
}

function selectedElementFromSelection(selection: Selection, doc: Document) {
  if (selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed || range.startContainer !== range.endContainer || range.endOffset !== range.startOffset + 1) return null;
  const selected = range.startContainer.childNodes[range.startOffset];
  return isElementNode(selected) && doc.body.contains(selected) ? selected : null;
}

function nearestSelectionTarget(doc: Document, selection: Selection | null) {
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const startElement = nearestElementInDocument(range.startContainer, doc);
  const endElement = nearestElementInDocument(range.endContainer, doc);
  return nearestBlockForToolbar(startElement, doc) ?? nearestBlockForToolbar(endElement, doc) ?? startElement ?? endElement;
}

function tableToolbarTarget(doc: Document, target: Element, fallbackTarget?: Element | null) {
  const selectedCellTarget = getSelectedTableCellTarget(doc);
  if (selectedCellTarget) return selectedCellTarget;

  const fallbackTableTarget = tableTargetFromElement(fallbackTarget);
  if (fallbackTableTarget) return fallbackTableTarget;

  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return tableTargetFromElement(target);
  }
  if (selection.isCollapsed) {
    const rangeElement = nearestElementInDocument(selection.getRangeAt(0).commonAncestorContainer, doc);
    const rangeTableTarget = rangeElement?.closest("td, th") ?? null;
    return rangeTableTarget;
  }
  const selectedElement = selectedElementFromSelection(selection, doc);
  if (selectedElement?.tagName === "TABLE" || selectedElement?.closest("td, th")) return selectedElement;

  let sharedTable: Element | null = null;
  let firstCell: Element | null = null;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const startCell = nearestElementInDocument(range.startContainer, doc)?.closest("td, th");
    const endCell = nearestElementInDocument(range.endContainer, doc)?.closest("td, th");
    const startTable = startCell?.closest("table") ?? null;
    const endTable = endCell?.closest("table") ?? null;
    if (!startCell || !endCell || !startTable || startTable !== endTable) return null;
    if (sharedTable && sharedTable !== startTable) return null;
    sharedTable = startTable;
    firstCell ??= startCell;
  }
  return firstCell;
}

function tableTargetFromElement(element: Element | null | undefined) {
  if (!element) return null;
  const targetCell = element.closest("td, th");
  return targetCell ?? (element.tagName === "TABLE" ? element : null);
}

function imageFromNode(node: Node | null, doc: Document): ImageObjectElement | null {
  const element = isElementNode(node) ? node : node?.parentElement ?? null;
  const image = element?.closest("img") ?? null;
  if (image && doc.body.contains(image)) return image as HTMLImageElement;

  let current: Element | null = element;
  while (current && current !== doc.body && current !== doc.documentElement) {
    if (isHTMLElementInDocument(current, doc) && isBackgroundImageObject(current, doc)) return current;
    current = current.parentElement;
  }
  return null;
}

function isHTMLElementInDocument(element: Element, doc: Document): element is HTMLElement {
  const ctor = doc.defaultView?.HTMLElement;
  return Boolean(ctor && element instanceof ctor);
}

function isBackgroundImageObject(element: HTMLElement, doc: Document) {
  if (!doc.body.contains(element)) return false;
  if (!backgroundImageUrl(doc.defaultView?.getComputedStyle(element).backgroundImage || "")) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 16 || rect.height < 16) return false;
  const hasImageSemantics = element.getAttribute("role") === "img" || Boolean(element.getAttribute("aria-label") || element.getAttribute("title"));
  const hasText = Boolean(element.textContent?.trim());
  return hasImageSemantics || !hasText;
}

function selectElementInDocument(doc: Document, element: Element) {
  const selection = doc.getSelection();
  if (!selection || !doc.body.contains(element)) return;
  const range = doc.createRange();
  range.selectNode(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function removeImageSelectionOverlay(doc: Document) {
  doc.querySelectorAll("[data-runtime-editor-overlay='image-selection']").forEach((node) => node.remove());
}

function positionImageSelectionOverlay(image: ImageObjectElement, overlay: HTMLElement) {
  const doc = image.ownerDocument;
  const win = doc.defaultView;
  if (!win || !doc.body.contains(image)) return;
  const rect = image.getBoundingClientRect();
  const left = rect.left + win.scrollX;
  const top = rect.top + win.scrollY;
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.width = `${Math.max(0, rect.width)}px`;
  overlay.style.height = `${Math.max(0, rect.height)}px`;
}

function imageResizeHandleStyle(handle: ResizeHandle): Partial<CSSStyleDeclaration> {
  const style: Partial<CSSStyleDeclaration> = {
    position: "absolute",
    width: "10px",
    height: "10px",
    border: "1px solid #2684ff",
    background: "#fff",
    borderRadius: "2px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
    padding: "0",
    pointerEvents: "auto",
  };
  if (handle.includes("top")) style.top = "-6px";
  if (handle.includes("bottom")) style.bottom = "-6px";
  if (handle.includes("left")) style.left = "-6px";
  if (handle.includes("right")) style.right = "-6px";
  if (handle === "top" || handle === "bottom") {
    style.left = "50%";
    style.transform = "translateX(-50%)";
    style.cursor = "ns-resize";
  } else if (handle === "left" || handle === "right") {
    style.top = "50%";
    style.transform = "translateY(-50%)";
    style.cursor = "ew-resize";
  } else if (handle === "top-left" || handle === "bottom-right") {
    style.cursor = "nwse-resize";
  } else {
    style.cursor = "nesw-resize";
  }
  return style;
}

function resizedImageSizeForHandle(handle: ResizeHandle, width: number, height: number, deltaX: number, deltaY: number) {
  const minSize = 24;
  let nextWidth = width;
  let nextHeight: number | null = null;
  if (handle.includes("right")) nextWidth = width + deltaX;
  if (handle.includes("left")) nextWidth = width - deltaX;
  if (handle.includes("bottom")) nextHeight = height + deltaY;
  if (handle.includes("top")) nextHeight = height - deltaY;
  return {
    width: Math.max(minSize, nextWidth),
    height: nextHeight === null ? null : Math.max(minSize, nextHeight),
  };
}

function upsertSelectedImageObject(doc: Document, attributes: ImageAttributes, target: Element | null, activeImage: ImageObjectElement | null) {
  const image = activeImage && activeImage.ownerDocument === doc && doc.body.contains(activeImage) ? activeImage : imageFromNode(target, doc);
  if (image && image.tagName !== "IMG") return updateBackgroundImageObject(doc, image, attributes);
  return upsertImage(doc, attributes, target);
}

function removeSelectedImageObject(doc: Document, target: Element | null, activeImage: ImageObjectElement | null) {
  const image = activeImage && activeImage.ownerDocument === doc && doc.body.contains(activeImage) ? activeImage : imageFromNode(target, doc);
  if (!image) return false;
  if (image.tagName === "IMG") return removeImage(doc, image);
  image.style.removeProperty("background-image");
  removeImageSelectionOverlay(doc);
  selectElementInDocument(doc, image);
  return image;
}

function updateBackgroundImageObject(doc: Document, image: ImageObjectElement, attributes: ImageAttributes) {
  const src = sanitizeImageSource(attributes.src);
  if (!src || !doc.body.contains(image)) return false;
  image.style.backgroundImage = cssUrlValue(src);
  if (!image.style.backgroundSize) image.style.backgroundSize = "cover";
  if (!image.style.backgroundPosition) image.style.backgroundPosition = "center";
  const width = normalizeImageCssSize(attributes.width ?? "");
  const height = normalizeImageCssSize(attributes.height ?? "");
  if (width) image.style.width = width;
  else image.style.removeProperty("width");
  if (height) image.style.height = height;
  else image.style.removeProperty("height");
  const alt = attributes.alt?.trim() ?? "";
  if (alt) {
    image.setAttribute("role", "img");
    image.setAttribute("aria-label", alt);
  } else if (image.getAttribute("role") === "img") {
    image.removeAttribute("role");
    image.removeAttribute("aria-label");
  }
  selectElementInDocument(doc, image);
  return image;
}

function sanitizeImageSource(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^(https?:|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(trimmed) ? trimmed : "";
}

function normalizeImageCssSize(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return /^(auto|[\d.]+(px|%|rem|em|vw|vh))$/i.test(trimmed) ? trimmed : "";
}

function cssUrlValue(url: string) {
  return `url("${url.replace(/["\\\n\r\f]/g, (match) => `\\${match}`)}")`;
}

function backgroundImageUrl(value: string) {
  const match = value.match(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/i);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Unable to read image file."));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read image file.")));
    reader.readAsDataURL(file);
  });
}

function imageAltFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function nearestElementInDocument(node: Node | null, doc: Document) {
  const element = isElementNode(node) ? node : node?.parentElement ?? null;
  return element && doc.body.contains(element) ? element : null;
}

function nearestBlockForToolbar(element: Element | null, doc: Document) {
  let current: Element | null = element;
  while (current && current !== doc.body) {
    if (isToolbarBlock(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function isToolbarBlock(element: Element) {
  return ["P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "LI", "TD", "TH", "DIV"].includes(element.tagName);
}

function firstEditableChildForToolbar(element: Element) {
  const child = Array.from(element.children).find((item) => item.tagName !== "BR" && !["SCRIPT", "STYLE"].includes(item.tagName));
  return isElementNode(child) ? child : null;
}

function blockTagForToolbar(element: Element | null): HeadingTag {
  const tag = element?.tagName.toLowerCase();
  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6" || tag === "blockquote") return tag;
  return "p";
}

function normalizeToolbarFont(fontFamily: string) {
  const lower = fontFamily.toLowerCase();
  if (lower.includes("courier")) return "'Courier New', monospace";
  if (lower.includes("times")) return "'Times New Roman', serif";
  if (lower.includes("georgia")) return "Georgia, serif";
  if (lower.includes("inter")) return "Inter, sans-serif";
  return "Arial, sans-serif";
}

function normalizeToolbarFontSize(fontSize: string) {
  const value = Math.round(Number.parseFloat(fontSize));
  return Number.isFinite(value) && value >= 1 && value <= 400 ? `${value}px` : "";
}

function normalizeToolbarAlignment(textAlign: string): Alignment {
  if (textAlign === "center" || textAlign === "right" || textAlign === "justify") return textAlign;
  return "left";
}

function hasAncestorTag(element: Element | null, tags: string[]) {
  let current: Element | null = element;
  while (current) {
    if (tags.includes(current.tagName.toLowerCase())) return true;
    current = current.parentElement;
  }
  return false;
}

function toolbarFormatActive(
  doc: Document,
  selection: Selection | null,
  target: Element,
  selectedTableCells: HTMLTableCellElement[],
  tags: string[],
  styleCheck: (style: CSSStyleDeclaration) => boolean,
) {
  if (selectedTableCells.length > 0) {
    return selectedTableCells.every((cell) => elementTextFullyHasFormat(doc, cell, tags, styleCheck));
  }
  if (!selection || selection.rangeCount === 0) return elementHasInlineFormat(doc, target, tags, styleCheck);
  if (selection.isCollapsed) {
    const element = nearestElementInDocument(selection.anchorNode, doc) ?? target;
    return elementHasInlineFormat(doc, element, tags, styleCheck);
  }
  return selectionTextFullyHasFormat(doc, selection, tags, styleCheck);
}

function elementHasInlineFormat(doc: Document, element: Element | null, tags: string[], styleCheck: (style: CSSStyleDeclaration) => boolean) {
  if (!element || !doc.body.contains(element)) return false;
  const style = doc.defaultView?.getComputedStyle(element);
  return hasAncestorTag(element, tags) || Boolean(style && styleCheck(style));
}

function selectionTextFullyHasFormat(doc: Document, selection: Selection, tags: string[], styleCheck: (style: CSSStyleDeclaration) => boolean) {
  let sawText = false;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (!doc.body.contains(range.commonAncestorContainer)) continue;
    for (const node of selectedTextNodesForRange(doc.body, range)) {
      const selectedText = selectedTextForNode(range, node);
      if (!selectedText.trim()) continue;
      sawText = true;
      if (!elementHasInlineFormat(doc, node.parentElement, tags, styleCheck)) return false;
    }
  }
  return sawText;
}

function elementTextFullyHasFormat(doc: Document, root: Element, tags: string[], styleCheck: (style: CSSStyleDeclaration) => boolean) {
  let sawText = false;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const text = current.textContent ?? "";
    if (text.trim()) {
      sawText = true;
      if (!elementHasInlineFormat(doc, current.parentElement, tags, styleCheck)) return false;
    }
    current = walker.nextNode();
  }
  return sawText;
}

function selectedTextNodesForRange(root: Element, range: Range) {
  const doc = root.ownerDocument;
  const nodes: Text[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (range.intersectsNode(current)) nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function selectedTextForNode(range: Range, node: Text) {
  const start = node === range.startContainer ? range.startOffset : 0;
  const end = node === range.endContainer ? range.endOffset : node.data.length;
  return node.data.slice(start, end);
}

function listKindForToolbar(element: Element | null): ListKind | null {
  const list = element?.closest("ol, ul");
  if (!list) return null;
  if (list.getAttribute("data-ai-checklist") === "true") return null;
  return list.tagName.toLowerCase() === "ol" ? "ordered" : "unordered";
}

function listKindForToolbarCells(cells: HTMLTableCellElement[]): ListKind | null {
  if (cells.length === 0) return null;
  const kinds = cells.map((cell) => {
    const list = cell.querySelector(":scope > ol, :scope > ul");
    if (!list || list.getAttribute("data-ai-checklist") === "true") return null;
    return list.tagName.toLowerCase() === "ol" ? "ordered" : "unordered";
  });
  const first = kinds[0];
  return first && kinds.every((kind) => kind === first) ? first : null;
}

function readCurrentLinkHref(doc: Document | null, fallbackNode: Node | null) {
  if (!doc) return "";
  const target = currentPanelTarget(doc, fallbackNode);
  return getCurrentLinkHref(doc, target);
}

function readCurrentLinkText(doc: Document | null, fallbackNode: Node | null) {
  if (!doc) return "";
  const target = currentPanelTarget(doc, fallbackNode);
  return getCurrentLinkText(doc, target);
}

function readCurrentImageAttributes(doc: Document | null, fallbackNode: Node | null): ImageAttributes {
  if (!doc) return { src: "", alt: "", width: "", height: "" };
  const target = currentPanelTarget(doc, fallbackNode);
  const image = imageFromNode(target ?? fallbackNode, doc);
  if (image && image.tagName !== "IMG") {
    const computed = doc.defaultView?.getComputedStyle(image);
    return {
      src: backgroundImageUrl(computed?.backgroundImage || image.style.backgroundImage || ""),
      alt: image.getAttribute("aria-label") ?? image.getAttribute("title") ?? "",
      width: image.style.width || "",
      height: image.style.height || "",
    };
  }
  return getCurrentImageAttributes(doc, target);
}

function readCurrentAttributes(doc: Document | null, fallbackNode: Node | null): AttributeDraft {
  if (!doc) return { id: "", className: "", title: "", custom: "" };
  const target = currentPanelTarget(doc, fallbackNode);
  if (!target || target === doc.body || target === doc.documentElement) return { id: "", className: "", title: "", custom: "" };
  const custom = Array.from(target.attributes)
    .filter((attribute) => !["id", "class", "title"].includes(attribute.name))
    .filter((attribute) => isReadableCustomAttribute(attribute.name))
    .map((attribute) => `${attribute.name}=${attribute.value}`)
    .join("\n");
  return {
    id: target.getAttribute("id") ?? "",
    className: target.getAttribute("class") ?? "",
    title: target.getAttribute("title") ?? "",
    custom,
  };
}

function isReadableCustomAttribute(name: string) {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z_:][a-z0-9_:.-]*$/i.test(normalized)) return false;
  if (normalized.startsWith("on") || normalized === "srcdoc") return false;
  return (
    normalized === "style" ||
    normalized === "role" ||
    normalized.startsWith("data-") ||
    normalized.startsWith("aria-") ||
    ["href", "xlink:href", "src", "poster", "cite", "action", "formaction", "target", "rel", "name", "value", "type"].includes(normalized)
  );
}

function readCurrentStyles(doc: Document | null, fallbackNode: Node | null): ElementStyleAttributes {
  if (!doc) return {};
  const target = currentPanelTarget(doc, fallbackNode) ?? doc.body;
  const element = styleTargetForToolbar(target, doc);
  const inline = inlineStyleOf(element);
  return {
    width: inline?.width || "",
    height: inline?.height || "",
    lineHeight: inline?.lineHeight || "",
    letterSpacing: inline?.letterSpacing || "",
    verticalAlign: inline?.verticalAlign || "",
    borderWidth: inline?.borderWidth || "",
    borderStyle: inline?.borderStyle || "",
    borderColor: inline?.borderColor || "",
    borderRadius: inline?.borderRadius || "",
    padding: inline?.padding || "",
    paddingTop: inline?.paddingTop || "",
    paddingRight: inline?.paddingRight || "",
    paddingBottom: inline?.paddingBottom || "",
    paddingLeft: inline?.paddingLeft || "",
    marginTop: inline?.marginTop || "",
    marginRight: inline?.marginRight || "",
    marginBottom: inline?.marginBottom || "",
    marginLeft: inline?.marginLeft || "",
  };
}

function currentPanelTarget(doc: Document, fallbackNode: Node | null) {
  return resolveEditorTarget(doc, fallbackNode, "") ?? currentSelectionElement(doc);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function shouldSkipToolbarSelectionPreserve(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-toolbar-skip-selection-preserve="true"]'));
}

function shouldKeepEditorSelectionOnToolbarCommand(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button")) && !Boolean(target.closest("input, textarea, select"));
}

function styleTargetForToolbar(target: Element, doc: Document) {
  const cell = target.closest("td, th");
  if (cell && doc.body.contains(cell)) return cell;
  return nearestBlockForToolbar(target, doc) ?? target;
}

function inlineStyleOf(element: Element | null) {
  return element && "style" in element ? (element as HTMLElement).style : null;
}

function styleValue(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized === "normal" || normalized === "none" || normalized === "normal normal") return "";
  return normalized;
}

function colorStyleValue(value: string | undefined) {
  const normalized = styleValue(value);
  if (!normalized || normalized === "transparent" || normalized === "rgba(0, 0, 0, 0)") return "";
  return rgbToHex(normalized) || normalized;
}

function rgbToHex(color: string) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

function isElementNode(node: unknown): node is Element {
  return Boolean(node && typeof node === "object" && (node as Node).nodeType === 1 && "tagName" in node);
}

function resolveRuntimePath(doc: Document, path: string) {
  const parts = path.split(" > ").filter(Boolean);
  let current: Element | null = doc.documentElement;
  for (const part of parts) {
    const match = part.match(/^([a-z0-9-]+)(?::nth-of-type\((\d+)\))?$/i);
    if (!match) return null;
    const tag = match[1].toLowerCase();
    const index = Number(match[2] ?? "1") - 1;
    if (tag === "html") {
      current = doc.documentElement;
      continue;
    }
    if (tag === "body") {
      current = doc.body;
      continue;
    }
    const children: Element[] = Array.from(current.children).filter((child): child is Element => child.tagName.toLowerCase() === tag);
    current = children[index] ?? null;
    if (!current) return null;
  }
  return isElementNode(current) ? current : null;
}
