import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  History,
  Layers3,
  Search,
  Sparkles,
} from "lucide-react";
import { allCategoriesForTemplates, categoryCountsForTemplates, type OutputType, type SlideTemplate } from "./templates";
import { HomeComposer } from "./app/HomeComposer";
import { BlankTemplateCard, CategoryButton, ProjectHistory, TemplateCard, TemplatePreviewModal } from "./app/SlideHomePanels";
import { SlideEditorScreen } from "./app/SlideEditorScreen";
import { useAgentConversation } from "./app/useAgentConversation";
import { cancelRun, clearProjectHistory, createProject, deleteProject, fetchBootstrapSnapshot, fetchLocalAgentProviders, fetchOfficeCliStatus, getProject, installOfficeCli, listProjects, listTemplates, startAiEdit, updateDeckSlideHtml } from "./api/projects";
import { DeckArtifactRuntimeAdapter, type DeckAgentRuntimeProvider } from "./artifact/deckArtifactAdapter";
import { PptxArtifactRuntimeAdapter } from "./artifact/pptxArtifactAdapter";
import { usePptxArtifactRuntime } from "./artifact/usePptxArtifactRuntime";
import { useI18n } from "./i18n";
import { appShell, homePanelButtonClass } from "@ai-app/ui/app-shell";
import type { ArtifactSaveState } from "@ai-app/ui/editor-frame";
import { editableArtifactInteraction, type ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import type { LocalAgentProviderStatus, OfficeCliStatus, ProjectDetailResponse, RuntimeProfile, SlideArtifactType, SlideProject, SlideRunTimelineItem } from "@ai-slide/shared";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const scrollbarHidden = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

type AppRoute = { name: "home" } | { name: "slide"; projectId: string };

function readCurrentRoute(): AppRoute {
  const match = window.location.pathname.match(/^\/slide\/([^/]+)\/?$/);
  if (match?.[1]) return { name: "slide", projectId: decodeURIComponent(match[1]) };
  return { name: "home" };
}

function slidePath(projectId: string) {
  return `/slide/${encodeURIComponent(projectId)}`;
}

function pushSlideRoute(projectId: string) {
  window.history.pushState({}, "", slidePath(projectId));
  return readCurrentRoute();
}

function pushHomeRoute() {
  window.history.pushState({}, "", "/");
  return readCurrentRoute();
}

function routePath(route: AppRoute) {
  return route.name === "slide" ? slidePath(route.projectId) : "/";
}

export function App() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState<OutputType>("html");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [activePanel, setActivePanel] = useState<"templates" | "history">("templates");
  const [creating, setCreating] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() => readCurrentRoute());
  const [projectDetail, setProjectDetail] = useState<ProjectDetailResponse | null>(null);
  const [historyProjects, setHistoryProjects] = useState<SlideProject[]>([]);
  const [slideTemplates, setSlideTemplates] = useState<SlideTemplate[]>([]);
  const [runtimeProfiles, setRuntimeProfiles] = useState<RuntimeProfile[]>([]);
  const [localAgentProviders, setLocalAgentProviders] = useState<LocalAgentProviderStatus[]>([]);
  const [officeCliStatus, setOfficeCliStatus] = useState<OfficeCliStatus | null>(null);
  const [officeCliInstalling, setOfficeCliInstalling] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<SlideTemplate | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [agentSending, setAgentSending] = useState(false);
  const [artifactSaveState, setArtifactSaveState] = useState<ArtifactSaveState>("saved");
  const currentProjectId = route.name === "slide" ? route.projectId : null;
  const deckAgentRuntimeProviderRef = useRef<DeckAgentRuntimeProvider | null>(null);
  const routeRef = useRef<AppRoute>(readCurrentRoute());
  const hasUnsavedChangesRef = useRef(false);
  const [deckActiveSelectionPreview, setDeckActiveSelectionPreview] = useState({ label: t("editor.selectedText"), text: "", visible: false });
  const agentConversation = useAgentConversation({
    projectId: currentProjectId,
    onProjectUpdated: (detail) => {
      if (detail.project.id !== currentProjectId) return;
      if (!isNewerProjectDetail(detail, projectDetail)) return;
      setProjectDetail(detail);
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
    },
  });
  const deckArtifactAdapter = useMemo(() => new DeckArtifactRuntimeAdapter(), []);
  const pptxArtifactAdapter = useMemo(() => new PptxArtifactRuntimeAdapter(), []);
  const {
    runtime: pptxRuntime,
    loading: pptxLoading,
    error: pptxError,
    loadArtifact: loadPptxArtifact,
    clearArtifact: clearPptxArtifact,
    updateSelection: updatePptxSelection,
    createAiEditRequest: createPptxAiEditRequest,
  } = usePptxArtifactRuntime(pptxArtifactAdapter);
  const allCategories = useMemo(() => allCategoriesForTemplates(slideTemplates), [slideTemplates]);
  const categoryCounts = useMemo(() => categoryCountsForTemplates(slideTemplates), [slideTemplates]);

  const setDeckAgentRuntimeProvider = useCallback((provider: DeckAgentRuntimeProvider | null) => {
    deckAgentRuntimeProviderRef.current = provider;
  }, []);

  const visibleTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return slideTemplates.filter((template) => {
      const categoryMatch = selectedCategory === "All" || template.category === selectedCategory;
      if (!categoryMatch) return false;
      if (!normalizedQuery) return true;
      return [
        template.name,
        template.category,
        template.shortDescription,
        template.description,
        ...template.tags,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [query, selectedCategory, slideTemplates]);

  const hasUnsavedChanges = route.name === "slide" && (artifactSaveState === "saving" || artifactSaveState === "error");

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const requestHomeRoute = () => {
    if (hasUnsavedChanges && !window.confirm(t("nav.unsavedChanges"))) return;
    setArtifactSaveState("saved");
    setRoute(pushHomeRoute());
  };

  useEffect(() => {
    const onPopState = () => {
      if (hasUnsavedChangesRef.current && !window.confirm(t("nav.unsavedChanges"))) {
        window.history.pushState({}, "", routePath(routeRef.current));
        return;
      }
      setRoute(readCurrentRoute());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (route.name !== "home") return;
    void listProjects()
      .then(setHistoryProjects)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [route.name]);

  useEffect(() => {
    void fetchBootstrapSnapshot()
      .then((snapshot) => {
        const enabledProfiles = snapshot.runtimeProfiles.filter((profile) => profile.enabled && profile.kind === "local-agent");
        setRuntimeProfiles(enabledProfiles);
        setSelectedAgent((current) => {
          if (enabledProfiles.some((profile) => profile.id === current)) return current;
          return enabledProfiles[0]?.id ?? "";
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    void fetchLocalAgentProviders()
      .then((response) => {
        setLocalAgentProviders(response.providers);
        setSelectedAgent((current) => {
          const currentProfile = runtimeProfiles.find((profile) => profile.id === current);
          const currentStatus = currentProfile ? response.providers.find((provider) => provider.provider === currentProfile.provider) : null;
          if (currentStatus?.available) return current;
          const firstAvailable = runtimeProfiles.find((profile) => response.providers.find((provider) => provider.provider === profile.provider)?.available);
          return firstAvailable?.id ?? current;
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [runtimeProfiles]);

  useEffect(() => {
    void fetchOfficeCliStatus()
      .then((response) => setOfficeCliStatus(response.officecli))
      .catch((err) =>
        setOfficeCliStatus({
          available: false,
          source: "missing",
          canInstall: false,
          installing: false,
          reason: err instanceof Error ? err.message : "Unable to check OfficeCLI status.",
        }),
      );
  }, []);

  useEffect(() => {
    if (route.name !== "home" || slideTemplates.length > 0) return;
    setTemplatesLoading(true);
    void listTemplates()
      .then(setSlideTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setTemplatesLoading(false));
  }, [route.name, slideTemplates.length]);

  useEffect(() => {
    if (route.name !== "slide") {
      setProjectDetail(null);
      setArtifactSaveState("saved");
      setDeckActiveSelectionPreview({ label: t("editor.selectedText"), text: "", visible: false });
      deckAgentRuntimeProviderRef.current = null;
      clearPptxArtifact();
      return;
    }
    setLoadingProject(true);
    setError("");
    void getProject(route.projectId)
      .then(setProjectDetail)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingProject(false));
  }, [clearPptxArtifact, route]);

  useEffect(() => {
    if (route.name !== "slide" || projectDetail?.artifact.type !== "pptx") {
      clearPptxArtifact();
      return;
    }
    if (!projectDetail.pptxManifest) return;
    void loadPptxArtifact(projectDetail.project.id, {
      title: projectDetail.project.title,
      manifest: projectDetail.pptxManifest,
    }).catch(() => undefined);
  }, [
    clearPptxArtifact,
    loadPptxArtifact,
    projectDetail?.artifact.id,
    projectDetail?.artifact.revision,
    projectDetail?.artifact.type,
    projectDetail?.project.id,
    projectDetail?.project.title,
    projectDetail?.pptxManifest?.sha256,
    projectDetail?.pptxManifest?.updatedAt,
    route.name,
  ]);

  const createAndOpenProject = async (input: { title: string; template?: SlideTemplate; artifactType?: SlideArtifactType; initialPrompt?: string }) => {
    setCreating(true);
    setError("");
    try {
      const artifactType = input.artifactType ?? artifactTypeForOutput(outputType);
      if (artifactType === "pptx" && officeCliStatus?.available !== true) {
        throw new Error(officeCliStatus?.reason ?? "OfficeCLI is required for PPTX.");
      }
      const response = await createProject({
        title: input.title,
        artifactType,
        templateId: input.template?.id ?? null,
        templateName: input.template?.name ?? null,
      });
      setHistoryProjects((projects) => [response.project, ...projects.filter((project) => project.id !== response.project.id)]);
      const initialPrompt = input.initialPrompt?.trim();
      if (initialPrompt) {
        await startAiEdit(response.project.id, {
          userPrompt: initialPrompt,
          mode: "write",
          artifactType,
          selectedText: "",
          selectedHtml: "",
          selectionType: "write",
          selectionPath: "",
          runtimeProfileId: selectedAgent || null,
        });
      }
      setRoute(pushSlideRoute(response.project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

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
        // Keep the existing status if the follow-up check also fails.
      }
    } finally {
      setOfficeCliInstalling(false);
    }
  };

  const createFromPrompt = () => {
    if (!prompt.trim()) return;
    void createAndOpenProject({ title: "Untitled Presentation", initialPrompt: prompt.trim() });
  };

  const createBlank = () => {
    void createAndOpenProject({ title: "Untitled Presentation" });
  };

  const createFromTemplate = (template: SlideTemplate) => {
    setSelectedTemplate(null);
    setSelectedSlideIndex(0);
    void createAndOpenProject({ title: template.name, template, artifactType: "deck" });
  };

  const openTemplate = (template: SlideTemplate) => {
    setSelectedTemplate(template);
    setSelectedSlideIndex(0);
  };

  const openHistoryProject = (project: SlideProject) => {
    setRoute(pushSlideRoute(project.id));
  };

  const clearHistory = async () => {
    setError("");
    setLoadingProject(true);
    try {
      const projects = await clearProjectHistory();
      setHistoryProjects(projects);
      setActivePanel("history");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProject(false);
    }
  };

  const deleteHistoryProject = async (projectId: string) => {
    setError("");
    setLoadingProject(true);
    try {
      const projects = await deleteProject(projectId);
      setHistoryProjects(projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProject(false);
    }
  };

  const sendAgentPrompt = async (userPrompt: string) => {
    if (!currentProjectId) throw new Error("Project is not open");
    setAgentSending(true);
    setError("");
    try {
      if (projectDetail?.artifact.type === "pptx") {
        if (!pptxRuntime) throw new Error("PPTX runtime is not ready");
        await startAiEdit(
          currentProjectId,
          createPptxAiEditRequest({
            projectId: currentProjectId,
            runtime: pptxRuntime,
            userPrompt,
            runtimeProfileId: selectedAgent || null,
          }),
        );
        void agentConversation.reload();
        setProjectDetail(await getProject(currentProjectId));
      } else {
        const deckRuntime = deckAgentRuntimeProviderRef.current?.() ?? null;
        if (!deckRuntime) throw new Error("Deck runtime is not ready");
        if (deckRuntime.activeSlide?.id && deckRuntime.currentSlideHtml.trim()) {
          await updateDeckSlideHtml(currentProjectId, deckRuntime.activeSlide.id, { html: deckRuntime.currentSlideHtml });
        }
        await startAiEdit(
          currentProjectId,
          deckArtifactAdapter.createAiEditRequest({
            projectId: currentProjectId,
            runtime: deckRuntime,
            userPrompt,
            runtimeProfileId: selectedAgent || null,
          }),
        );
        void agentConversation.reload();
      }
      await agentConversation.reload();
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

  const agentBusy = agentSending || agentConversation.items.some((item) => item.run.status === "accepted" || item.run.status === "running");
  const artifactInteraction: ArtifactInteractionPolicy = useMemo(
    () => (agentBusy ? { mode: "read-only", readOnlyReason: "agent-running" } : editableArtifactInteraction),
    [agentBusy],
  );

  if (route.name === "slide") {
    return (
      <SlideEditorScreen
        conversationError={agentConversation.error}
        conversationItems={agentConversation.items}
        conversationLoading={agentConversation.loading}
        detail={projectDetail}
        error={error}
        activeSelectionLabel={projectDetail?.artifact.type === "pptx" ? t("editor.selectedText") : deckActiveSelectionPreview.label}
        activeSelectionText={projectDetail?.artifact.type === "pptx" ? pptxRuntime?.selection.selectedText ?? "" : deckActiveSelectionPreview.text}
        activeSelectionVisible={projectDetail?.artifact.type === "pptx" ? Boolean(pptxRuntime?.selection.selectedText.trim()) : deckActiveSelectionPreview.visible}
        localAgentProviders={localAgentProviders}
        runtimeProfiles={runtimeProfiles}
        selectedAgent={selectedAgent}
        sending={agentBusy}
        artifactInteraction={artifactInteraction}
        loading={loadingProject || pptxLoading}
        pptxError={pptxError}
        pptxRuntime={pptxRuntime}
        projectId={route.projectId}
        onArtifactSaveStateChange={setArtifactSaveState}
        onBackHome={requestHomeRoute}
        onCancel={cancelAgentRun}
        onPptxSelectionChange={updatePptxSelection}
        onDeckAgentRuntimeProviderChange={setDeckAgentRuntimeProvider}
        onDeckSelectionPreviewChange={setDeckActiveSelectionPreview}
        onSelectedAgentChange={setSelectedAgent}
        onSend={sendAgentPrompt}
      />
    );
  }

  return (
    <main className={cn(appShell.page, "h-dvh px-3.5 pb-12 pt-14 font-sans md:px-7 md:pb-16")}>
      <section className="mx-auto flex w-full max-w-[820px] flex-col items-center text-center">
        <div className={appShell.heroIcon}>
          <Sparkles size={18} />
        </div>
        <h1 className={cn("m-0", appShell.heroTitle)}>{t("home.heading")}</h1>
        <HomeComposer
          creating={creating}
          officeCliInstalling={officeCliInstalling}
          officeCliStatus={officeCliStatus}
          outputType={outputType}
          prompt={prompt}
          selectedAgent={selectedAgent}
          localAgentProviders={localAgentProviders}
          runtimeProfiles={runtimeProfiles}
          onCreate={createFromPrompt}
          onInstallOfficeCli={downloadOfficeCli}
          onOutputTypeChange={setOutputType}
          onPromptChange={setPrompt}
          onSelectedAgentChange={setSelectedAgent}
        />
        {error ? <div className={appShell.error}>{error}</div> : null}
      </section>

      <section className="mx-auto mt-10 w-full max-w-[1180px]">
        <div className="flex flex-col items-stretch justify-between gap-4 md:flex-row md:items-end">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2" aria-label="Home panels">
              <button className={homePanelButtonClass(activePanel === "templates")} type="button" onClick={() => setActivePanel("templates")}>
                <Layers3 size={15} />
                {t("home.templates")}
              </button>
              <button className={homePanelButtonClass(activePanel === "history")} type="button" onClick={() => setActivePanel("history")}>
                <History size={15} />
                {t("home.history")}
              </button>
            </div>
            <div className={appShell.countText}>
              {activePanel === "templates"
                ? templatesLoading
                  ? t("home.loadingTemplates")
                  : t("home.templateCount", { count: visibleTemplates.length })
                : t("home.projectCount", { count: historyProjects.length })}
            </div>
          </div>
          <label className={appShell.searchShell}>
            <Search size={15} />
            <input className={appShell.searchInput} value={query} placeholder={t("home.searchTemplates")} onChange={(event) => setQuery(event.currentTarget.value)} />
          </label>
        </div>

        {activePanel === "templates" ? (
          <>
            <div className={cn("mt-4 flex gap-2 overflow-x-auto pb-2", scrollbarHidden)}>
              <CategoryButton
                active={selectedCategory === "All"}
                count={slideTemplates.length}
                label={t("home.allTemplates")}
                onClick={() => setSelectedCategory("All")}
              />
              {allCategories.map((category) => (
                <CategoryButton
                  key={category}
                  active={selectedCategory === category}
                  count={categoryCounts[category] ?? 0}
                  label={category}
                  onClick={() => setSelectedCategory(category)}
                />
              ))}
            </div>
            <div className="mt-4 columns-1 gap-5 md:columns-2 lg:columns-3">
              {selectedCategory === "All" ? <BlankTemplateCard outputType={outputType} onCreate={createBlank} /> : null}
              {visibleTemplates.map((template) => (
                <TemplateCard key={template.id} showCategory={selectedCategory === "All"} template={template} onSelect={openTemplate} />
              ))}
            </div>
          </>
        ) : (
          <ProjectHistory
            loading={loadingProject}
            projects={historyProjects}
            onClearHistory={() => void clearHistory()}
            onDeleteProject={(projectId) => void deleteHistoryProject(projectId)}
            onOpenProject={openHistoryProject}
          />
        )}
      </section>
      {selectedTemplate ? (
        <TemplatePreviewModal
          creating={creating}
          selectedIndex={selectedSlideIndex}
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onSelectIndex={setSelectedSlideIndex}
          onUseTemplate={createFromTemplate}
        />
      ) : null}
    </main>
  );
}

function isNewerProjectDetail(next: ProjectDetailResponse, current: ProjectDetailResponse | null) {
  if (!current || current.project.id !== next.project.id) return true;
  return timestampMs(next.project.updatedAt) > timestampMs(current.project.updatedAt);
}

function timestampMs(value: string | null | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function artifactTypeForOutput(outputType: OutputType): SlideArtifactType {
  return outputType === "pptx" ? "pptx" : "deck";
}
