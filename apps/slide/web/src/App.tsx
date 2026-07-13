import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasActiveAgentRun } from "@ai-app/agent/conversation";
import { mergeLocalAgentRuntimeProfiles, resolvePreferredLocalAgentRuntimeProfileId } from "@ai-app/shared/agent-providers";
import {
  History,
  Upload,
} from "lucide-react";
import { allCategoriesForTemplates, categoryCountsForTemplates, type OutputType, type SlideTemplate } from "./templates";
import { HomeComposer } from "./app/HomeComposer";
import { BlankTemplateCard, CategoryButton, ProjectHistory, TemplateCard, TemplatePreviewModal } from "./app/SlideHomePanels";
import { SlideEditorScreen } from "./app/SlideEditorScreen";
import { initialPromptWithAttachmentContext, uploadHomeContextAttachments } from "./app/homeAttachmentPrompt";
import { reportUserActive } from "./app/tuttiActivity";
import { pushHomeRoute, pushSlideRoute, readCurrentRoute, routePath, type AppRoute } from "./app/slideRoutes";
import { useAgentConversation } from "./app/useAgentConversation";
import { useHomeAttachments, type HomeAttachment } from "./app/useHomeAttachments";
import { cancelRun, clearProjectHistory, createProject, deleteProject, fetchBootstrapSnapshot, fetchLocalAgentProviders, fetchOfficeCliStatus, getProject, importProjectFile, installOfficeCli, listProjects, listTemplates, startAiEdit, updateDeckSlideHtml } from "./api/projects";
import { DeckArtifactRuntimeAdapter, type DeckAgentRuntimeProvider } from "./artifact/deckArtifactAdapter";
import { PptxArtifactRuntimeAdapter } from "./artifact/pptxArtifactAdapter";
import { usePptxArtifactRuntime } from "./artifact/usePptxArtifactRuntime";
import { useI18n } from "./i18n";
import {
  homeContentClass,
  homeHeroSectionClass,
  HomePanelToggle,
  HomePageShell,
  HomeTopAction,
  HomeTitleText,
  homeTitleClass,
  homeWorkSectionClass,
  TemplatesFilledIcon,
} from "@ai-app/ui/app-shell";
import type { ArtifactSaveState } from "@ai-app/ui/editor-frame";
import { artifactInteractionForAgentBusy, type ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import type { LocalAgentProviderStatus, OfficeCliStatus, ProjectDetailResponse, RuntimeProfile, SlideArtifactType, SlideProject, SlideRunTimelineItem } from "@ai-slide/shared";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const scrollbarHidden = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function App() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState<OutputType>("html");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [activePanel, setActivePanel] = useState<"templates" | "history">("templates");
  const [creating, setCreating] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() => readCurrentRoute());
  const [projectDetail, setProjectDetail] = useState<ProjectDetailResponse | null>(null);
  const [historyProjects, setHistoryProjects] = useState<SlideProject[]>([]);
  const [slideTemplates, setSlideTemplates] = useState<SlideTemplate[]>([]);
  const [runtimeProfiles, setRuntimeProfiles] = useState<RuntimeProfile[]>([]);
  const [localAgentProviders, setLocalAgentProviders] = useState<LocalAgentProviderStatus[]>([]);
  const localAgentProvidersRef = useRef<LocalAgentProviderStatus[]>([]);
  const [localAgentProvidersLoaded, setLocalAgentProvidersLoaded] = useState(false);
  const [officeCliStatus, setOfficeCliStatus] = useState<OfficeCliStatus | null>(null);
  const [officeCliInstalling, setOfficeCliInstalling] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<SlideTemplate | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [agentSending, setAgentSending] = useState(false);
  const [artifactSaveState, setArtifactSaveState] = useState<ArtifactSaveState>("saved");
  const homeAttachments = useHomeAttachments();
  const currentProjectId = route.name === "slide" ? route.projectId : null;
  const importInputRef = useRef<HTMLInputElement | null>(null);
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

  const visibleTemplates = useMemo(
    () => slideTemplates.filter((template) => selectedCategory === "All" || template.category === selectedCategory),
    [selectedCategory, slideTemplates],
  );

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
        const mergedProfiles = mergeLocalAgentRuntimeProfiles(enabledProfiles, localAgentProvidersRef.current);
        setRuntimeProfiles(mergedProfiles);
        setSelectedAgent((current) => {
          if (mergedProfiles.some((profile) => profile.id === current)) return current;
          return resolvePreferredLocalAgentRuntimeProfileId({
            profiles: mergedProfiles,
            providers: localAgentProvidersRef.current,
          });
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchLocalAgentProviders()
      .then((response) => {
        if (cancelled) return;
        localAgentProvidersRef.current = response.providers;
        setLocalAgentProviders(response.providers);
        setLocalAgentProvidersLoaded(true);
        setRuntimeProfiles((current) => {
          const merged = mergeLocalAgentRuntimeProfiles(current, response.providers);
          setSelectedAgent((selected) => {
            if (merged.some((profile) => profile.id === selected)) return selected;
            return resolvePreferredLocalAgentRuntimeProfileId({
              profiles: merged,
              providers: response.providers,
            });
          });
          return merged;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setLocalAgentProvidersLoaded(true);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetchOfficeCliStatus()
      .then((response) => setOfficeCliStatus(response.officecli))
      .catch((err) =>
        setOfficeCliStatus({
          available: false,
          source: "missing",
          canInstall: false,
          installing: false,
          reason: err instanceof Error ? err.message : t("error.officeCliStatus"),
        }),
      );
  }, [t]);

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

  const createAndOpenProject = async (input: { title: string; template?: SlideTemplate; artifactType?: SlideArtifactType; initialPrompt?: string; attachments?: HomeAttachment[] }) => {
    setCreating(true);
    setError("");
    try {
      const artifactType = input.artifactType ?? artifactTypeForOutput(outputType);
      if (artifactType === "pptx" && officeCliStatus?.available !== true) {
        throw new Error(officeCliStatus?.reason ?? t("error.officeCliRequired"));
      }
      const response = await createProject({
        title: input.title,
        artifactType,
        templateId: input.template?.id ?? null,
        templateName: input.template?.name ?? null,
      });
      setHistoryProjects((projects) => [response.project, ...projects.filter((project) => project.id !== response.project.id)]);
      const uploadedAttachments = input.attachments?.length ? await uploadHomeContextAttachments(response.project.id, input.attachments) : [];
      const initialPrompt = initialPromptWithAttachmentContext(input.initialPrompt?.trim() ?? "", uploadedAttachments, t("project.attachmentPrompt")).trim();
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
        reportUserActive();
      }
      if (input.attachments?.length) homeAttachments.clearAttachments();
      setPrompt("");
      setSelectedTemplate(null);
      setSelectedSlideIndex(0);
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
      if (!response.officecli.available) setError(response.officecli.reason ?? t("error.officeCliInstall"));
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
    const attachments = homeAttachments.attachments;
    if (!prompt.trim() && attachments.length === 0) return;
    const attachmentTitle = attachments[0]?.name ? t("project.deckFromAttachment", { name: attachments[0].name }) : t("editor.untitledPresentation");
    void createAndOpenProject({
      title: attachmentTitle.length > 80 ? `${attachmentTitle.slice(0, 80).trim()}...` : attachmentTitle,
      initialPrompt: prompt.trim(),
      attachments,
    });
  };

  const importFile = async (file: File) => {
    setCreating(true);
    setError("");
    try {
      if (officeCliStatus?.available !== true) throw new Error(officeCliStatus?.reason ?? t("error.officeCliPresentationRequired"));
      if (!file.name.toLowerCase().endsWith(".pptx")) throw new Error(t("error.onlyPptx"));
      const detail = await importProjectFile(file);
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
      setRoute(pushSlideRoute(detail.project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const createBlank = () => {
    void createAndOpenProject({ title: t("editor.untitledPresentation") });
  };

  const createFromTemplate = (template: SlideTemplate) => {
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
    if (!currentProjectId) throw new Error(t("error.projectNotOpen"));
    setAgentSending(true);
    setError("");
    try {
      if (projectDetail?.artifact.type === "pptx") {
        if (!pptxRuntime) throw new Error(t("error.pptxRuntimeNotReady"));
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
        if (!deckRuntime) throw new Error(t("error.deckRuntimeNotReady"));
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
      reportUserActive();
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
      await agentConversation.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const agentBusy = agentSending || hasActiveAgentRun(agentConversation.items);
  const artifactInteraction: ArtifactInteractionPolicy = useMemo(
    () => artifactInteractionForAgentBusy(agentBusy),
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
    <HomePageShell className="h-dvh font-sans">
      <input
        ref={importInputRef}
        className="hidden"
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";
          if (file) void importFile(file);
        }}
      />
      <HomeTopAction
        disabled={creating}
        icon={<Upload size={14} />}
        title={t("home.importTitle")}
        onClick={() => importInputRef.current?.click()}
      >
        {t("home.import")}
      </HomeTopAction>
      <div className={homeContentClass}>
        <section className={homeHeroSectionClass}>
          <h1 className={cn("m-0", homeTitleClass)}>
            <HomeTitleText emphasisTerms={["presentation"]} title={t("home.heading")} />
          </h1>
          <HomeComposer
            attachments={homeAttachments.attachments}
            creating={creating}
            error={error}
            officeCliInstalling={officeCliInstalling}
            officeCliStatus={officeCliStatus}
            outputType={outputType}
            prompt={prompt}
            selectedAgent={selectedAgent}
            localAgentProviders={localAgentProvidersLoaded ? localAgentProviders : []}
            runtimeProfiles={localAgentProvidersLoaded ? runtimeProfiles : []}
            onAddFiles={homeAttachments.addFiles}
            onCreate={createFromPrompt}
            onInstallOfficeCli={downloadOfficeCli}
            onOutputTypeChange={setOutputType}
            onPromptChange={setPrompt}
            onRemoveAttachment={homeAttachments.removeAttachment}
            onSelectedAgentChange={setSelectedAgent}
          />
        </section>

        <section className={homeWorkSectionClass}>
          <div className="flex flex-col gap-8">
            <div className="flex items-center" aria-label="Home panels">
              <div className="h-px min-w-0 flex-1 bg-[#B8A07C]/30" />
              <div className="relative inline-grid grid-cols-2 rounded-full border border-[#B8A07C]/30 bg-[#F4EFE6]/48 p-1">
                <span
                  className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#2A2620] transition-transform duration-200 ease-out motion-reduce:transition-none ${
                    activePanel === "history" ? "translate-x-full" : "translate-x-0"
                  }`}
                  aria-hidden="true"
                />
                <div className="contents">
                  <HomePanelToggle active={activePanel === "templates"} icon={<TemplatesFilledIcon size={15} />} label={t("home.templates")} onClick={() => setActivePanel("templates")} />
                  <HomePanelToggle active={activePanel === "history"} icon={<History size={15} />} label={t("home.history")} onClick={() => setActivePanel("history")} />
                </div>
              </div>
              <div className="h-px min-w-0 flex-1 bg-[#B8A07C]/30" />
            </div>

            {activePanel === "templates" ? (
              <div className={cn("flex min-w-0 gap-2 overflow-x-auto", scrollbarHidden)}>
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
            ) : null}
          </div>

          {activePanel === "templates" ? (
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-5 gap-y-7">
              {selectedCategory === "All" ? <BlankTemplateCard outputType={outputType} onCreate={createBlank} /> : null}
              {visibleTemplates.map((template) => (
                <TemplateCard key={template.id} showCategory={selectedCategory === "All"} template={template} onSelect={openTemplate} />
              ))}
              {templatesLoading ? <div className="text-[13px] font-medium text-[#8B8275]">{t("home.loadingTemplates")}</div> : null}
            </div>
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
      </div>
      {selectedTemplate ? (
        <TemplatePreviewModal
          creating={creating}
          selectedIndex={selectedSlideIndex}
          template={selectedTemplate}
          onClose={() => {
            if (!creating) setSelectedTemplate(null);
          }}
          onSelectIndex={setSelectedSlideIndex}
          onUseTemplate={createFromTemplate}
        />
      ) : null}
    </HomePageShell>
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
