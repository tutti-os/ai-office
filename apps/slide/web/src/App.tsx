import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  FileCode2,
  FileText,
  History,
  Image,
  Italic,
  Layers3,
  Loader2,
  Move,
  PaintBucket,
  Plus,
  Redo2,
  Search,
  Sparkles,
  Trash2,
  Underline,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { ArtifactEditorFrame, ArtifactWorkspaceHeader, type ArtifactSaveState } from "@ai-app/ui/editor-frame";
import {
  Toolbar,
  ToolbarColorInput,
  ToolbarDivider,
  ToolbarGroup,
  ToolbarIconButton,
  ToolbarNumberInput,
  ToolbarRow,
  ToolbarSelect,
} from "@ai-app/ui/toolbar";
import { allCategoriesForTemplates, categoryCountsForTemplates, type OutputType, type SlideTemplate } from "./templates";
import { AgentConversationPanel } from "./app/AgentConversationPanel";
import { PptxPreview } from "./app/PptxPreview";
import { SlideFilmstrip } from "./app/SlideFilmstrip";
import { fitScale, nextSlideIndex, scaledHeight, shouldIgnoreSlideNavigationEvent, slideDirectionFromKey, thumbnailMetrics, useElementSize } from "./app/slideView";
import { useAgentConversation } from "./app/useAgentConversation";
import { cancelRun, clearProjectHistory, createProject, fetchLocalAgentProviders, getProject, listProjects, listTemplates, startAiEdit, updateDeckSlideHtml } from "./api/projects";
import { PptxArtifactRuntimeAdapter } from "./artifact/pptxArtifactAdapter";
import { usePptxArtifactRuntime } from "./artifact/usePptxArtifactRuntime";
import type { DeckManifestSlide, LocalAgentProviderStatus, ProjectDetailResponse, SlideArtifactType, SlideProject, SlideRunTimelineItem } from "@ai-slide/shared";

