import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronUp,
  Columns2,
  Copy,
  Crosshair,
  Grid2X2,
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
  Paintbrush,
  PanelBottom,
  PanelLeft,
  PanelLeftRightDashed,
  PanelRight,
  PanelTop,
  PanelTopBottomDashed,
  RefreshCcw,
  Redo2,
  RotateCcw,
  Rows3,
  SlidersHorizontal,
  Strikethrough,
  Table2,
  TableCellsMerge,
  TableCellsSplit,
  Underline,
  Undo2,
  Unlink2,
} from "lucide-react";
import {
  ColorSwatch,
  FontSizeControl,
  IconButton,
  IconButtonLight,
  ToolbarDivider,
  ToolbarGroup,
  ToolbarLetterSpacingMenu,
  ToolbarLineHeightMenu,
  ToolbarMoreMenu,
  ToolbarParagraphSpacingMenu,
  ToolbarSelect,
  type ParagraphSpacingValue,
  type ToolbarMoreOption,
} from "./toolbarPrimitives";
import { HomePage } from "./HomePage";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { DocxPreview } from "./DocxPreview";
import { MarkdownEditor } from "./MarkdownEditor";
import { useAgentConversation } from "./useAgentConversation";
import { clearProjectHistory, createProject, getProject, listProjects, startAiEdit, updateProject } from "../api/projects";
import { fetchGensparkStudyPlanFixture } from "../api/fixtures";
import { fetchBootstrapSnapshot, fetchLocalAgentProviders } from "../api/runtime";
import type { DocumentProject, DocumentRunTimelineItem, DocumentType, LocalAgentProviderStatus, RuntimeProfile } from "@ai-document/shared";
import { createEmptyDocxDocumentManifest, serializeDocxDocumentManifest } from "@ai-document/shared";
import { DocxArtifactRuntimeAdapter } from "../artifacts/docxArtifactAdapter";
import { HtmlArtifactRuntimeAdapter } from "../artifacts/htmlArtifactAdapter";
import { MarkdownArtifactRuntimeAdapter, defaultMarkdownDocument } from "../artifacts/markdownArtifactAdapter";
import { useDocxArtifactRuntime } from "../artifacts/useDocxArtifactRuntime";
import { useHtmlArtifactRuntime } from "../artifacts/useHtmlArtifactRuntime";
import { useMarkdownArtifactRuntime } from "../artifacts/useMarkdownArtifactRuntime";
import { RuntimeApplier } from "../runtime/applier";
import { runtimeDocumentFromFrame } from "../runtime/document";
import { blankHtmlDocument } from "../runtime/documentSeeds";
import { enableEditableFrame } from "../runtime/frame";
import {
  applyInlineFormat,
  applyPresentationStyle,
  appendToElement,
  beginTableCellSelection,
  canEditElementContent,
  canMutateElement,
  canSetElementAttributes,
  clearFormat,
  clearTableCellSelection,
  cleanupAbandonedTypingStyleMarkers,
  cleanupTypingStyleMarkers,
  copyCurrentPresentationStyle,
  createLink,
  deleteSelectedElement,
  duplicateElement,
  editTable,
  getCurrentLinkHref,
  getCurrentImageAttributes,
  getEditorStats,
  getSelectedTableCells,
  getSelectedTableCellTarget,
  getTableActionAvailability,
  getTableHeaderState,
  indentBlock,
  insertAtPosition,
  insertHorizontalRule,
  insertHtml,
  insertTable,
  insertText,
  moveCursorToEnd,
  moveCursorToStart,
  normalizeLinkUrl,
  outdentBlock,
  replaceSelection,
  removeImage,
  removeLink,
  selectionContainsLink,
  setAlignment,
  setBackColor,
  clearTableColumnWidth,
  clearTableRowHeight,
  setElementAttributes,
  setElementStyle,
  setForeColor,
  setFontFamily,
  setFontSize,
  setHeading,
  setTableCellBorders,
  setTableColumnWidth,
  setTableRowHeight,
  tableEditActions,
  toggleChecklist,
  toggleList,
  updateTableCellSelection,
  upsertImage,
  wrapSelection,
  type AdjacentInsertPosition,
  type Alignment,
  type ElementStyleAttributes,
  type HeadingTag,
  type ImageAttributes,
  type InlineFormatTag,
  type ListKind,
  type PresentationStyle,
  type TableActionAvailability,
  type TableBorderAction,
  type TableEditAction,
  type TableHeaderState,
} from "../runtime/operations";
import { captureSelectionState, restoreSelectionState } from "../runtime/selection";
import { applyRuntimeSnapshot, createRuntimeSnapshot } from "../runtime/snapshot";
import type { RuntimeState, SelectionState } from "../runtime/types";
import {
  allTemplatesLabel,
  templateCategories,
  templateCounts,
  templatesForCategory,
  type GensparkTemplate,
} from "../templates/gensparkTemplates";
import { useHomeAttachments } from "./useHomeAttachments";

type ToolbarState = {
  block: HeadingTag;
  fontFamily: string;
  fontSize: string;
  foreColor: string;
  backColor: string;
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
  "color",
  "style",
  "table",
] as const;
type OperationPanelMode = (typeof operationPanelModes)[number] | null;

type EditorStats = ReturnType<typeof getEditorStats>;
type HomePanel = "templates" | "history";