const agentProfiles: Array<{ id: string; provider: string; model: string; label: string }> = [
  { id: "local-agent:codex", provider: "codex", model: "codex:gpt-5", label: "Codex" },
  { id: "local-agent:claude", provider: "claude", model: "claude:default", label: "Claude Code" },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const scrollbarHidden = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const slideFilmstripClass = cn("flex min-h-32 min-w-0 shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden border-t border-white/8 bg-[#242424] px-5 pb-4 pt-3.5", scrollbarHidden);
const slideFilmstripThumbClass =
  "relative w-36 shrink-0 rounded-lg border border-white/10 bg-[#303030] p-[7px] text-white/70 aria-selected:border-violet-500/90 aria-selected:shadow-[0_0_0_2px_rgba(139,92,246,0.24)]";
const resizeHandlePosition: Record<ResizeHandle, string> = {
  "top-left": "-left-1 -top-1 cursor-nwse-resize",
  top: "-top-1 left-1/2 -translate-x-1/2 cursor-ns-resize",
  "top-right": "-right-1 -top-1 cursor-nesw-resize",
  right: "-right-1 top-1/2 -translate-y-1/2 cursor-ew-resize",
  "bottom-right": "-bottom-1 -right-1 cursor-nwse-resize",
  bottom: "-bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize",
  "bottom-left": "-bottom-1 -left-1 cursor-nesw-resize",
  left: "-left-1 top-1/2 -translate-y-1/2 cursor-ew-resize",
};

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

export function App() {
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState<OutputType>("html");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(agentProfiles[0].id);
  const [activePanel, setActivePanel] = useState<"templates" | "history">("templates");
  const [creating, setCreating] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() => readCurrentRoute());
  const [projectDetail, setProjectDetail] = useState<ProjectDetailResponse | null>(null);
  const [historyProjects, setHistoryProjects] = useState<SlideProject[]>([]);
  const [slideTemplates, setSlideTemplates] = useState<SlideTemplate[]>([]);
  const [localAgentProviders, setLocalAgentProviders] = useState<LocalAgentProviderStatus[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<SlideTemplate | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [agentSending, setAgentSending] = useState(false);
  const currentProjectId = route.name === "slide" ? route.projectId : null;
  const agentConversation = useAgentConversation({
    projectId: currentProjectId,
    onProjectUpdated: (detail) => {
      if (detail.project.id !== currentProjectId) return;
      setProjectDetail(detail);
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
    },
  });
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

  useEffect(() => {
    const onPopState = () => setRoute(readCurrentRoute());
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
    void fetchLocalAgentProviders()
      .then((response) => {
        setLocalAgentProviders(response.providers);
        setSelectedAgent((current) => {
          const currentProfile = agentProfiles.find((profile) => profile.id === current);
          const currentStatus = currentProfile ? response.providers.find((provider) => provider.provider === currentProfile.provider) : null;
          if (currentStatus?.available) return current;
          const firstAvailable = agentProfiles.find((profile) => response.providers.find((provider) => provider.provider === profile.provider)?.available);
          return firstAvailable?.id ?? current;
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
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

  const createAndOpenProject = async (input: { title: string; template?: SlideTemplate; artifactType?: SlideArtifactType }) => {
    setCreating(true);
    setError("");
    try {
      const response = await createProject({
        title: input.title,
        artifactType: input.artifactType ?? artifactTypeForOutput(outputType),
        templateId: input.template?.id ?? null,
        templateName: input.template?.name ?? null,
      });
      setHistoryProjects((projects) => [response.project, ...projects.filter((project) => project.id !== response.project.id)]);
      setRoute(pushSlideRoute(response.project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const createFromPrompt = () => {
    if (!prompt.trim()) return;
    void createAndOpenProject({ title: prompt.trim() });
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

  const clearHistory = async () => {
    setError("");
    try {
      const projects = await clearProjectHistory();
      setHistoryProjects(projects);
      setActivePanel("history");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        setProjectDetail(await getProject(currentProjectId));
      } else {
        await startAiEdit(currentProjectId, {
          userPrompt,
          mode: "write",
          artifactType: projectDetail?.artifact.type,
          selectionType: "write",
          runtimeProfileId: selectedAgent || null,
        });
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

  if (route.name === "slide") {
    return (
      <EditorPlaceholder
        conversationError={agentConversation.error}
        conversationItems={agentConversation.items}
        conversationLoading={agentConversation.loading}
        detail={projectDetail}
        error={error}
        activeSelectionText={projectDetail?.artifact.type === "pptx" ? pptxRuntime?.selection.selectedText ?? "" : ""}
        sending={agentBusy}
        loading={loadingProject || pptxLoading}
        pptxError={pptxError}
        pptxRuntime={pptxRuntime}
        projectId={route.projectId}
        onBackHome={() => setRoute(pushHomeRoute())}
        onCancel={cancelAgentRun}
        onPptxSelectionChange={updatePptxSelection}
        onSend={sendAgentPrompt}
      />
    );
  }

  return (
    <main className="relative min-h-screen overflow-auto bg-[#1f1f1f] px-3.5 pb-9 pt-14 font-sans text-white md:px-7 md:pb-12">
      <button className="absolute right-7 top-7 z-20 flex h-8 items-center gap-2 rounded-full border border-[#5b332f] bg-[#3a241f] px-3 text-[12px] font-bold text-[#ffad9f]" type="button" title="Clear history data" onClick={() => void clearHistory()}>
        <Trash2 size={14} />
        Debug clear history
      </button>

      <section className="mx-auto flex w-full max-w-[820px] flex-col items-center text-center">
        <div className="mb-5 grid size-10 place-items-center rounded-full bg-white text-black">
          <Sparkles size={18} />
        </div>
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.18] text-white md:text-[36px]">Ready to create any presentation?</h1>
        <Composer
          creating={creating}
          outputType={outputType}
          prompt={prompt}
          selectedAgent={selectedAgent}
          localAgentProviders={localAgentProviders}
          onCreate={createFromPrompt}
          onOutputTypeChange={setOutputType}
          onPromptChange={setPrompt}
          onSelectedAgentChange={setSelectedAgent}
        />
        {error ? <div className="mt-4 w-full rounded-xl bg-[#3a241f] p-3 text-left text-[12px] leading-5 text-[#ffad9f]">{error}</div> : null}
      </section>

      <section className="mx-auto mt-9 w-full max-w-[1180px]">
        <div className="flex flex-col items-stretch justify-between gap-4 md:flex-row md:items-end">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2" aria-label="Home panels">
              <button className={cn("inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-bold", activePanel === "templates" ? "bg-white text-black" : "bg-[#303030] text-white/72 hover:bg-[#383838]")} type="button" onClick={() => setActivePanel("templates")}>
                <Layers3 size={15} />
                Templates
              </button>
              <button className={cn("inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-bold", activePanel === "history" ? "bg-white text-black" : "bg-[#303030] text-white/72 hover:bg-[#383838]")} type="button" onClick={() => setActivePanel("history")}>
                <History size={15} />
                History
              </button>
            </div>
            <div className="text-[12px] font-bold text-white/44">
              {activePanel === "templates" ? `${templatesLoading ? "Loading" : visibleTemplates.length} templates` : `${historyProjects.length} projects`}
            </div>
          </div>
          <label className="flex h-[38px] w-full items-center gap-2 rounded-full border border-white/10 bg-[#303030] px-3.5 text-white/58 md:w-[min(340px,42vw)]">
            <Search size={15} />
            <input className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold text-white outline-none placeholder:text-white/42" value={query} placeholder="Search templates" onChange={(event) => setQuery(event.currentTarget.value)} />
          </label>
        </div>

        {activePanel === "templates" ? (
          <>
            <div className={cn("mt-4 flex gap-2 overflow-x-auto pb-2", scrollbarHidden)}>
              <CategoryButton
                active={selectedCategory === "All"}
                count={slideTemplates.length}
                label="All"
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
          <RecentEmptyState />
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

function Composer(props: {
  creating: boolean;
  localAgentProviders: LocalAgentProviderStatus[];
  outputType: OutputType;
  prompt: string;
  selectedAgent: string;
  onCreate: () => void;
  onOutputTypeChange: (type: OutputType) => void;
  onPromptChange: (value: string) => void;
  onSelectedAgentChange: (value: string) => void;
}) {
  const canSubmit = props.prompt.trim().length > 0 && !props.creating;

  return (
    <div className="mt-8 w-full rounded-[20px] border border-white/10 bg-[#303030] p-4 text-left shadow-[0_22px_80px_rgba(0,0,0,0.42)]">
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormatOption
          active={props.outputType === "html"}
          description="Editable slide runtime"
          icon={<FileCode2 size={20} />}
          label="Deck"
          onClick={() => props.onOutputTypeChange("html")}
        />
        <FormatOption
          active={props.outputType === "pptx"}
          description="PowerPoint package"
          icon={<FileText size={20} />}
          label="PPTX"
          onClick={() => props.onOutputTypeChange("pptx")}
        />
      </div>

      <textarea
        className="block h-[108px] w-full resize-none border-0 bg-transparent px-1 pb-2 text-[15px] leading-6 text-white outline-none placeholder:text-white/42"
        value={props.prompt}
        placeholder="Ask for a pitch deck, lesson deck, board update, research talk..."
        onChange={(event) => props.onPromptChange(event.currentTarget.value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <button className="grid size-9 shrink-0 place-items-center rounded-full border-0 bg-white text-black" type="button" title="Add source files">
          <Plus size={20} />
        </button>
        <AgentMenu localAgentProviders={props.localAgentProviders} selectedAgent={props.selectedAgent} onChange={props.onSelectedAgentChange} />
        <button className="inline-flex h-10 min-w-[108px] flex-1 items-center justify-center gap-2 rounded-full border-0 bg-white px-[18px] text-[13px] font-extrabold text-black disabled:cursor-default disabled:bg-white/16 disabled:text-white/36 md:flex-none" disabled={!canSubmit} type="button" title="Create deck" onClick={props.onCreate}>
          {props.creating ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
          Create
        </button>
      </div>
    </div>
  );
}

function FormatOption(props: { active: boolean; description: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={cn("flex min-h-16 min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition", props.active ? "border-white bg-white text-black" : "border-white/10 bg-[#2f2f2f] text-white/82 hover:border-white/20 hover:bg-[#363636]")} type="button" onClick={props.onClick}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", props.active ? (props.label === "PPTX" ? "bg-[#e9f0ff] text-[#2f66d9]" : "bg-[#e9f7ef] text-[#187a44]") : "bg-white/8 text-white/64")}>{props.icon}</span>
      <span className="grid min-w-0 gap-1">
        <span className="truncate text-[14px] font-extrabold leading-none">{props.label}</span>
        <small className="truncate text-[12px] font-bold text-current opacity-50">{props.description}</small>
      </span>
      {props.active ? (
        <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-black text-white">
          <Check size={14} />
        </span>
      ) : null}
    </button>
  );
}

function AgentMenu(props: { localAgentProviders: LocalAgentProviderStatus[]; selectedAgent: string; onChange: (value: string) => void }) {
  return (
    <label className="relative mr-auto flex h-9 w-auto flex-1 basis-[150px] items-center md:w-[168px] md:flex-none md:basis-auto">
      <select className="h-full w-full appearance-none rounded-full border border-white/10 bg-[#3b3b3b] px-4 pr-9 text-[13px] font-bold text-white outline-none" value={props.selectedAgent} aria-label="Select ACP agent" onChange={(event) => props.onChange(event.currentTarget.value)}>
        {agentProfiles.map((agent) => {
          const status = props.localAgentProviders.find((provider) => provider.provider === agent.provider);
          const available = status?.available ?? props.localAgentProviders.length === 0;
          return (
          <option disabled={!available} key={agent.id} value={agent.id}>
            {agent.label}{available ? "" : " unavailable"}
          </option>
          );
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 text-white/56" size={14} />
    </label>
  );
}

function CategoryButton(props: { active: boolean; count: number; label: string; onClick: () => void }) {
  return (
    <button className={cn("inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3.5 text-[12px] font-bold", props.active ? "bg-white text-black" : "bg-[#303030] text-white/72 hover:bg-[#383838]")} type="button" onClick={props.onClick}>
      <span>{humanizeCategory(props.label)}</span>
      <small className="opacity-50">{props.count}</small>
    </button>
  );
}

function BlankTemplateCard(props: { outputType: OutputType; onCreate: () => void }) {
  return (
    <button className="mb-5 flex h-[292px] w-full min-w-0 break-inside-avoid flex-col items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-[#303030] text-left text-inherit transition hover:-translate-y-0.5 hover:bg-[#373737] hover:shadow-[0_18px_46px_rgba(0,0,0,0.34)]" type="button" onClick={props.onCreate}>
      <span className="grid size-[58px] place-items-center rounded-full bg-white text-black">
        <Plus size={26} />
      </span>
      <strong className="text-[14px] font-extrabold">Blank deck</strong>
      <small className="text-white/48">Blank presentation</small>
      <em className="text-[11px] not-italic font-extrabold text-white/48">{props.outputType === "html" ? "DECK" : props.outputType.toUpperCase()}</em>
    </button>
  );
}

function TemplateCard(props: { showCategory: boolean; template: SlideTemplate; onSelect: (template: SlideTemplate) => void }) {
  const { template } = props;
  return (
    <button
      className="mb-5 grid w-full min-w-0 break-inside-avoid grid-rows-[auto_1fr] overflow-hidden rounded-lg border-0 bg-[#303030] text-left text-inherit shadow-[0_14px_34px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:bg-[#373737] hover:shadow-[0_18px_46px_rgba(0,0,0,0.34)]"
      type="button"
      aria-label={`Create ${template.name}`}
      onClick={() => props.onSelect(template)}
    >
      <span className="block aspect-video overflow-hidden bg-white">
        {template.coverImage ? <img className="block size-full object-cover" src={template.coverImage} alt="" loading="lazy" draggable={false} /> : <span className="grid h-full place-items-center p-5 text-center text-[12px] font-extrabold text-[#222]">{template.name}</span>}
      </span>
      <span className={cn("flex min-w-0 flex-col justify-start gap-[7px] p-3", props.showCategory ? "min-h-[92px]" : "min-h-0")}>
        <strong className="line-clamp-3 overflow-hidden text-[12px] font-extrabold leading-[1.35] text-white">{template.name}</strong>
        {props.showCategory ? <span className="mt-auto inline-flex h-6 w-fit max-w-full items-center overflow-hidden truncate rounded-full border border-white/10 bg-white/[0.07] px-2.5 text-[11px] font-bold text-white/62">{humanizeCategory(template.category)}</span> : null}
      </span>
    </button>
  );
}

function TemplatePreviewModal(props: {
  creating: boolean;
  selectedIndex: number;
  template: SlideTemplate;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
  onUseTemplate: (template: SlideTemplate) => void;
}) {
  const thumbnails =
    props.template.thumbnailImages.length > 0
      ? props.template.thumbnailImages
      : props.template.previewImages.length > 0
        ? props.template.previewImages
        : [props.template.coverImage].filter(Boolean);
  const previews = props.template.previewImages.length > 0 ? props.template.previewImages : thumbnails;
  const selectedIndex = Math.min(Math.max(props.selectedIndex, 0), Math.max(thumbnails.length - 1, 0));
  const selectedImage = previews[selectedIndex] ?? thumbnails[selectedIndex] ?? props.template.coverImage;
  const slideCount = Math.max(thumbnails.length, previews.length, props.template.slideCount);

  const move = (offset: -1 | 1) => {
    if (thumbnails.length === 0) return;
    props.onSelectIndex((selectedIndex + offset + thumbnails.length) % thumbnails.length);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/62 p-[18px]" role="presentation" onMouseDown={props.onClose}>
      <section
        aria-modal="true"
        className="relative flex h-[min(900px,calc(100vh_-_24px))] w-[min(960px,calc(100vw_-_24px))] flex-col overflow-hidden rounded-[18px] bg-white text-[#202124] shadow-[0_32px_120px_rgba(0,0,0,0.42)] max-md:h-auto max-md:max-h-[calc(100vh_-_20px)] max-md:w-[calc(100vw_-_20px)]"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="absolute right-7 top-5 z-[3] grid size-9 place-items-center border-0 bg-transparent text-[#80848c] max-md:right-4 max-md:top-3" type="button" aria-label="Close template preview" onClick={props.onClose}>
          <X size={26} />
        </button>

        <div className="grid shrink-0 basis-[340px] grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-7 px-[34px] pb-[18px] pt-[58px] max-md:basis-auto max-md:grid-cols-1 max-md:gap-6 max-md:px-[18px] max-md:pb-[18px] max-md:pt-[52px]">
          <div className="min-w-0">
            <div className="inline-flex h-[30px] max-w-full items-center overflow-hidden whitespace-nowrap rounded-[9px] bg-[#f2f3f5] px-3.5 text-[13px] font-black uppercase tracking-[0.08em] text-[#60636a] max-md:h-[34px]">{humanizeCategory(props.template.category)}</div>
            <h2 className="my-3 mt-[18px] max-w-full text-[30px] font-black leading-[1.16] text-[#202124] md:text-[32px]">{props.template.name}</h2>
            <div className="inline-flex h-[34px] max-w-full items-center gap-2.5 overflow-hidden rounded-[10px] bg-[#f5f5f5] px-3 text-[13px] font-bold text-[#6a6d74] max-md:h-10">
              <span className="text-[#9a9da3]">Name:</span>
              <code className="min-w-0 truncate font-mono">{props.template.slug}</code>
              <Copy size={18} />
            </div>
            <blockquote className="mt-[18px] line-clamp-2 max-w-[840px] overflow-hidden border-l-[5px] border-[#202124] pl-[18px] text-[16px] italic leading-[1.55] text-[#24262a] max-md:text-[17px]">{props.template.shortDescription || props.template.description}</blockquote>
          </div>

          <div className="relative self-center overflow-hidden rounded-[14px] border border-[#eceef1] bg-white shadow-[inset_0_0_0_1px_rgba(17,24,39,0.02)]">
            {selectedImage ? <img className="block aspect-video w-full object-cover" src={selectedImage} alt="" draggable={false} /> : <div className="grid aspect-video w-full place-items-center bg-[#f3f0ea] p-7 text-center text-[18px] font-extrabold text-[#202124]">{props.template.name}</div>}
            {thumbnails.length > 1 ? (
              <>
                <button className="absolute left-3 top-1/2 grid size-[46px] -translate-y-1/2 place-items-center rounded-full border border-[#202124]/8 bg-white/86 text-[#202124] shadow-[0_10px_24px_rgba(0,0,0,0.12)]" type="button" aria-label="Previous slide" onClick={() => move(-1)}>
                  <ChevronLeft size={30} />
                </button>
                <button className="absolute right-3 top-1/2 grid size-[46px] -translate-y-1/2 place-items-center rounded-full border border-[#202124]/8 bg-white/86 text-[#202124] shadow-[0_10px_24px_rgba(0,0,0,0.12)]" type="button" aria-label="Next slide" onClick={() => move(1)}>
                  <ChevronRight size={30} />
                </button>
              </>
            ) : null}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/64 px-2.5 py-1 text-[11px] font-extrabold text-white">
              {selectedIndex + 1} / {slideCount}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between gap-4 border-t border-[#eceef1] px-[34px] py-[18px] max-md:px-[18px]">
            <h3 className="m-0 text-[22px] font-black leading-tight text-[#202124]">All Slides</h3>
            <span className="text-[13px] font-bold text-[#80848c]">{slideCount} slides</span>
          </div>

          <div className="flex flex-wrap gap-4 px-[34px] pb-24 max-md:px-[18px]">
            {thumbnails.map((image, index) => (
              <button
                key={`${image}-${index}`}
                className={cn("relative basis-[calc(33.333%_-_11px)] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white p-0 text-left shadow-[0_10px_24px_rgba(0,0,0,0.08)] max-md:basis-full", index === selectedIndex ? "border-[#202124] ring-2 ring-[#202124]/12" : "")}
                type="button"
                aria-label={`Preview slide ${index + 1}`}
                onClick={() => props.onSelectIndex(index)}
              >
                <span className="absolute left-2 top-2 z-[2] rounded-md bg-black/58 px-1.5 py-1 font-mono text-[10px] font-black text-white">{String(index + 1).padStart(2, "0")}</span>
                <img className="block aspect-video w-full object-cover" src={image} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex justify-end border-t border-[#eceef1] bg-white/96 px-[34px] py-4 backdrop-blur max-md:px-[18px]">
          <button className="h-10 rounded-xl border-0 bg-[#202124] px-7 text-[15px] font-extrabold text-white disabled:cursor-default disabled:bg-[#d1d5db]" type="button" disabled={props.creating} onClick={() => props.onUseTemplate(props.template)}>
            {props.creating ? "Adding..." : "Use"}
          </button>
        </div>
      </section>
    </div>
  );
}

function EditorPlaceholder(props: {
  activeSelectionText: string;
  conversationError: string;
  conversationItems: SlideRunTimelineItem[];
  conversationLoading: boolean;
  detail: ProjectDetailResponse | null;
  error: string;
  loading: boolean;
  pptxError: string;
  pptxRuntime: ReturnType<typeof usePptxArtifactRuntime>["runtime"];
  projectId: string;
  sending: boolean;
  onBackHome: () => void;
  onCancel: (runId: string) => Promise<void>;
  onPptxSelectionChange: ReturnType<typeof usePptxArtifactRuntime>["updateSelection"];
  onSend: (prompt: string) => Promise<void>;
}) {
  const [deckSaveState, setDeckSaveState] = useState<ArtifactSaveState>("saved");
  const artifactType = props.detail?.artifact.type ?? "deck";
  const headerSaveState: ArtifactSaveState = props.loading ? "loading" : props.pptxError ? "error" : artifactType === "deck" ? deckSaveState : "saved";

  return (
    <ArtifactEditorFrame
      sidebar={
        <AgentConversationPanel
          activeSelectionText={props.activeSelectionText}
          artifactLabel={props.detail?.artifact.type ?? "deck"}
          dirty={false}
          error={props.conversationError || props.error || props.pptxError}
          items={props.conversationItems}
          loading={props.conversationLoading}
          sending={props.sending}
          onBackHome={props.onBackHome}
          onCancel={props.onCancel}
          onSend={props.onSend}
        />
      }
    >
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#242424]">
        <ArtifactWorkspaceHeader
          title={props.detail?.project.title ?? "Untitled Presentation"}
          saveState={headerSaveState}
          exportItems={slideExportItems(props.projectId, artifactType)}
        />
        {props.loading ? (
          <EditorInfoPanel title="Loading presentation..." />
        ) : props.error ? (
          <EditorInfoPanel detail={props.error} title="Presentation not found" />
        ) : props.detail?.artifact.type === "deck" ? (
          <DeckEditor detail={props.detail} projectId={props.projectId} onSaveStateChange={setDeckSaveState} />
        ) : props.detail?.artifact.type === "pptx" && props.pptxRuntime ? (
          <PptxPreview
            runtime={props.pptxRuntime}
            error={props.pptxError}
            onSelectionChange={props.onPptxSelectionChange}
          />
        ) : props.detail ? (
          <EditorInfoPanel
            detail={`Waiting for ${props.detail.artifact.fileRef}`}
            title={props.detail.project.title}
          />
        ) : null}
      </section>
    </ArtifactEditorFrame>
  );
}

type ActiveDeckObject = {
  slideId: string;
  objectId: string;
  objectType: string;
  label: string;
};

type ActiveDeckSelectionBox = {
  slideId: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type ActiveTextEdit = {
  slideId: string;
  objectId: string;
  textTargetId: string;
};

type DeckSelectionMode = "idle" | "object" | "text";

type ResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

type DeckObjectElement = HTMLElement | SVGElement;

type DeckToolbarState = {
  block: "normal" | "heading" | "shape" | "image";
  fontFamily: string;
  fontSize: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  textColor: string;
  fillColor: string;
  align: "left" | "center" | "right" | "";
};

type FrameRecord = {
  iframe: HTMLIFrameElement;
  saveTimer: ReturnType<typeof setTimeout> | null;
};

type DeckSlideHistory = {
  entries: string[];
  currentIndex: number;
};

type ResizeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const defaultDeckToolbarState: DeckToolbarState = {
  block: "normal",
  fontFamily: "'PingFang SC', sans-serif",
  fontSize: "16",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textColor: "#1f2937",
  fillColor: "#ffffff",
  align: "",
};

const selectedDeckObjectToolbarState: DeckToolbarState = {
  block: "normal",
  fontFamily: "Inter, sans-serif",
  fontSize: "16",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textColor: "#000000",
  fillColor: "#ffffff",
  align: "",
};

const deckFontOptions = [
  { value: "'PingFang SC', sans-serif", label: "PingFang SC" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "'IBM Plex Sans', sans-serif", label: "IBM Plex Sans" },
  { value: "'IBM Plex Mono', monospace", label: "IBM Plex Mono" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'STIX Two Text', serif", label: "STIX Two Text" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', serif", label: "Times" },
];

const resizeHandles: ResizeHandle[] = ["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"];
const maxDeckHistoryEntries = 100;

function DeckEditor(props: { detail: ProjectDetailResponse; projectId: string; onSaveStateChange: (state: ArtifactSaveState) => void }) {
  const { onSaveStateChange } = props;
  const { ref: hostRef, width: hostWidth, height: hostHeight } = useElementSize<HTMLDivElement>();
  const frameRecordsRef = useRef(new Map<string, FrameRecord>());
  const initializedFramesRef = useRef(new WeakSet<Document>());
  const deckHistoryRef = useRef(new Map<string, DeckSlideHistory>());
  const applyingHistoryRef = useRef(new Set<string>());
  const [activeObject, setActiveObject] = useState<ActiveDeckObject | null>(null);
  const [activeSelectionBox, setActiveSelectionBox] = useState<ActiveDeckSelectionBox | null>(null);
  const [activeTextEdit, setActiveTextEdit] = useState<ActiveTextEdit | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<DeckSelectionMode>("idle");
  const [toolbarState, setToolbarState] = useState<DeckToolbarState>(defaultDeckToolbarState);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [historyVersion, setHistoryVersion] = useState(0);
  const manifest = props.detail.deckManifest;
  const canvas = manifest?.canvas ?? { width: 1920, height: 1080 };
  const slides = manifest?.slides ?? [];
  const activeSlide = slides.find((slide) => slide.id === activeSlideId) ?? slides[0] ?? null;
  const activeSlideIndex = activeSlide ? slides.findIndex((slide) => slide.id === activeSlide.id) : -1;
  const availableFrameWidth = Math.max(0, hostWidth - 64);
  const availableFrameHeight = Math.max(0, hostHeight - 92);
  const scale = fitScale({ availableHeight: availableFrameHeight, availableWidth: availableFrameWidth, height: canvas.height, minScale: 0.4, width: canvas.width });
  const frameHeight = scaledHeight({ height: canvas.height, scale });
  const deckThumbnail = thumbnailMetrics({ height: canvas.height, width: canvas.width });
  const activeHistory = useMemo(() => (activeSlideId ? deckHistoryRef.current.get(activeSlideId) ?? null : null), [activeSlideId, historyVersion]);
  const canUndo = Boolean(activeHistory && activeHistory.currentIndex > 0);
  const canRedo = Boolean(activeHistory && activeHistory.currentIndex < activeHistory.entries.length - 1);

  useEffect(() => {
    onSaveStateChange(saveState);
  }, [onSaveStateChange, saveState]);

  useEffect(() => {
    return () => {
      for (const record of frameRecordsRef.current.values()) {
        if (record.saveTimer) clearTimeout(record.saveTimer);
      }
      frameRecordsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!activeSlideId && slides[0]?.id) setActiveSlideId(slides[0].id);
  }, [activeSlideId, slides]);

  useEffect(() => {
    if (!activeObject) return;
    const object = findActiveObject();
    if (object) setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
  }, [activeObject, scale]);

  const clearSelections = () => {
    for (const record of frameRecordsRef.current.values()) {
      const doc = record.iframe.contentDocument;
      doc?.querySelectorAll("[data-ai-slide-selected]").forEach((element) => element.removeAttribute("data-ai-slide-selected"));
    }
  };

  const exitTextEditMode = () => {
    for (const record of frameRecordsRef.current.values()) {
      const doc = record.iframe.contentDocument;
      if (!doc) continue;
      doc.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach((element) => {
        element.removeAttribute("contenteditable");
        element.removeAttribute("spellcheck");
      });
      doc.defaultView?.getSelection()?.removeAllRanges();
    }
  };

  const findActiveObject = () => {
    if (!activeObject) return null;
    const doc = frameRecordsRef.current.get(activeObject.slideId)?.iframe.contentDocument;
    return doc?.querySelector<DeckObjectElement>(`[data-ai-slide-object-id="${CSS.escape(activeObject.objectId)}"]`) ?? null;
  };

  const findActiveTextTarget = (object: DeckObjectElement) => {
    if (!activeTextEdit) return textTargetForObject(object);
    return findTextTargetById(object, activeTextEdit.textTargetId) ?? textTargetForObject(object);
  };

  const selectObject = (slideId: string, object: DeckObjectElement, mode: "object" | "text" = "object", textTarget?: DeckObjectElement) => {
    const objectId = object.getAttribute("data-ai-slide-object-id");
    if (!objectId) return;
    setActiveSlideId(slideId);
    if (mode !== "text") exitTextEditMode();
    clearSelections();
    if (mode === "object") object.setAttribute("data-ai-slide-selected", "true");
    const activeTextTarget = mode === "text" ? ensureTextTargetId(textTarget ?? textTargetForObject(object)) : null;
    const nextActiveObject = {
      slideId,
      objectId,
      objectType: object.getAttribute("data-object-type") ?? "object",
      label: object.getAttribute("data-screen-label") || object.textContent?.trim().slice(0, 64) || "Object",
    };
    setActiveObject(nextActiveObject);
    setActiveSelectionBox(readSelectionBox(slideId, object, scale));
    setActiveTextEdit(activeTextTarget ? { slideId, objectId, textTargetId: activeTextTarget.getAttribute("data-ai-slide-text-edit-id") ?? "" } : null);
    setSelectionMode(mode);
    setToolbarState(activeTextTarget ? readActualDeckToolbarState(object, activeTextTarget) : readDeckToolbarState(object));
  };

  const clearActiveSelection = (options: { preserveToolbar?: boolean } = {}) => {
    exitTextEditMode();
    clearSelections();
    setActiveObject(null);
    setActiveSelectionBox(null);
    setActiveTextEdit(null);
    setSelectionMode("idle");
    if (!options.preserveToolbar) setToolbarState(defaultDeckToolbarState);
  };

  const activateSlide = (slideId: string) => {
    if (slideId === activeSlideId) return;
    clearActiveSelection();
    setActiveSlideId(slideId);
  };

  const navigateSlide = (direction: -1 | 1, fromSlideId = activeSlideId) => {
    if (!slides.length) return;
    const sourceIndex = fromSlideId ? slides.findIndex((slide) => slide.id === fromSlideId) : -1;
    const currentIndex = sourceIndex >= 0 ? sourceIndex : activeSlideIndex >= 0 ? activeSlideIndex : 0;
    const nextIndex = nextSlideIndex({ count: slides.length, currentIndex, direction });
    const nextSlide = slides[nextIndex];
    if (!nextSlide || nextIndex === currentIndex) return;
    activateSlide(nextSlide.id);
  };

  const bumpHistoryVersion = () => setHistoryVersion((version) => version + 1);

  const recordSlideHistory = (slideId: string, doc: Document) => {
    if (applyingHistoryRef.current.has(slideId)) return;
    const html = serializeSlideDocument(doc);
    const current = deckHistoryRef.current.get(slideId);
    if (current?.entries[current.currentIndex] === html) return;
    const entries = current ? current.entries.slice(0, current.currentIndex + 1) : [];
    entries.push(html);
    if (entries.length > maxDeckHistoryEntries) entries.splice(0, entries.length - maxDeckHistoryEntries);
    deckHistoryRef.current.set(slideId, {
      entries,
      currentIndex: entries.length - 1,
    });
    bumpHistoryVersion();
  };

  const ensureInitialSlideHistory = (slideId: string, doc: Document) => {
    if (deckHistoryRef.current.has(slideId)) return;
    deckHistoryRef.current.set(slideId, {
      entries: [serializeSlideDocument(doc)],
      currentIndex: 0,
    });
    bumpHistoryVersion();
  };

  const scheduleSlideSave = (slideId: string) => {
    const record = frameRecordsRef.current.get(slideId);
    const doc = record?.iframe.contentDocument;
    if (!record || !doc) return;
    if (record.saveTimer) clearTimeout(record.saveTimer);
    setSaveState("saving");
    record.saveTimer = setTimeout(() => {
      const html = serializeSlideDocument(doc);
      void updateDeckSlideHtml(props.projectId, slideId, { html })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 650);
  };

  const applyHistoryOffset = (offset: -1 | 1, requestedSlideId = activeSlideId) => {
    if (!requestedSlideId) return;
    const history = deckHistoryRef.current.get(requestedSlideId);
    if (!history) return;
    const nextIndex = history.currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= history.entries.length) return;
    const record = frameRecordsRef.current.get(requestedSlideId);
    const doc = record?.iframe.contentDocument;
    if (!doc) return;
    applyingHistoryRef.current.add(requestedSlideId);
    try {
      applySlideHtmlSnapshot(doc, history.entries[nextIndex]);
      prepareSlideEditorDocument(doc);
      history.currentIndex = nextIndex;
      deckHistoryRef.current.set(requestedSlideId, history);
      clearActiveSelection();
      setActiveSlideId(requestedSlideId);
      scheduleSlideSave(requestedSlideId);
      bumpHistoryVersion();
    } finally {
      applyingHistoryRef.current.delete(requestedSlideId);
    }
  };

  const handleHistoryShortcut = (event: KeyboardEvent, slideId = activeSlideId) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "y" || (key === "z" && event.shiftKey)) applyHistoryOffset(1, slideId);
    else applyHistoryOffset(-1, slideId);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleHistoryShortcut(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handleSlideNavigationKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (shouldIgnoreSlideNavigationEvent(event)) return;
    const direction = slideDirectionFromKey(event.key, "vertical");
    if (!direction) return;
    event.preventDefault();
    navigateSlide(direction);
  };

  const initializeFrame = (slide: DeckManifestSlide, iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    const previous = frameRecordsRef.current.get(slide.id);
    if (previous?.saveTimer) clearTimeout(previous.saveTimer);
    frameRecordsRef.current.set(slide.id, { iframe, saveTimer: null });
    const doc = iframe.contentDocument;
    if (!doc || !doc.head || !doc.body || initializedFramesRef.current.has(doc)) return;
    initializedFramesRef.current.add(doc);
    prepareSlideEditorDocument(doc);
    if (doc.location.href !== "about:blank") ensureInitialSlideHistory(slide.id, doc);
    doc.addEventListener(
      "click",
      (event) => {
        setActiveSlideId(slide.id);
        const target = isElement(event.target) ? event.target.closest<DeckObjectElement>('[data-object="true"]') : null;
        if (!target) {
          clearActiveSelection({ preserveToolbar: true });
          return;
        }
        if (isInsideEditable(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        selectObject(slide.id, target);
      },
      true,
    );
    doc.addEventListener(
      "dblclick",
      (event) => {
        setActiveSlideId(slide.id);
        const target = isElement(event.target) ? event.target.closest<DeckObjectElement>('[data-object="true"]') : null;
        if (!target) return;
        if (target.getAttribute("data-object-type") === "textbox") enterTextEditMode(slide.id, target, isElement(event.target) ? event.target : undefined);
        else selectObject(slide.id, target);
      },
      true,
    );
    doc.addEventListener(
      "input",
      () => {
        recordSlideHistory(slide.id, doc);
        scheduleSlideSave(slide.id);
      },
      true,
    );
    doc.addEventListener("keydown", (event) => handleHistoryShortcut(event, slide.id), true);
  };

  const selectObjectFromFramePoint = (slide: DeckManifestSlide, clientX: number, clientY: number) => {
    const iframe = frameRecordsRef.current.get(slide.id)?.iframe;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;
    setActiveSlideId(slide.id);
    initializeFrame(slide, iframe);
    const rect = iframe.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const target = hitTestDeckObject(doc, x, y) ?? hitTestDeckObjectFromElementPoint(doc, x, y);
    if (target) selectObject(slide.id, target);
    else if (activeTextEdit?.slideId === slide.id) clearActiveSelection({ preserveToolbar: true });
  };

  const enterTextEditFromFramePoint = (slide: DeckManifestSlide, clientX: number, clientY: number) => {
    const iframe = frameRecordsRef.current.get(slide.id)?.iframe;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;
    setActiveSlideId(slide.id);
    initializeFrame(slide, iframe);
    const rect = iframe.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const target = hitTestDeckObject(doc, x, y) ?? hitTestDeckObjectFromElementPoint(doc, x, y);
    if (!target) return;
    if (target.getAttribute("data-object-type") === "textbox") enterTextEditMode(slide.id, target, textTargetForObjectAtPoint(target, x, y));
    else selectObject(slide.id, target);
  };

  const enterTextEditMode = (slideId: string, object: DeckObjectElement, preferredTarget?: Element) => {
    setActiveSlideId(slideId);
    if (!isHtmlElement(object)) {
      selectObject(slideId, object);
      return;
    }
    const textTarget = textTargetForObject(object, preferredTarget);
    if (!isHtmlElement(textTarget)) {
      selectObject(slideId, object);
      return;
    }
    selectObject(slideId, object, "text", textTarget);
    textTarget.contentEditable = "true";
    textTarget.spellcheck = true;
    textTarget.focus();
    selectElementText(textTarget);
  };

  const beginResizeObject = (handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const object = findActiveObject();
    if (!object || !activeObject || !activeSelectionBox || scale <= 0) return;
    const initialRect = readObjectRect(object);
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - startClientX) / scale;
      const deltaY = (moveEvent.clientY - startClientY) / scale;
      const nextRect = resizedRectForHandle(handle, initialRect, deltaX, deltaY, canvas.width, canvas.height);
      applyObjectRect(object, nextRect);
      setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
    };

    const onPointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
      recordSlideHistory(activeObject.slideId, object.ownerDocument);
      scheduleSlideSave(activeObject.slideId);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  };

  const mutateActiveObject = (mutate: (object: DeckObjectElement, textTarget: DeckObjectElement) => void) => {
    const object = findActiveObject();
    if (!object || !activeObject) return;
    const textTarget = findActiveTextTarget(object);
    mutate(object, textTarget);
    if (!activeTextEdit) object.setAttribute("data-ai-slide-selected", "true");
    setActiveSelectionBox(readSelectionBox(activeObject.slideId, object, scale));
    setToolbarState(activeTextEdit ? readActualDeckToolbarState(object, textTarget) : readDeckToolbarState(object));
    recordSlideHistory(activeObject.slideId, object.ownerDocument);
    scheduleSlideSave(activeObject.slideId);
  };

  const updateTextStyle = (style: Partial<CSSStyleDeclaration>) => {
    if (!activeTextEdit) return;
    mutateActiveObject((_object, textTarget) => {
      Object.assign(textTarget.style, style);
    });
  };

  const updateObjectStyle = (style: Partial<CSSStyleDeclaration>) => {
    mutateActiveObject((object) => {
      Object.assign(object.style, style);
    });
  };

  const duplicateActiveObject = () => {
    mutateActiveObject((object) => {
      const clone = object.cloneNode(true) as DeckObjectElement;
      clone.removeAttribute("data-ai-slide-selected");
      clone.removeAttribute("contenteditable");
      clone.querySelectorAll?.("[contenteditable], [data-ai-slide-text-edit-id]").forEach((element) => {
        element.removeAttribute("contenteditable");
        element.removeAttribute("spellcheck");
        element.removeAttribute("data-ai-slide-text-edit-id");
      });
      clone.setAttribute("data-ai-slide-object-id", `object-${Date.now().toString(36)}`);
      clone.style.left = offsetPx(clone.style.left, 24);
      clone.style.top = offsetPx(clone.style.top, 24);
      object.after(clone);
    });
  };

  const deleteActiveObject = () => {
    const object = findActiveObject();
    if (!object || !activeObject) return;
    object.remove();
    setActiveObject(null);
    setActiveSelectionBox(null);
    setActiveTextEdit(null);
    setSelectionMode("idle");
    recordSlideHistory(activeObject.slideId, object.ownerDocument);
    scheduleSlideSave(activeObject.slideId);
  };

  if (!manifest || slides.length === 0) {
    return <EditorInfoPanel detail="Deck manifest is empty or unavailable." title={props.detail.project.title} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#2a2a2a] px-3 py-3.5 md:px-6 md:pb-6 md:pt-5">
      <DeckToolbar
        activeObject={activeObject}
        saveState={saveState}
        selectionMode={selectionMode}
        state={toolbarState}
        canRedo={canRedo}
        canUndo={canUndo}
        onAlign={(align) => updateTextStyle({ textAlign: align })}
        onDelete={deleteActiveObject}
        onDuplicate={duplicateActiveObject}
        onFillColor={(color) => updateObjectStyle({ backgroundColor: color })}
        onFontFamily={(fontFamily) => updateTextStyle({ fontFamily })}
        onFontSize={(fontSize) => updateTextStyle({ fontSize: normalizeCssSize(fontSize) })}
        onRedo={() => applyHistoryOffset(1)}
        onTextColor={(color) => updateTextStyle({ color })}
        onToggleBold={() => updateTextStyle({ fontWeight: toolbarState.bold ? "400" : "800" })}
        onToggleItalic={() => updateTextStyle({ fontStyle: toolbarState.italic ? "normal" : "italic" })}
        onUndo={() => applyHistoryOffset(-1)}
      />
      <div
        ref={hostRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-0 pb-5 pt-2.5 outline-none md:px-2 md:pb-7 md:pt-3"
        tabIndex={0}
        onKeyDown={handleSlideNavigationKey}
        onPointerDown={(event) => {
          if (!activeTextEdit) event.currentTarget.focus();
        }}
      >
        {activeSlide ? (
          (() => {
            const slide = activeSlide;
            const isTextEditingSlide = activeTextEdit?.slideId === slide.id && activeSelectionBox?.slideId === slide.id;
            const shieldRects = isTextEditingSlide
              ? editingShieldRects(activeSelectionBox, Math.round(canvas.width * scale), frameHeight)
              : [];
            return (
              <article className="w-[min(100%,1100px)] min-w-0 shrink-0" key={slide.id}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="inline-flex h-6 items-center rounded-md bg-white/10 px-[7px] font-mono text-[12px] font-black text-white/72">{String(activeSlideIndex + 1).padStart(2, "0")}</span>
                  <strong className="min-w-0 truncate text-[12px] font-extrabold text-white/78">{slide.title}</strong>
                </div>
                <div className={cn("relative overflow-hidden rounded-[2px] border border-black/30 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.55)]", selectionMode === "object" && activeObject?.slideId === slide.id ? "border-blue-500/75" : "")} style={{ height: frameHeight || undefined }}>
                  <iframe
                    className="absolute left-0 top-0 block origin-top-left border-0"
                    ref={(iframe) => {
                      if (iframe) initializeFrame(slide, iframe);
                    }}
                    src={projectAssetUrl(props.projectId, props.detail.artifact.fileRef, slide.file, props.detail.artifact.revision)}
                    style={{
                      width: canvas.width,
                      height: canvas.height,
                      transform: `scale(${scale})`,
                    }}
                    title={slide.title}
                    onLoad={(event) => initializeFrame(slide, event.currentTarget)}
                  />
                  {activeSelectionBox?.slideId === slide.id && activeTextEdit?.slideId !== slide.id ? (
                    <>
                      <div
                        className="pointer-events-none absolute z-[3] border border-violet-500 shadow-none"
                        style={{
                          left: activeSelectionBox.left,
                          top: activeSelectionBox.top,
                          width: activeSelectionBox.width,
                          height: activeSelectionBox.height,
                        }}
                      >
                        {resizeHandles.map((handle) => (
                          <button
                            aria-label={`Resize ${handle}`}
                            className={cn("pointer-events-auto absolute size-2 rounded-full border border-violet-500 bg-white p-0 shadow-[0_1px_4px_rgba(0,0,0,0.18)]", resizeHandlePosition[handle])}
                            data-handle={handle}
                            key={handle}
                            type="button"
                            onPointerDown={(event) => beginResizeObject(handle, event)}
                          />
                        ))}
                      </div>
                      <div
                        className="absolute z-[4] inline-flex h-[30px] -translate-x-1/2 -translate-y-[calc(100%_+_8px)] items-center gap-px rounded-md border border-black/8 bg-white p-[3px] shadow-[0_8px_22px_rgba(0,0,0,0.16)] [&>button]:grid [&>button]:size-[22px] [&>button]:place-items-center [&>button]:rounded-[5px] [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-black/58 [&>button:hover]:bg-black/[0.06] [&>button:hover]:text-[#111]"
                        style={{
                          left: activeSelectionBox.left + activeSelectionBox.width / 2,
                          top: activeSelectionBox.top,
                        }}
                      >
                        <button type="button" title="Duplicate object" onClick={duplicateActiveObject}>
                          <Copy size={13} />
                        </button>
                        <button type="button" title="Delete object" onClick={deleteActiveObject}>
                          <Trash2 size={13} />
                        </button>
                        <button type="button" title="Move object">
                          <Move size={13} />
                        </button>
                      </div>
                    </>
                  ) : null}
                  {isTextEditingSlide ? (
                    shieldRects.map((shield, shieldIndex) => (
                      <div
                        className="absolute z-[2] cursor-default bg-transparent"
                        key={shieldIndex}
                        role="presentation"
                        style={shield}
                        onPointerDown={(event) => selectObjectFromFramePoint(slide, event.clientX, event.clientY)}
                        onDoubleClick={(event) => enterTextEditFromFramePoint(slide, event.clientX, event.clientY)}
                      />
                    ))
                  ) : (
                    <div
                      className="absolute inset-0 z-[2] cursor-default bg-transparent"
                      role="presentation"
                      onPointerDown={(event) => selectObjectFromFramePoint(slide, event.clientX, event.clientY)}
                      onDoubleClick={(event) => enterTextEditFromFramePoint(slide, event.clientX, event.clientY)}
                    />
                  )}
                </div>
              </article>
            );
          })()
        ) : null}
      </div>
      <SlideFilmstrip
        activeId={activeSlide?.id ?? null}
        ariaLabel="Slides"
        className={slideFilmstripClass}
        frameHeight={deckThumbnail.height}
        frameWidth={deckThumbnail.width}
        items={slides.map((slide, index) => ({
          id: slide.id,
          label: String(index + 1).padStart(2, "0"),
          title: slide.title,
        }))}
        renderPreview={(item) => {
          const slide = slides.find((candidate) => candidate.id === item.id);
          if (!slide) return null;
          return (
            <iframe
              src={projectAssetUrl(props.projectId, props.detail.artifact.fileRef, slide.file)}
              style={{
                width: canvas.width,
                height: canvas.height,
                transform: `scale(${deckThumbnail.scale})`,
              }}
              tabIndex={-1}
              title={`${slide.title} thumbnail`}
            />
          );
        }}
        onSelect={activateSlide}
      />
    </div>
  );
}

function DeckToolbar(props: {
  activeObject: ActiveDeckObject | null;
  canRedo: boolean;
  canUndo: boolean;
  saveState: "saved" | "saving" | "error";
  selectionMode: DeckSelectionMode;
  state: DeckToolbarState;
  onAlign: (align: "left" | "center" | "right") => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFillColor: (color: string) => void;
  onFontFamily: (fontFamily: string) => void;
  onFontSize: (fontSize: string) => void;
  onRedo: () => void;
  onTextColor: (color: string) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onUndo: () => void;
}) {
  const disabled = !props.activeObject;
  const hasCurrentFontOption = deckFontOptions.some((option) => option.value === props.state.fontFamily);
  return (
    <Toolbar display={{ maxWidth: 1500 }}>
      <ToolbarRow>
        <ToolbarGroup>
          <ToolbarIconButton disabled={!props.canUndo} title="Undo" onClick={props.onUndo}>
            <Undo2 size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton disabled={!props.canRedo} title="Redo" onClick={props.onRedo}>
            <Redo2 size={16} />
          </ToolbarIconButton>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup className="[column-gap:4px]">
          <ToolbarSelect compact disabled={disabled} title="Block style" value={props.state.block} onChange={() => {}}>
            <option value="normal">Normal Text</option>
            <option value="heading">Heading</option>
            <option value="shape">Shape</option>
            <option value="image">Image</option>
          </ToolbarSelect>
          <ToolbarSelect disabled={disabled} title="Font family" value={props.state.fontFamily} onChange={props.onFontFamily}>
            {hasCurrentFontOption ? null : <option value={props.state.fontFamily}>{fontFamilyLabel(props.state.fontFamily)}</option>}
            {deckFontOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ToolbarSelect>
          <ToolbarNumberInput disabled={disabled} title="Font size" value={props.state.fontSize} onChange={props.onFontSize} />
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarIconButton active={props.state.bold} disabled={disabled} title="Bold" onClick={props.onToggleBold}>
            <Bold size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.italic} disabled={disabled} title="Italic" onClick={props.onToggleItalic}>
            <Italic size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.underline} disabled={disabled} title="Underline" onClick={() => undefined}>
            <Underline size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.strikethrough} disabled={disabled} title="Strikethrough" onClick={() => undefined}>
            <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, textDecoration: "line-through" }}>S</span>
          </ToolbarIconButton>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarIconButton active={props.state.align === "left"} disabled={disabled} title="Align left" onClick={() => props.onAlign("left")}>
            <AlignLeft size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.align === "center"} disabled={disabled} title="Align center" onClick={() => props.onAlign("center")}>
            <AlignCenter size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.state.align === "right"} disabled={disabled} title="Align right" onClick={() => props.onAlign("right")}>
            <AlignRight size={16} />
          </ToolbarIconButton>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarColorInput disabled={disabled} title="Text color" color={props.state.textColor} onChange={props.onTextColor} />
          <ToolbarColorInput disabled={disabled} title="Fill color" color={props.state.fillColor} icon={<PaintBucket size={15} />} onChange={props.onFillColor} />
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarIconButton disabled={disabled} title="Image" onClick={() => undefined}>
            <Image size={16} />
          </ToolbarIconButton>
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup>
          <ToolbarIconButton disabled={disabled} title="Duplicate object" onClick={props.onDuplicate}>
            <Copy size={16} />
          </ToolbarIconButton>
          <ToolbarIconButton disabled={disabled} title="Delete object" onClick={props.onDelete}>
            <Trash2 size={16} />
          </ToolbarIconButton>
        </ToolbarGroup>
      </ToolbarRow>
    </Toolbar>
  );
}

const textBlockTags = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "TD", "TH", "BLOCKQUOTE", "FIGCAPTION"]);
const inlineTextTags = new Set(["SPAN", "STRONG", "EM", "B", "I", "SMALL", "A", "CODE", "MARK"]);

function textTargetForObject(object: DeckObjectElement, preferredTarget?: Element): DeckObjectElement {
  if (isHtmlElement(object) && object.getAttribute("data-object-type") === "textbox") {
    return textTargetFromPreferredElement(object, preferredTarget) ?? firstTextTargetForObject(object) ?? object;
  }
  return object;
}

function textTargetForObjectAtPoint(object: DeckObjectElement, x: number, y: number): DeckObjectElement {
  const hit = object.ownerDocument.elementFromPoint(x, y);
  return textTargetForObject(object, isElement(hit) ? hit : undefined);
}

function textTargetFromPreferredElement(object: HTMLElement, preferredTarget: Element | undefined): DeckObjectElement | null {
  if (!preferredTarget || !object.contains(preferredTarget)) return null;
  let cursor: Element | null = preferredTarget;
  let inlineFallback: HTMLElement | null = null;
  while (cursor && cursor !== object) {
    if (isHtmlElement(cursor) && hasEditableText(cursor)) {
      if (textBlockTags.has(cursor.tagName)) return cursor;
      if (!inlineFallback && inlineTextTags.has(cursor.tagName)) inlineFallback = cursor;
    }
    cursor = cursor.parentElement;
  }
  if (inlineFallback) return inlineFallback;
  return hasEditableText(object) ? object : null;
}

function firstTextTargetForObject(object: HTMLElement): DeckObjectElement | null {
  const candidates = Array.from(object.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption, span"));
  return candidates.find(hasEditableText) ?? null;
}

function hasEditableText(element: HTMLElement) {
  return Boolean(element.textContent?.replace(/\s+/g, " ").trim());
}

function ensureTextTargetId(target: DeckObjectElement): DeckObjectElement | null {
  if (!isHtmlElement(target)) return null;
  if (!target.getAttribute("data-ai-slide-text-edit-id")) {
    target.setAttribute("data-ai-slide-text-edit-id", `text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
  }
  return target;
}

function findTextTargetById(object: DeckObjectElement, textTargetId: string) {
  if (!textTargetId || !isHtmlElement(object)) return null;
  return object.querySelector<DeckObjectElement>(`[data-ai-slide-text-edit-id="${CSS.escape(textTargetId)}"]`);
}

function isHtmlElement(value: unknown): value is HTMLElement {
  return isElement(value) && value.ownerDocument.defaultView ? value instanceof value.ownerDocument.defaultView.HTMLElement : false;
}

function isSvgElement(value: unknown): value is SVGElement {
  return isElement(value) && value.ownerDocument.defaultView ? value instanceof value.ownerDocument.defaultView.SVGElement : false;
}

function isElement(value: unknown): value is Element {
  return Boolean(value && typeof value === "object" && "ownerDocument" in value && "closest" in value);
}

function isInsideEditable(value: unknown) {
  return isElement(value) && Boolean(value.closest('[contenteditable="true"]'));
}

function selectElementText(element: HTMLElement) {
  const doc = element.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function hitTestDeckObject(doc: Document, x: number, y: number): DeckObjectElement | null {
  const view = doc.defaultView;
  const candidates = Array.from(doc.querySelectorAll<DeckObjectElement>('[data-object="true"]'))
    .map((object, order) => {
      const rect = object.getBoundingClientRect();
      const zIndex = Number.parseInt(view?.getComputedStyle(object).zIndex ?? "0", 10);
      return {
        object,
        order,
        zIndex: Number.isFinite(zIndex) ? zIndex : 0,
        area: rect.width * rect.height,
        depth: objectDepth(object),
        rect,
      };
    })
    .filter(({ rect }) => rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  candidates.sort((a, b) => a.zIndex - b.zIndex || a.depth - b.depth || b.area - a.area || a.order - b.order);
  return candidates.at(-1)?.object ?? null;
}

function hitTestDeckObjectFromElementPoint(doc: Document, x: number, y: number): DeckObjectElement | null {
  const hit = doc.elementFromPoint(x, y);
  return isElement(hit) ? hit.closest<DeckObjectElement>('[data-object="true"]') : null;
}

function objectDepth(object: Element) {
  let depth = 0;
  let cursor = object.parentElement;
  while (cursor) {
    depth += 1;
    cursor = cursor.parentElement;
  }
  return depth;
}

function readSelectionBox(slideId: string, object: DeckObjectElement, scale: number): ActiveDeckSelectionBox {
  const rect = object.getBoundingClientRect();
  return {
    slideId,
    left: rect.left * scale,
    top: rect.top * scale,
    width: Math.max(1, rect.width * scale),
    height: Math.max(1, rect.height * scale),
  };
}

function readObjectRect(object: DeckObjectElement): ResizeRect {
  const rect = object.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function applyObjectRect(object: DeckObjectElement, rect: ResizeRect) {
  object.style.left = px(rect.left);
  object.style.top = px(rect.top);
  object.style.width = px(rect.width);
  object.style.height = px(rect.height);
  object.style.right = "auto";
  object.style.bottom = "auto";
  if (object.getAttribute("data-object-type") === "textbox") enableTextResizeWrapping(object);
  if (isSvgElement(object)) {
    object.setAttribute("width", px(rect.width));
    object.setAttribute("height", px(rect.height));
  }
}

function enableTextResizeWrapping(object: DeckObjectElement) {
  if (!isHtmlElement(object)) return;
  applyTextResizeWrapping(object);
  object.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, li, span, strong, em, b, i, small, a, div").forEach(applyTextResizeWrapping);
}

function applyTextResizeWrapping(element: HTMLElement) {
  element.style.minWidth = "0";
  element.style.maxWidth = "100%";
  element.style.whiteSpace = "normal";
  element.style.overflowWrap = "anywhere";
  element.style.wordBreak = "normal";
  element.style.lineBreak = "anywhere";
}

function resizedRectForHandle(handle: ResizeHandle, initial: ResizeRect, deltaX: number, deltaY: number, canvasWidth: number, canvasHeight: number): ResizeRect {
  const minWidth = 24;
  const minHeight = 24;
  let left = initial.left;
  let top = initial.top;
  let right = initial.left + initial.width;
  let bottom = initial.top + initial.height;

  if (handle.includes("left")) {
    left = clamp(initial.left + deltaX, 0, right - minWidth);
  }
  if (handle.includes("right")) {
    right = clamp(initial.left + initial.width + deltaX, left + minWidth, canvasWidth);
  }
  if (handle.includes("top")) {
    top = clamp(initial.top + deltaY, 0, bottom - minHeight);
  }
  if (handle.includes("bottom")) {
    bottom = clamp(initial.top + initial.height + deltaY, top + minHeight, canvasHeight);
  }

  return {
    left,
    top,
    width: Math.max(minWidth, right - left),
    height: Math.max(minHeight, bottom - top),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function px(value: number) {
  return `${Math.round(value * 100) / 100}px`;
}

function editingShieldRects(box: ActiveDeckSelectionBox, frameWidth: number, frameHeight: number): CSSProperties[] {
  const left = clampRectValue(box.left, frameWidth);
  const top = clampRectValue(box.top, frameHeight);
  const right = clampRectValue(box.left + box.width, frameWidth);
  const bottom = clampRectValue(box.top + box.height, frameHeight);
  return [
    { left: 0, top: 0, width: frameWidth, height: top },
    { left: 0, top, width: left, height: Math.max(0, bottom - top) },
    { left: right, top, width: Math.max(0, frameWidth - right), height: Math.max(0, bottom - top) },
    { left: 0, top: bottom, width: frameWidth, height: Math.max(0, frameHeight - bottom) },
  ].filter((rect) => rect.width > 0 && rect.height > 0);
}

function clampRectValue(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

function readDeckToolbarState(object: DeckObjectElement): DeckToolbarState {
  return selectedDeckObjectToolbarState;
}

function readActualDeckToolbarState(object: DeckObjectElement, textTarget: DeckObjectElement = textTargetForObject(object)): DeckToolbarState {
  const textComputed = textTarget.ownerDocument.defaultView?.getComputedStyle(textTarget);
  const objectComputed = object.ownerDocument.defaultView?.getComputedStyle(object);
  const fontWeight = textComputed?.fontWeight ?? "400";
  const decoration = textComputed?.textDecorationLine ?? "";
  const fontSize = textComputed?.fontSize || defaultDeckToolbarState.fontSize;
  return {
    block: blockForDeckObject(object, fontSize, textTarget),
    fontFamily: normalizeFontFamily(textComputed?.fontFamily || defaultDeckToolbarState.fontFamily),
    fontSize: fontSizeNumber(fontSize),
    bold: fontWeight === "bold" || Number.parseInt(fontWeight, 10) >= 600,
    italic: textComputed?.fontStyle === "italic",
    underline: decoration.includes("underline"),
    strikethrough: decoration.includes("line-through"),
    textColor: rgbToHex(textComputed?.color) || defaultDeckToolbarState.textColor,
    fillColor:
      rgbToHex(objectComputed?.backgroundColor) ||
      rgbToHex(isSvgElement(object) ? object.getAttribute("fill") ?? "" : "") ||
      defaultDeckToolbarState.fillColor,
    align: normalizeTextAlign(textComputed?.textAlign),
  };
}

function ensureSlideEditorStyles(doc: Document) {
  const styleId = "ai-slide-editor-selection-style";
  if (!doc.head || doc.getElementById(styleId)) return;
  const style = doc.createElement("style");
  style.id = styleId;
  style.setAttribute("data-ai-slide-editor", "true");
  style.textContent = `
    [data-object="true"] {
      cursor: default;
    }
    [contenteditable="true"],
    [contenteditable="true"]:focus {
      outline: none !important;
      box-shadow: none !important;
    }
    ::selection {
      background: rgba(148, 163, 184, 0.35);
    }
  `;
  doc.head.append(style);
}

function prepareSlideEditorDocument(doc: Document) {
  ensureSlideEditorStyles(doc);
  doc.querySelectorAll<DeckObjectElement>('[data-object="true"]').forEach((object, index) => {
    if (!object.getAttribute("data-ai-slide-object-id")) object.setAttribute("data-ai-slide-object-id", `object-${index + 1}`);
    if (isHtmlElement(object)) object.tabIndex = 0;
  });
}

function applySlideHtmlSnapshot(doc: Document, html: string) {
  const snapshot = new DOMParser().parseFromString(html, "text/html");
  doc.documentElement.replaceWith(doc.importNode(snapshot.documentElement, true));
}

function serializeSlideDocument(doc: Document) {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-ai-slide-editor-attached");
  clone.querySelectorAll("[data-ai-slide-editor]").forEach((element) => element.remove());
  clone.querySelectorAll<HTMLElement>("[data-ai-slide-object-id]").forEach((element) => {
    element.removeAttribute("data-ai-slide-object-id");
  });
  clone.querySelectorAll<HTMLElement>("[data-ai-slide-text-edit-id]").forEach((element) => {
    element.removeAttribute("data-ai-slide-text-edit-id");
  });
  clone.querySelectorAll<HTMLElement>("[data-ai-slide-selected]").forEach((element) => {
    element.removeAttribute("data-ai-slide-selected");
  });
  clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach((element) => {
    element.removeAttribute("contenteditable");
    element.removeAttribute("spellcheck");
  });
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : "<!DOCTYPE html>";
  return `${doctype}\n${clone.outerHTML}`;
}

function normalizeCssSize(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return defaultDeckToolbarState.fontSize;
  return /^\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

function fontSizeNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed * 10) / 10).replace(/\.0$/, "") : defaultDeckToolbarState.fontSize;
}

function offsetPx(value: string, delta: number) {
  const numeric = Number.parseFloat(value || "0");
  return `${(Number.isFinite(numeric) ? numeric : 0) + delta}px`;
}

function normalizeTextAlign(value: string | undefined): DeckToolbarState["align"] {
  if (value === "left" || value === "center" || value === "right") return value;
  return "";
}

function normalizeFontFamily(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("ibm plex sans")) return "'IBM Plex Sans', sans-serif";
  if (normalized.includes("ibm plex mono")) return "'IBM Plex Mono', monospace";
  if (value.includes("JetBrains Mono")) return "'JetBrains Mono', monospace";
  if (normalized.includes("stix two text")) return "'STIX Two Text', serif";
  if (normalized.includes("times new roman")) return "'Times New Roman', serif";
  if (value.includes("Georgia")) return "Georgia, serif";
  if (value.includes("Arial")) return "Arial, sans-serif";
  return "Inter, sans-serif";
}

function fontFamilyLabel(value: string) {
  return value
    .split(",")[0]
    .replaceAll("\"", "")
    .replaceAll("'", "")
    .trim() || "Font";
}

function blockForDeckObject(object: DeckObjectElement, fontSize: string, textTarget: DeckObjectElement = textTargetForObject(object)): DeckToolbarState["block"] {
  const objectType = object.getAttribute("data-object-type");
  if (objectType === "shape") return "shape";
  if (objectType === "image") return "image";
  const size = Number.parseFloat(fontSize);
  const tag = textTarget.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag) || (Number.isFinite(size) && size >= 32)) return "heading";
  return "normal";
}

function rgbToHex(value: string | undefined) {
  if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return "";
  if (value.startsWith("#")) return value;
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return "";
  return [match[1], match[2], match[3]]
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("")
    .replace(/^/, "#");
}

function EditorInfoPanel(props: { detail?: string; title: string }) {
  return (
    <div className="m-auto w-[min(720px,calc(100%_-_56px))] rounded-xl border border-white/10 bg-[#303030] p-7 shadow-[0_22px_80px_rgba(0,0,0,0.34)]">
      <h1 className="m-0 text-left text-[36px] font-extrabold leading-[1.18] text-white">{props.title}</h1>
      {props.detail ? <p className="text-white/58 leading-relaxed">{props.detail}</p> : null}
    </div>
  );
}

function projectAssetUrl(projectId: string, fileRef: string, filePath: string, revision?: number) {
  const path = `/local-assets/projects/${encodeURIComponent(projectId)}/${[fileRef, ...filePath.split("/")].map(encodeURIComponent).join("/")}`;
  return revision ? `${path}?v=${encodeURIComponent(String(revision))}` : path;
}

function artifactTypeForOutput(outputType: OutputType): SlideArtifactType {
  return outputType === "pptx" ? "pptx" : "deck";
}

function slideExportItems(projectId: string, artifactType: SlideArtifactType) {
  if (artifactType === "pptx") {
    return [
      {
        label: "PPTX",
        onSelect: () => window.open(`/api/projects/${encodeURIComponent(projectId)}/files/slides.pptx`, "_blank"),
      },
      { label: "PDF", disabled: true, onSelect: () => undefined },
    ];
  }
  return [
    { label: "HTML deck", disabled: true, onSelect: () => undefined },
    { label: "PPTX", disabled: true, onSelect: () => undefined },
    { label: "PDF", disabled: true, onSelect: () => undefined },
  ];
}

function RecentEmptyState() {
  return (
    <div className="mt-[18px] grid min-h-[220px] place-items-center gap-2 rounded-xl border border-white/8 bg-[#2b2b2b] p-7 text-center">
      <Clock3 size={22} />
      <strong className="text-[14px] font-extrabold">No history yet</strong>
      <span className="max-w-[420px] text-[13px] leading-relaxed text-white/48">Create a presentation or open a template to see it here.</span>
    </div>
  );
}

function humanizeCategory(value: string) {
  if (value === "All") return value;
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