const defaultToolbarState: ToolbarState = {
  block: "p",
  fontFamily: "Arial, sans-serif",
  fontSize: "",
  foreColor: "#111111",
  backColor: "#fff2a8",
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
  color: "Color",
  style: "Style",
  table: "Table",
};
const mergeableColorOperationTypes = new Set(["setForeColor", "setBackColor", "color"]);
const colorHistoryMergeWindowMs = 2000;
const mergeableInputOperationTypes = new Set(["input"]);
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
  const tableCellSelectionDraggingRef = useRef(false);
  const tableCellSelectionAnchorRef = useRef<HTMLTableCellElement | null>(null);
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
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState(allTemplatesLabel);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(defaultToolbarState);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("https://");
  const [operationPanelMode, setOperationPanelMode] = useState<OperationPanelMode>(null);
  const [operationDraft, setOperationDraft] = useState("");
  const [operationPosition, setOperationPosition] = useState<AdjacentInsertPosition>("afterend");
  const [operationIsHtml, setOperationIsHtml] = useState(false);
  const [operationWrapperTag, setOperationWrapperTag] = useState("span");
  const [attributeDraft, setAttributeDraft] = useState<AttributeDraft>({ id: "", className: "", title: "", custom: "" });
  const [imageDraft, setImageDraft] = useState<ImageAttributes>({ src: "", alt: "", width: "", height: "" });
  const [colorDraft, setColorDraft] = useState({ foreColor: "#111111", backColor: "#fff2a8" });
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
    marginTop: "",
    marginBottom: "",
  });
  const [editorStats, setEditorStats] = useState<EditorStats>({ characterCount: 0, wordCount: 0, paragraphCount: 0, elementCount: 0 });
  const [toolbarExpanded, setToolbarExpanded] = useState(true);
  const [formatClipboard, setFormatClipboard] = useState<PresentationStyle | null>(null);
  const editorOpen = route.name === "document";
  const currentProjectId = route.name === "document" ? route.projectId : null;
  const currentDocumentType = currentProject?.type ?? "html";
  const activeDirty =
    currentDocumentType === "markdown"
      ? markdownSaveState !== "saved"
      : currentDocumentType === "docx"
        ? docxSaveState !== "saved"
        : saveState !== "saved";
  const activeSelectionText =
    currentDocumentType === "markdown"
      ? markdownRuntime?.selection.selectedText ?? ""
      : currentDocumentType === "docx"
        ? docxRuntime?.selection.selectedText ?? ""
        : runtime?.activeSelection?.selectedText ?? "";

  const filteredTemplates = useMemo(
    () => templatesForCategory(selectedTemplateCategory),
    [selectedTemplateCategory],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchBootstrapSnapshot(), fetchLocalAgentProviders()])
      .then(([snapshot, providerStatus]) => {
        if (cancelled) return;
        const enabledProfiles = snapshot.runtimeProfiles.filter((profile) => profile.enabled && profile.kind === "local-agent");
        setRuntimeProfiles(enabledProfiles);
        setLocalAgentProviders(providerStatus.providers);
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
    tableCellSelectionDraggingRef.current = false;
    tableCellSelectionAnchorRef.current = null;
    setFormatClipboard(null);
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
    setFormatClipboard(null);
    setEditorStats({ characterCount: content.length, wordCount: markdownWordCount(content), paragraphCount: 0, elementCount: 0 });
  };

  const loadDocxDocument = async (project: DocumentProject) => {
    clearArtifact();
    clearMarkdownArtifact();
    setToolbarState(defaultToolbarState);
    lastEditorTargetRef.current = null;
    lastResolvedTargetRef.current = null;
    lastSelectionRef.current = null;
    tableCellSelectionDraggingRef.current = false;
    tableCellSelectionAnchorRef.current = null;
    setFormatClipboard(null);
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

  const handleFrameLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
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
    const supportsPointerEvents = Boolean(doc.defaultView?.PointerEvent);
    const tableSelectionStartEvents = supportsPointerEvents ? ["pointerdown"] : ["mousedown"];
    const tableSelectionMoveEvents = supportsPointerEvents ? ["pointermove"] : ["mousemove"];
    const tableSelectionEndEvents = supportsPointerEvents ? ["pointerup", "pointercancel"] : ["mouseup"];
    const syncTableSelectionFromPointer = (event: Event) => {
      const target = frameEventTarget(doc, event);
      if (tableSelectionStartEvents.includes(event.type)) {
        const cell = tableCellFromNode(target, doc);
        tableCellSelectionAnchorRef.current = cell;
        tableCellSelectionDraggingRef.current = false;
        if (!cell) clearTableCellSelection(doc);
        lastEditorTargetRef.current = cell ?? target;
        syncSelection(lastEditorTargetRef.current);
        return;
      }
      if (tableSelectionMoveEvents.includes(event.type)) {
        const anchor = tableCellSelectionAnchorRef.current;
        if (!anchor) return;
        const targetCell = tableCellFromNode(target, doc);
        if (!targetCell || targetCell === anchor || targetCell.closest("table") !== anchor.closest("table")) return;
        if (!tableCellSelectionDraggingRef.current) {
          beginTableCellSelection(doc, anchor);
          tableCellSelectionDraggingRef.current = true;
        }
        const cell = updateTableCellSelection(doc, target);
        if (!cell) return;
        event.preventDefault();
        clearNativeSelection(doc);
        lastEditorTargetRef.current = cell;
        syncSelection(cell);
        return;
      }
      if (tableSelectionEndEvents.includes(event.type)) {
        if (tableCellSelectionDraggingRef.current) {
          const cell = updateTableCellSelection(doc, target) ?? getSelectedTableCellTarget(doc);
          tableCellSelectionDraggingRef.current = false;
          tableCellSelectionAnchorRef.current = null;
          clearNativeSelection(doc);
          lastEditorTargetRef.current = cell ?? target;
          syncSelection(lastEditorTargetRef.current);
          return;
        }
        tableCellSelectionAnchorRef.current = null;
        clearTableCellSelection(doc);
        queueSelectionSync(target);
      }
    };
    doc.addEventListener("keyup", syncFromFrameEvent, true);
    tableSelectionStartEvents.forEach((eventName) => doc.addEventListener(eventName, syncTableSelectionFromPointer, true));
    tableSelectionMoveEvents.forEach((eventName) => doc.addEventListener(eventName, syncTableSelectionFromPointer, true));
    tableSelectionEndEvents.forEach((eventName) => doc.addEventListener(eventName, syncTableSelectionFromPointer, true));
    doc.addEventListener("click", syncFromFrameEvent, true);
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
    mutate: (doc: Document, target: Element | null) => boolean | Element;
  }) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !runtime) return false;
    const shouldMergeHistory = shouldMergeEditorHistory(runtime, input.operationType);
    const liveSelectionTarget = currentSelectionElement(doc);
    const stableTarget = liveSelectionTarget ?? lastResolvedTargetRef.current ?? null;
    const liveSelection = captureSelectionState(doc, stableTarget ?? lastEditorTargetRef.current);
    const operationSelection = usableSelection(liveSelection) ? liveSelection : lastSelectionRef.current ?? runtime.activeSelection;
    if (input.requiresSelection && (!operationSelection || operationSelection.selectionType === "write")) return false;
    const operationFallbackPath = operationSelection?.commonAncestorPath ?? "";
    const hasRangeSelection = Boolean(operationSelection && operationSelection.selectionType !== "write");
    const target = hasRangeSelection
      ? resolveEditorTarget(doc, null, operationFallbackPath) ?? stableTarget
      : resolveEditorTarget(doc, stableTarget ?? lastEditorTargetRef.current, operationFallbackPath) ?? stableTarget;
    restoreSelectionState(doc, operationSelection);
    ensureEditorSelection(doc, target ?? lastEditorTargetRef.current, {
      forceFallback: !hasRangeSelection && !operationSelection?.startPath,
      fallbackPath: operationFallbackPath,
    });
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
      changed = input.mutate(doc, target);
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
    const hasLinkableSelection = Boolean(liveSelection && liveSelection.selectionType !== "write");
    const hasStoredLinkableSelection = Boolean(runtime?.activeSelection && runtime.activeSelection.selectionType !== "write");
    const hasInsertionTarget = Boolean(liveTarget ?? lastEditorTargetRef.current);
    if (!currentHref && !hasLinkableSelection && !hasStoredLinkableSelection && !toolbarState.table && !hasInsertionTarget) return;
    const selectedTextUrl = normalizeLinkUrl(liveSelection?.selectedText || runtime?.activeSelection?.selectedText || "");
    setLinkDraft(currentHref || selectedTextUrl || "https://");
    setOperationPanelMode(null);
    setLinkEditorOpen((current) => !current);
  };

  const applyLink = (url: string) => {
    if (!url.trim() || url.trim() === "https://") return;
    const applied = executeEditorOperation({
      operationType: "createLink",
      description: "Create link",
      mutate: (doc, target) => createLink(doc, url, target),
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
      mutate: (doc, target) => setFontFamily(doc, fontFamily, target),
    });
  };

  const applyFontSize = (fontSize: string) => {
    executeEditorOperation({
      operationType: "setFontSize",
      description: `Set font size ${fontSize}`,
      mutate: (doc, target) => setFontSize(doc, fontSize, target),
    });
  };

  const applyAlignment = (alignment: Alignment) => {
    executeEditorOperation({
      operationType: "setAlignment",
      description: `Set alignment ${alignment}`,
      mutate: (doc, target) => setAlignment(doc, alignment, target),
    });
  };

  const copyFormat = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const target =
      currentSelectionElement(doc) ??
      lastResolvedTargetRef.current ??
      resolveEditorTarget(doc, lastEditorTargetRef.current, lastSelectionRef.current?.commonAncestorPath ?? runtime?.activeSelection?.commonAncestorPath ?? "");
    const style = copyCurrentPresentationStyle(doc, target);
    if (style) setFormatClipboard(style);
  };

  const pasteFormat = () => {
    if (!formatClipboard) return;
    executeEditorOperation({
      operationType: "applyPresentationStyle",
      description: "Apply copied format",
      mutate: (doc, target) => applyPresentationStyle(doc, formatClipboard, target),
    });
  };

  const applyList = (kind: ListKind) => {
    executeEditorOperation({
      operationType: `toggle_${kind}_list`,
      description: `Toggle ${kind} list`,
      mutate: (doc, target) => toggleList(doc, kind, target),
    });
  };

  const applyToolbarMoreAction = (action: string) => {
    if (!action) return;
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
      if (action === "color") {
        setColorDraft(readCurrentColors(iframeRef.current?.contentDocument ?? null, lastEditorTargetRef.current));
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
        mutate: (doc, target) => removeImage(doc, target),
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
      if (!toolbarState.contentElement) return;
      executeEditorOperation({
        operationType: "moveCursorToStart",
        description: "Move cursor to start",
        mutate: (doc, target) => (target ? moveCursorToStart(doc, target) : false),
      });
    } else if (action === "cursorEnd") {
      if (!toolbarState.contentElement) return;
      executeEditorOperation({
        operationType: "moveCursorToEnd",
        description: "Move cursor to end",
        mutate: (doc, target) => (target ? moveCursorToEnd(doc, target) : false),
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
        if (operationPanelMode === "image") return upsertImage(doc, imageDraft, target);
        if (operationPanelMode === "color") {
          const foregroundApplied = colorDraft.foreColor ? setForeColor(doc, colorDraft.foreColor, target) : false;
          const backgroundApplied = colorDraft.backColor ? setBackColor(doc, colorDraft.backColor, target) : false;
          return foregroundApplied || backgroundApplied;
        }
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
    <main className="h-screen overflow-hidden bg-[#1f1f1f] text-white">
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
        <section className="grid h-full grid-cols-[minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          <AgentConversationPanel
            activeSelectionText={activeSelectionText}
            dirty={activeDirty}
            error={error || agentConversation.error}
            items={agentConversation.items}
            loading={agentConversation.loading}
            sending={agentBusy}
            onBackHome={() => setRoute(pushHomeRoute())}
            onSend={sendAgentPrompt}
          />
          <MarkdownEditor
            runtime={markdownRuntime}
            dirty={activeDirty}
            loading={loading}
            onBackHome={() => setRoute(pushHomeRoute())}
            onUndo={undoMarkdown}
            onRedo={redoMarkdown}
            onChange={(content, selection) => {
              updateMarkdownContent(content, selection);
              setEditorStats({ characterCount: content.length, wordCount: markdownWordCount(content), paragraphCount: markdownParagraphCount(content), elementCount: 0 });
            }}
            onSelectionChange={updateMarkdownSelection}
          />
        </section>
      ) : currentDocumentType === "docx" && docxRuntime ? (
        <section className="grid h-full grid-cols-[minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          <AgentConversationPanel
            activeSelectionText={activeSelectionText}
            dirty={activeDirty}
            error={error || docxError || agentConversation.error}
            items={agentConversation.items}
            loading={agentConversation.loading}
            sending={agentBusy}
            onBackHome={() => setRoute(pushHomeRoute())}
            onSend={sendAgentPrompt}
          />
          <DocxPreview
            runtime={docxRuntime}
            dirty={activeDirty}
            error={docxError}
            loading={loading || docxLoading}
            onBackHome={() => setRoute(pushHomeRoute())}
            onSelectionChange={updateDocxSelection}
          />
        </section>
      ) : (
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
          toolbarState={toolbarState}
          toolbarExpanded={toolbarExpanded}
          linkDraft={linkDraft}
          linkEditorOpen={linkEditorOpen}
          operationDraft={operationDraft}
          operationIsHtml={operationIsHtml}
          operationPanelMode={operationPanelMode}
          operationPosition={operationPosition}
          operationWrapperTag={operationWrapperTag}
          attributeDraft={attributeDraft}
          imageDraft={imageDraft}
          colorDraft={colorDraft}
          tableDraft={tableDraft}
          styleDraft={styleDraft}
          onBackHome={() => setRoute(pushHomeRoute())}
          onBackColor={(color) => executeEditorOperation({
            operationType: "setBackColor",
            description: `Set background color ${color}`,
            mutate: (doc, target) => setBackColor(doc, color, target),
          })}
          onClearFormat={() => executeEditorOperation({
            operationType: "clearFormat",
            description: "Clear formatting",
            mutate: (doc, target) => clearFormat(doc, target),
          })}
          onApplyLink={applyLink}
          onCreateLink={openLinkEditor}
          onLinkDraftChange={setLinkDraft}
          onApplyOperation={applyOperationPanel}
          onAttributeDraftChange={setAttributeDraft}
          onCloseOperation={() => setOperationPanelMode(null)}
          onOperationDraftChange={setOperationDraft}
          onOperationHtmlChange={setOperationIsHtml}
          onImageDraftChange={setImageDraft}
          onCopyFormat={copyFormat}
          onColorDraftChange={setColorDraft}
          onTableDraftChange={setTableDraft}
          onStyleDraftChange={setStyleDraft}
          onVerticalAlign={(verticalAlign) => executeEditorOperation({
            operationType: "setVerticalAlign",
            description: `Set vertical align ${verticalAlign}`,
            mutate: (doc, target) => setElementStyle(doc, target, { verticalAlign }),
          })}
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
          onParagraphSpacing={(spacing) => executeEditorOperation({
            operationType: "setParagraphSpacing",
            description: `Set paragraph spacing ${spacing.label}`,
            mutate: (doc, target) => setElementStyle(doc, target, { marginTop: spacing.marginTop, marginBottom: spacing.marginBottom }),
          })}
          onTableBorder={(borderAction) => executeEditorOperation({
            operationType: "setTableCellBorders",
            description: `Set table cell border ${borderAction}`,
            mutate: (doc, target) => setTableCellBorders(doc, borderAction, target, {
              width: styleDraft.borderWidth,
              style: styleDraft.borderStyle,
              color: styleDraft.borderColor,
            }),
          })}
          onTableColumnWidth={(mode) => executeEditorOperation({
            operationType: mode === "clear" ? "clearTableColumnWidth" : "setTableColumnWidth",
            description: mode === "clear" ? "Clear table column width" : `Set table column width ${styleDraft.width || "auto"}`,
            mutate: (doc, target) => (mode === "clear" ? clearTableColumnWidth(doc, target) : setTableColumnWidth(doc, target, styleDraft.width ?? "")),
          })}
          onTableRowHeight={(mode) => executeEditorOperation({
            operationType: mode === "clear" ? "clearTableRowHeight" : "setTableRowHeight",
            description: mode === "clear" ? "Clear table row height" : `Set table row height ${styleDraft.height || "auto"}`,
            mutate: (doc, target) => (mode === "clear" ? clearTableRowHeight(doc, target) : setTableRowHeight(doc, target, styleDraft.height ?? "")),
          })}
          onOperationPositionChange={setOperationPosition}
          onOperationWrapperTagChange={setOperationWrapperTag}
          onRemoveLink={applyRemoveLink}
          onForeColor={(color) => executeEditorOperation({
            operationType: "setForeColor",
            description: `Set foreground color ${color}`,
            mutate: (doc, target) => setForeColor(doc, color, target),
          })}
          onAlignment={applyAlignment}
          onFontFamily={applyFontFamily}
          onFontSize={applyFontSize}
          onFormat={applyFormat}
          onHeading={applyHeading}
          onHorizontalRule={() => executeEditorOperation({
            operationType: "insertHorizontalRule",
            description: "Insert horizontal rule",
            mutate: insertHorizontalRule,
          })}
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
          onRedo={() => applyHistoryOffset(1)}
          onResetFrame={resetFrameFromRuntime}
          onSelection={syncSelection}
          onPasteFormat={pasteFormat}
          hasCopiedFormat={Boolean(formatClipboard)}
          onToolbarInteractionStart={preserveEditorSelection}
          onUndo={() => applyHistoryOffset(-1)}
          onToggleToolbar={() => setToolbarExpanded((current) => !current)}
          onFrameLoad={handleFrameLoad}
        />
      )}
    </main>
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
  colorDraft: { foreColor: string; backColor: string };
  tableDraft: { rows: string; columns: string };
  styleDraft: ElementStyleAttributes;
  linkDraft: string;
  linkEditorOpen: boolean;
  loading: boolean;
  operationDraft: string;
  operationIsHtml: boolean;
  operationPanelMode: OperationPanelMode;
  operationPosition: AdjacentInsertPosition;
  operationWrapperTag: string;
  runtime: RuntimeState | null;
  toolbarState: ToolbarState;
  toolbarExpanded: boolean;
  hasCopiedFormat: boolean;
  onAlignment: (alignment: Alignment) => void;
  onApplyLink: (url: string) => void;
  onApplyOperation: () => void;
  onAttributeDraftChange: (value: AttributeDraft) => void;
  onBackColor: (color: string) => void;
  onBackHome: () => void;
  onClearFormat: () => void;
  onCloseOperation: () => void;
  onCopyFormat: () => void;
  onColorDraftChange: (value: { foreColor: string; backColor: string }) => void;
  onTableDraftChange: (value: { rows: string; columns: string }) => void;
  onStyleDraftChange: (value: ElementStyleAttributes) => void;
  onVerticalAlign: (verticalAlign: "top" | "middle" | "bottom") => void;
  onLineHeight: (lineHeight: string) => void;
  onLetterSpacing: (letterSpacing: string) => void;
  onParagraphSpacing: (spacing: ParagraphSpacingValue) => void;
  onTableBorder: (borderAction: TableBorderAction) => void;
  onTableColumnWidth: (mode: "apply" | "clear") => void;
  onTableRowHeight: (mode: "apply" | "clear") => void;
  onCreateLink: () => void;
  onFontFamily: (fontFamily: string) => void;
  onFontSize: (fontSize: string) => void;
  onFrameLoad: () => void;
  onForeColor: (color: string) => void;
  onFormat: (tagName: InlineFormatTag) => void;
  onHeading: (tagName: HeadingTag) => void;
  onHorizontalRule: () => void;
  onImageDraftChange: (value: ImageAttributes) => void;
  onIndent: () => void;
  onChecklist: () => void;
  onList: (kind: ListKind) => void;
  onLinkDraftChange: (value: string) => void;
  onLoadFixture: () => void;
  onMoreAction: (action: string) => void;
  onMutation: (operationType: string, description: string) => void;
  onOperationDraftChange: (value: string) => void;
  onOperationHtmlChange: (value: boolean) => void;
  onOperationPositionChange: (value: AdjacentInsertPosition) => void;
  onOperationWrapperTagChange: (value: string) => void;
  onOutdent: () => void;
  onPasteFormat: () => void;
  onSendAgentPrompt: (prompt: string) => Promise<void>;
  onRemoveLink: () => void;
  onRedo: () => void;
  onResetFrame: () => void;
  onSelection: () => void;
  onToolbarInteractionStart: () => void;
  onToggleToolbar: () => void;
  onUndo: () => void;
}) {
  const canUndo = Boolean(props.runtime && props.runtime.history.currentIndex > 0);
  const canRedo = Boolean(props.runtime && props.runtime.history.currentIndex < props.runtime.history.snapshots.length - 1);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [lineHeightMenuOpen, setLineHeightMenuOpen] = useState(false);
  const [letterSpacingMenuOpen, setLetterSpacingMenuOpen] = useState(false);
  const [paragraphSpacingMenuOpen, setParagraphSpacingMenuOpen] = useState(false);
  const hasPreservedRangeSelection = Boolean(props.runtime?.activeSelection && props.runtime.activeSelection.selectionType !== "write");
  const canUseRangeSelection = props.toolbarState.rangeSelection || hasPreservedRangeSelection;
  const canCreateLink = canUseRangeSelection || props.toolbarState.table || props.toolbarState.contentElement;
  const moreOptions = toolbarMoreOptions(props.toolbarState, canUseRangeSelection);

  return (
    <section className="grid h-full grid-cols-[minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
      <AgentConversationPanel
        activeSelectionText={props.activeSelectionText}
        dirty={props.dirty}
        error={props.error || props.agentConversationError}
        items={props.agentConversationItems}
        loading={props.agentConversationLoading}
        sending={props.agentSending}
        onBackHome={props.onBackHome}
        onSend={props.onSendAgentPrompt}
      />

      <section className="relative flex min-h-0 flex-col bg-[#1f1f1f]">
        <header className="flex h-12 items-center justify-between border-b border-white/8 px-5">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white">{props.runtime?.title ?? "Untitled Document"}</div>
            <div className="text-[11px] text-white/38">
              {props.dirty ? "Unsaved changes" : "Saved"} · {props.editorStats.wordCount} words · {props.editorStats.elementCount} elements
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconButton disabled={props.loading} title="Reload template" onClick={props.onLoadFixture}>
              {props.loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCcw size={15} />}
            </IconButton>
            <IconButton disabled={!props.runtime} title="Reset iframe from RuntimeState" onClick={props.onResetFrame}>
              <RotateCcw size={15} />
            </IconButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#2a2a2a] px-3 py-4 md:px-6 md:py-6">
          <div
            className="sticky top-0 z-10 mx-auto mb-4 w-full max-w-[1500px] rounded-2xl border border-black/[0.04] bg-white px-3 py-2 text-[#202124] shadow-[0_10px_28px_rgba(0,0,0,0.12)] [&_svg]:size-4"
            onMouseDownCapture={(event) => {
              if (!shouldSkipToolbarSelectionPreserve(event.target)) props.onToolbarInteractionStart();
              if (shouldKeepEditorSelectionOnToolbarCommand(event.target)) event.preventDefault();
            }}
            onPointerDownCapture={(event) => {
              if (!shouldSkipToolbarSelectionPreserve(event.target)) props.onToolbarInteractionStart();
            }}
          >
            <div className="toolbar-scroll flex min-w-0 items-center gap-1.5 overflow-x-auto">
              <ToolbarGroup>
                <IconButtonLight disabled={!canUndo} title="Undo" onClick={props.onUndo}><Undo2 size={18} /></IconButtonLight>
                <IconButtonLight disabled={!canRedo} title="Redo" onClick={props.onRedo}><Redo2 size={18} /></IconButtonLight>
              </ToolbarGroup>
              <ToolbarDivider />
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
                <IconButtonLight active={props.toolbarState.list === "ordered"} title="Numbered list" onClick={() => props.onList("ordered")}><ListOrdered size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.list === "unordered"} title="Bulleted list" onClick={() => props.onList("unordered")}><List size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.checklist} title="Checklist" onClick={props.onChecklist}><ListTodo size={19} /></IconButtonLight>
                <IconButtonLight title="Indent" onClick={props.onIndent}><IndentIncrease size={19} /></IconButtonLight>
                <IconButtonLight title="Outdent" onClick={props.onOutdent}><IndentDecrease size={19} /></IconButtonLight>
                <IconButtonLight active={props.toolbarState.alignment === "justify"} title="Justify" onClick={() => props.onAlignment("justify")}><AlignJustify size={19} /></IconButtonLight>
                <ToolbarLineHeightMenu
                  open={lineHeightMenuOpen}
                  onOpenChange={setLineHeightMenuOpen}
                  onSelect={(lineHeight) => {
                    setLineHeightMenuOpen(false);
                    props.onLineHeight(lineHeight);
                  }}
                />
                <ToolbarLetterSpacingMenu
                  open={letterSpacingMenuOpen}
                  onOpenChange={setLetterSpacingMenuOpen}
                  onSelect={(letterSpacing) => {
                    setLetterSpacingMenuOpen(false);
                    props.onLetterSpacing(letterSpacing);
                  }}
                />
                <ToolbarParagraphSpacingMenu
                  open={paragraphSpacingMenuOpen}
                  onOpenChange={setParagraphSpacingMenuOpen}
                  onSelect={(spacing) => {
                    setParagraphSpacingMenuOpen(false);
                    props.onParagraphSpacing(spacing);
                  }}
                />
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <IconButtonLight title="Color" onClick={() => props.onMoreAction("color")}>
                  <span className="grid size-4 place-items-center border-b-2 text-[16px] font-bold leading-none" style={{ borderColor: props.toolbarState.foreColor }}>A</span>
                </IconButtonLight>
                <ColorSwatch title="Current text color" color={props.toolbarState.foreColor} onClick={() => props.onForeColor(props.toolbarState.foreColor)} />
              </ToolbarGroup>
            </div>

            {props.toolbarExpanded ? (
            <div className="toolbar-scroll mt-1.5 flex min-w-0 items-center gap-1.5 overflow-x-auto">
              <ToolbarGroup>
                <IconButtonLight title="Fill color" onClick={() => props.onMoreAction("color")}><PaintBucket size={18} /></IconButtonLight>
                <ColorSwatch title="Current fill color" color={props.toolbarState.backColor} onClick={() => props.onBackColor(props.toolbarState.backColor)} />
                <IconButtonLight title="Copy format" onClick={props.onCopyFormat}><Paintbrush size={18} /></IconButtonLight>
                <IconButtonLight disabled={!props.hasCopiedFormat} title="Apply copied format" onClick={props.onPasteFormat}><Paintbrush className="rotate-180" size={18} /></IconButtonLight>
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <IconButtonLight active={props.toolbarState.image} title="Image" onClick={() => props.onMoreAction("image")}><Image size={18} /></IconButtonLight>
                {props.toolbarState.image ? <IconButtonLight title="Remove image" onClick={() => props.onMoreAction("removeImage")}><Minus size={18} /></IconButtonLight> : null}
                <IconButtonLight active={props.toolbarState.link} disabled={!props.toolbarState.link && !canCreateLink} title="Create link" onClick={props.onCreateLink}><Link2 size={18} /></IconButtonLight>
                {props.toolbarState.link ? <IconButtonLight title="Remove link" onClick={props.onRemoveLink}><Unlink2 size={18} /></IconButtonLight> : null}
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <IconButtonLight title="Insert table" onClick={() => props.onMoreAction("insertTable")}><Table2 size={18} /></IconButtonLight>
                {props.toolbarState.table ? (
                  <>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.addRowBefore} title="Add row before" onClick={() => props.onMoreAction("addRowBefore")}><BetweenHorizontalStart size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.addRowAfter} title="Add row after" onClick={() => props.onMoreAction("addRowAfter")}><Rows3 size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.addColumnBefore} title="Add column before" onClick={() => props.onMoreAction("addColumnBefore")}><BetweenHorizontalEnd size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.addColumnAfter} title="Add column after" onClick={() => props.onMoreAction("addColumnAfter")}><Columns2 size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.copyRow} title="Copy row" onClick={() => props.onMoreAction("copyRow")}><Copy size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.copyColumn} title="Copy column" onClick={() => props.onMoreAction("copyColumn")}><Copy className="rotate-90" size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.moveColumnLeft} title="Move column left" onClick={() => props.onMoreAction("moveColumnLeft")}><ArrowLeft size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.moveColumnRight} title="Move column right" onClick={() => props.onMoreAction("moveColumnRight")}><ArrowRight size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.moveRowUp} title="Move row up" onClick={() => props.onMoreAction("moveRowUp")}><ArrowUp size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.moveRowDown} title="Move row down" onClick={() => props.onMoreAction("moveRowDown")}><ArrowUp className="rotate-180" size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.toggleHeaderRow} title={tableActionTitle("toggleHeaderRow", props.toolbarState.tableHeaderState)} onClick={() => props.onMoreAction("toggleHeaderRow")}><PanelTop size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.toggleHeaderColumn} title={tableActionTitle("toggleHeaderColumn", props.toolbarState.tableHeaderState)} onClick={() => props.onMoreAction("toggleHeaderColumn")}><PanelLeft size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.distributeRows} title="Distribute rows" onClick={() => props.onMoreAction("distributeRows")}><PanelTopBottomDashed size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.distributeColumns} title="Distribute columns" onClick={() => props.onMoreAction("distributeColumns")}><PanelLeftRightDashed size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.styleDraft.height?.trim()} title="Apply row height" onClick={() => props.onTableRowHeight("apply")}><Rows3 size={18} /></IconButtonLight>
                    <IconButtonLight title="Clear row height" onClick={() => props.onTableRowHeight("clear")}><Minus className="rotate-90" size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.styleDraft.width?.trim()} title="Apply column width" onClick={() => props.onTableColumnWidth("apply")}><Columns2 size={18} /></IconButtonLight>
                    <IconButtonLight title="Clear column width" onClick={() => props.onTableColumnWidth("clear")}><Minus size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.deleteRow} title="Delete row" onClick={() => props.onMoreAction("deleteRow")}><Minus size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.deleteColumn} title="Delete column" onClick={() => props.onMoreAction("deleteColumn")}><BetweenHorizontalEnd size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.deleteTable} title="Delete table" onClick={() => props.onMoreAction("deleteTable")}><Grid2X2 size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.mergeCellRight} title="Merge cell right" onClick={() => props.onMoreAction("mergeCellRight")}><TableCellsMerge size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.mergeCellDown} title="Merge cell down" onClick={() => props.onMoreAction("mergeCellDown")}><TableCellsMerge className="rotate-90" size={18} /></IconButtonLight>
                    <IconButtonLight disabled={!props.toolbarState.tableActions.splitCell} title="Split cell" onClick={() => props.onMoreAction("splitCell")}><TableCellsSplit size={18} /></IconButtonLight>
                    <IconButtonLight title="Vertical align top" onClick={() => props.onVerticalAlign("top")}><ArrowUp size={18} /></IconButtonLight>
                    <IconButtonLight title="Vertical align middle" onClick={() => props.onVerticalAlign("middle")}><Rows3 size={18} /></IconButtonLight>
                    <IconButtonLight title="Vertical align bottom" onClick={() => props.onVerticalAlign("bottom")}><ArrowUp className="rotate-180" size={18} /></IconButtonLight>
                    <IconButtonLight title="All cell borders" onClick={() => props.onTableBorder("all")}><Grid2X2 size={18} /></IconButtonLight>
                    <IconButtonLight title="Outer cell borders" onClick={() => props.onTableBorder("outer")}><Table2 size={18} /></IconButtonLight>
                    <IconButtonLight title="Inner cell borders" onClick={() => props.onTableBorder("inner")}><Columns2 size={18} /></IconButtonLight>
                    <IconButtonLight title="Top cell border" onClick={() => props.onTableBorder("top")}><PanelTop size={18} /></IconButtonLight>
                    <IconButtonLight title="Right cell border" onClick={() => props.onTableBorder("right")}><PanelRight size={18} /></IconButtonLight>
                    <IconButtonLight title="Bottom cell border" onClick={() => props.onTableBorder("bottom")}><PanelBottom size={18} /></IconButtonLight>
                    <IconButtonLight title="Left cell border" onClick={() => props.onTableBorder("left")}><PanelLeft size={18} /></IconButtonLight>
                    <IconButtonLight title="Clear cell borders" onClick={() => props.onTableBorder("none")}><Minus size={18} /></IconButtonLight>
                  </>
                ) : null}
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <IconButtonLight disabled={!props.runtime} title="Horizontal rule" onClick={props.onHorizontalRule}><Minus size={18} /></IconButtonLight>
                <IconButtonLight title="Clear formatting" onClick={props.onClearFormat}><span className="text-[11px] font-bold">Tx</span></IconButtonLight>
                <IconButtonLight title="Style" onClick={() => props.onMoreAction("style")}><SlidersHorizontal size={18} /></IconButtonLight>
                <ToolbarMoreMenu
                  open={moreMenuOpen}
                  options={moreOptions}
                  onOpenChange={setMoreMenuOpen}
                  onSelect={(action) => {
                    setMoreMenuOpen(false);
                    props.onMoreAction(action);
                  }}
                />
                <IconButtonLight title="Collapse toolbar" onClick={props.onToggleToolbar}><ChevronUp size={18} /></IconButtonLight>
              </ToolbarGroup>
            </div>
            ) : (
              <button
                className="mt-1.5 flex h-6 w-full items-center justify-center rounded-lg text-[#555] hover:bg-black/[0.04]"
                type="button"
                title="Expand toolbar"
                onMouseDown={(event) => event.preventDefault()}
                onClick={props.onToggleToolbar}
              >
                <ChevronUp className="rotate-180" size={18} />
              </button>
            )}

            {props.toolbarExpanded && props.linkEditorOpen ? (
              <form
                data-toolbar-skip-selection-preserve="true"
                className="mt-2 flex h-8 w-fit shrink-0 items-center gap-1 rounded-lg bg-black/[0.04] px-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  props.onApplyLink(props.linkDraft);
                }}
              >
                <input
                  className="h-6 w-[220px] rounded-md border border-black/10 bg-white px-2 text-[10px] font-medium text-[#333] outline-none"
                  value={props.linkDraft}
                  onChange={(event) => props.onLinkDraftChange(event.currentTarget.value)}
                  onMouseDown={(event) => event.stopPropagation()}
                  placeholder="https://"
                  aria-label="Link URL"
                />
                <button className="h-6 rounded-md bg-black px-2.5 text-[9px] font-semibold text-white" type="submit">
                  Apply
                </button>
              </form>
            ) : null}

            {props.toolbarExpanded && props.operationPanelMode ? (
              <form
                data-toolbar-skip-selection-preserve="true"
                className="toolbar-scroll mt-2 flex min-h-9 w-fit max-w-full shrink-0 items-center gap-1.5 overflow-x-auto rounded-lg bg-black/[0.04] px-2.5 py-1.5"
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
                {props.operationPanelMode === "color" ? (
                  <>
                    <label className="flex h-8 items-center gap-2 rounded-lg border border-black/10 bg-white px-2 text-[11px] font-semibold text-[#555]">
                      Text
                      <input
                        aria-label="Text color"
                        className="size-5 rounded border border-black/10"
                        type="color"
                        value={props.colorDraft.foreColor}
                        onChange={(event) => props.onColorDraftChange({ ...props.colorDraft, foreColor: event.currentTarget.value })}
                        onMouseDown={(event) => event.stopPropagation()}
                      />
                    </label>
                    <input
                      aria-label="Text color value"
                      className="h-8 w-[92px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      value={props.colorDraft.foreColor}
                      onChange={(event) => props.onColorDraftChange({ ...props.colorDraft, foreColor: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <label className="flex h-8 items-center gap-2 rounded-lg border border-black/10 bg-white px-2 text-[11px] font-semibold text-[#555]">
                      Fill
                      <input
                        aria-label="Fill color"
                        className="size-5 rounded border border-black/10"
                        type="color"
                        value={props.colorDraft.backColor}
                        onChange={(event) => props.onColorDraftChange({ ...props.colorDraft, backColor: event.currentTarget.value })}
                        onMouseDown={(event) => event.stopPropagation()}
                      />
                    </label>
                    <input
                      aria-label="Fill color value"
                      className="h-8 w-[92px] rounded-lg border border-black/10 bg-white px-2 text-[12px] font-medium text-[#333] outline-none"
                      value={props.colorDraft.backColor}
                      onChange={(event) => props.onColorDraftChange({ ...props.colorDraft, backColor: event.currentTarget.value })}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                  </>
                ) : props.operationPanelMode === "table" ? (
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
          </div>

          {props.frameSrcDoc ? (
            <iframe
              key={props.frameRevision}
              ref={props.iframeRef}
              className="mx-auto block min-h-[860px] w-full max-w-[980px] rounded-[2px] border border-black/30 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
              title={props.runtime?.title ?? "Runtime document"}
              sandbox="allow-same-origin"
              srcDoc={props.frameSrcDoc}
              onLoad={props.onFrameLoad}
              onInput={() => props.onMutation("input", "User edited document body")}
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
    </section>
  );
}

function isOperationPanelMode(action: string): action is Exclude<OperationPanelMode, null> {
  return (operationPanelModes as readonly string[]).includes(action);
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
  const target = fallbackTarget ?? (rangeElement && rangeElement !== doc.body ? rangeElement : null) ?? doc.body;
  const block = nearestBlockForToolbar(target, doc);
  const styleTarget = target !== doc.body && !isToolbarBlock(target) ? target : block ?? target;
  const computed = doc.defaultView?.getComputedStyle(styleTarget);
  const backgroundTarget = target.closest("td, th") ?? styleTarget;
  const backgroundComputed = doc.defaultView?.getComputedStyle(backgroundTarget);
  const tableTarget = tableToolbarTarget(doc, target, fallbackTarget);
  const tableActions = tableTarget ? getTableActionAvailability(doc, tableTarget) : defaultTableActions();
  const tableHeaderState = tableTarget ? getTableHeaderState(doc, tableTarget) : defaultTableHeaderState();
  const selectedTableCells = getSelectedTableCells(doc);
  const toolbarTargets = selectedTableCells.length > 0 ? selectedTableCells : [target];
  return {
    block: blockTagForToolbar(block),
    fontFamily: normalizeToolbarFont(computed?.fontFamily || ""),
    fontSize: normalizeToolbarFontSize(computed?.fontSize || ""),
    foreColor: rgbToHex(computed?.color || "") || "#111111",
    backColor: colorStyleValue(backgroundComputed?.backgroundColor) || "#fff2a8",
    alignment: normalizeToolbarAlignment(computed?.textAlign || ""),
    bold: toolbarTargetsHaveFormat(doc, toolbarTargets, ["strong", "b"], (style) => Number(style.fontWeight) >= 600),
    italic: toolbarTargetsHaveFormat(doc, toolbarTargets, ["em", "i"], (style) => style.fontStyle === "italic"),
    underline: toolbarTargetsHaveFormat(doc, toolbarTargets, ["u"], (style) => style.textDecorationLine.includes("underline")),
    strikethrough: toolbarTargetsHaveFormat(doc, toolbarTargets, ["s", "strike", "del"], (style) => style.textDecorationLine.includes("line-through")),
    link: selectedTableCells.length > 0 ? selectedTableCells.some((cell) => Boolean(cell.querySelector("a"))) : Boolean(target.closest("a")) || selectionContainsLink(doc),
    list: selectedTableCells.length > 0 ? listKindForToolbarCells(selectedTableCells) : listKindForToolbar(target),
    checklist: selectedTableCells.length > 0 ? selectedTableCells.every((cell) => Boolean(cell.querySelector(':scope > ul[data-ai-checklist="true"]'))) : Boolean(target.closest('ul[data-ai-checklist="true"]')),
    table: Object.values(tableActions).some(Boolean),
    tableActions,
    tableHeaderState,
    image: target.tagName === "IMG",
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

function tableCellFromNode(node: Node | null, doc: Document) {
  const element = isElementNode(node) ? node : node?.parentElement ?? null;
  const cell = element?.closest("td, th") ?? null;
  return cell && doc.body.contains(cell) ? (cell as HTMLTableCellElement) : null;
}

function clearNativeSelection(doc: Document) {
  doc.getSelection()?.removeAllRanges();
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

function toolbarTargetsHaveFormat(doc: Document, targets: Element[], tags: string[], styleCheck: (style: CSSStyleDeclaration) => boolean) {
  if (targets.length === 0) return false;
  return targets.every((target) => {
    const selector = tags.join(",");
    const style = doc.defaultView?.getComputedStyle(target);
    return hasAncestorTag(target, tags) || Boolean(target.querySelector(selector)) || Boolean(style && styleCheck(style));
  });
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

function readCurrentImageAttributes(doc: Document | null, fallbackNode: Node | null): ImageAttributes {
  if (!doc) return { src: "", alt: "", width: "", height: "" };
  const target = currentPanelTarget(doc, fallbackNode);
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

function readCurrentColors(doc: Document | null, fallbackNode: Node | null) {
  if (!doc) return { foreColor: "#111111", backColor: "#fff2a8" };
  const target = currentPanelTarget(doc, fallbackNode) ?? doc.body;
  const backgroundTarget = target.closest("td, th") ?? target;
  const computed = doc.defaultView?.getComputedStyle(target);
  const backgroundComputed = doc.defaultView?.getComputedStyle(backgroundTarget);
  return {
    foreColor: rgbToHex(computed?.color || "") || "#111111",
    backColor: colorStyleValue(backgroundComputed?.backgroundColor) || "#fff2a8",
  };
}

function readCurrentStyles(doc: Document | null, fallbackNode: Node | null): ElementStyleAttributes {
  if (!doc) return {};
  const target = currentPanelTarget(doc, fallbackNode) ?? doc.body;
  const element = styleTargetForToolbar(target, doc);
  const inline = inlineStyleOf(element);
  const computed = doc.defaultView?.getComputedStyle(element);
  return {
    width: inline?.width || styleValue(computed?.width),
    height: inline?.height || styleValue(computed?.height),
    lineHeight: inline?.lineHeight || styleValue(computed?.lineHeight),
    letterSpacing: inline?.letterSpacing || styleValue(computed?.letterSpacing),
    verticalAlign: inline?.verticalAlign || styleValue(computed?.verticalAlign),
    borderWidth: inline?.borderWidth || boxStyleValue(computed?.borderWidth),
    borderStyle: inline?.borderStyle || boxStyleValue(computed?.borderStyle),
    borderColor: inline?.borderColor || colorStyleValue(computed?.borderColor),
    borderRadius: inline?.borderRadius || boxStyleValue(computed?.borderRadius),
    padding: inline?.padding || boxStyleValue(computed?.padding),
    marginTop: inline?.marginTop || boxStyleValue(computed?.marginTop),
    marginBottom: inline?.marginBottom || boxStyleValue(computed?.marginBottom),
  };
}

function currentPanelTarget(doc: Document, fallbackNode: Node | null) {
  return resolveEditorTarget(doc, fallbackNode, "") ?? currentSelectionElement(doc);
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

function boxStyleValue(value: string | undefined) {
  const normalized = styleValue(value);
  if (!normalized || normalized === "0px" || normalized === "0px 0px 0px 0px") return "";
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

function toolbarMoreOptions(toolbarState: ToolbarState, canUseRangeSelection = toolbarState.rangeSelection): ToolbarMoreOption[] {
  const options: ToolbarMoreOption[] = [
    { label: "Insert text", value: "insertText" },
    { label: "Insert HTML", value: "insertHtml" },
  ];
  if (canUseRangeSelection) options.push({ label: "Replace selection", value: "replaceSelection" });
  options.push(
    { label: "Image", value: "image" },
    ...(toolbarState.image ? [{ label: "Remove image", value: "removeImage" }] : []),
    { label: "Color", value: "color" },
    { label: "Style", value: "style" },
    { label: "Insert table", value: "insertTable" },
  );
  if (toolbarState.contentElement) {
    options.push({ label: "Append text", value: "appendText" }, { label: "Append HTML", value: "appendHtml" });
  }
  if (toolbarState.mutableElement) options.push({ label: "Insert at position", value: "insertAtPosition" });
  if (canUseRangeSelection) options.push({ label: "Wrap selection", value: "wrapSelection" });
  if (toolbarState.attributeElement) options.push({ label: "Set attributes", value: "setAttributes" });
  if (toolbarState.table) {
    tableEditActions.forEach((action) => {
      options.push({
        label: tableActionTitle(action, toolbarState.tableHeaderState),
        value: action,
        disabled: !toolbarState.tableActions[action],
      });
    });
  }
  if (toolbarState.mutableElement) options.push({ label: "Duplicate element", value: "duplicateElement" }, { label: "Delete element", value: "deleteElement" });
  if (toolbarState.contentElement) options.push({ label: "Cursor to start", value: "cursorStart" }, { label: "Cursor to end", value: "cursorEnd" });
  return options;
}
