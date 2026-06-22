import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, FileCode2, FileText, Hash, History, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import type { DocumentProject, DocumentType, LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import {
  allTemplatesLabel,
  type TuttiTemplate,
} from "../templates/tuttiTemplates";
import { historyActionsClass, historyCardClass, historyClearButtonClass, historyDeleteButtonClass, historyEmptyIconClass, historyEmptyStateClass } from "@ai-app/ui/app-shell";
import { HomeComposer } from "./HomeComposer";
import { useI18n } from "../i18n";
import type { HomeAttachment } from "./useHomeAttachments";

export function HomePage(props: {
  activePanel: "templates" | "history";
  attachments: HomeAttachment[];
  categories: string[];
  historyProjects: DocumentProject[];
  localAgentProviders: LocalAgentProviderStatus[];
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  outputType: DocumentType;
  selectedCategory: string;
  selectedRuntimeProfileId: string;
  runtimeProfiles: RuntimeProfile[];
  templateCounts: Record<string, number>;
  templates: TuttiTemplate[];
  error: string;
  loading: boolean;
  prompt: string;
  onActivePanelChange: (panel: "templates" | "history") => void;
  onAddFiles: (files: File[]) => void;
  onCategoryChange: (category: string) => void;
  onClearHistory: () => void;
  onCreateBlank: () => void;
  onCreateFromPrompt: () => void;
  onDeleteHistoryProject: (projectId: string) => void;
  onOpenHistoryProject: (project: DocumentProject) => void;
  onImportFile: (file: File) => void;
  onInstallOfficeCli: () => void;
  onOutputTypeChange: (type: DocumentType) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRuntimeProfileChange: (profileId: string) => void;
  onSelectTemplate: (template: TuttiTemplate) => void;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const { t } = useI18n();

  return (
    <div className="relative h-full overflow-auto bg-[linear-gradient(90deg,rgba(42,38,32,0.045)_1px,transparent_1px),linear-gradient(180deg,rgba(42,38,32,0.04)_1px,transparent_1px)] bg-[size:28px_28px]">
      <input
        ref={importInputRef}
        className="hidden"
        type="file"
        accept=".html,.htm,.md,.markdown,.docx,text/html,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onImportFile(file);
        }}
      />
      <button
        className="absolute right-7 top-7 z-20 flex h-9 items-center gap-2 rounded-full bg-[#F4EFE6] px-4 text-[12px] font-medium text-[#2A2620] shadow-[0_12px_10px_rgba(0,0,0,0.08)] transition hover:text-[#5C6B50] disabled:opacity-50"
        type="button"
        disabled={props.loading}
        onClick={() => importInputRef.current?.click()}
        title={t("home.importTitle")}
      >
        <Upload size={14} />
        {t("home.import")}
      </button>

      <div className="mx-auto flex w-full max-w-[1220px] flex-col px-7 pb-16 pt-14">
        <section className="mx-auto flex w-full max-w-[820px] flex-col items-center">
          <div className="mb-5 grid size-10 place-items-center rounded-full border border-[#B8A07C]/70 bg-[#F4EFE6]/82 text-[#5C6B50] shadow-[0_12px_10px_rgba(0,0,0,0.08)] backdrop-blur">
            <Sparkles size={18} />
          </div>
          <h1 className="w-[calc(100vw-56px)] max-w-[1180px] whitespace-nowrap text-center text-[20px] font-semibold leading-6 text-[#2A2620] sm:text-[36px] sm:leading-10 md:text-[48px] md:leading-[52px] lg:text-[62px] lg:leading-[66px] xl:text-[68px] xl:leading-[72px]">
            {t("home.heading")}
          </h1>

          <HomeComposer
            attachments={props.attachments}
            error={props.error}
            loading={props.loading}
            localAgentProviders={props.localAgentProviders}
            officeCliInstalling={props.officeCliInstalling}
            officeCliStatus={props.officeCliStatus}
            outputType={props.outputType}
            prompt={props.prompt}
            runtimeProfiles={props.runtimeProfiles}
            selectedRuntimeProfileId={props.selectedRuntimeProfileId}
            onAddFiles={props.onAddFiles}
            onCreateFromPrompt={props.onCreateFromPrompt}
            onInstallOfficeCli={props.onInstallOfficeCli}
            onOutputTypeChange={props.onOutputTypeChange}
            onPromptChange={props.onPromptChange}
            onRemoveAttachment={props.onRemoveAttachment}
            onRuntimeProfileChange={props.onRuntimeProfileChange}
          />
        </section>

        <section className="mt-10">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <HomePanelButton active={props.activePanel === "templates"} kind="templates" onClick={() => props.onActivePanelChange("templates")} />
                  <HomePanelButton active={props.activePanel === "history"} kind="history" onClick={() => props.onActivePanelChange("history")} />
                </div>
                <div className="text-[12px] font-medium text-[#8B8275]">
                  {props.activePanel === "templates"
                    ? props.selectedCategory === allTemplatesLabel
                      ? t("home.templateCount", { count: props.templateCounts[allTemplatesLabel] ?? 0 })
                      : t("home.templateCount", { count: props.templateCounts[props.selectedCategory] ?? 0 })
                    : t("home.projectCount", { count: props.historyProjects.length })}
                </div>
              </div>
            </div>
            {props.activePanel === "templates" ? (
              <div className="flex min-w-0 gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {props.categories.map((item) => {
                  const active = item === props.selectedCategory;
                  const count = props.templateCounts[item] ?? 0;
                  return (
                    <button
                      key={item}
                      className={`h-8 shrink-0 rounded-full px-4 text-[12px] font-medium transition ${
                        active ? "bg-[#5C6B50] text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)]" : "border border-[#B8A07C]/55 bg-[#F4EFE6]/50 text-[#2A2620]/72 hover:border-[#5C6B50]/50 hover:text-[#5C6B50]"
                      }`}
                      type="button"
                      onClick={() => props.onCategoryChange(item)}
                    >
                      {item}
                      <span className={active ? "ml-2 text-[#F4EFE6]/58" : "ml-2 text-[#8B8275]"}>{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {props.activePanel === "templates" ? (
            <TemplateMasonry
              showBlank={props.selectedCategory === allTemplatesLabel}
              templates={props.templates}
              onCreateBlank={props.onCreateBlank}
              onSelectTemplate={props.onSelectTemplate}
            />
          ) : (
            <ProjectHistory
              loading={props.loading}
              projects={props.historyProjects}
              onClearHistory={props.onClearHistory}
              onDeleteProject={props.onDeleteHistoryProject}
              onOpenProject={props.onOpenHistoryProject}
            />
          )}
        </section>
      </div>
    </div>
  );
}

type MasonryItem =
  | { kind: "blank" }
  | { kind: "template"; template: TuttiTemplate };

const templateMasonryGapPx = 20;
const templateMasonryMinColumnWidthPx = 190;
const templateMasonryMaxColumns = 5;

function TemplateMasonry(props: {
  showBlank: boolean;
  templates: TuttiTemplate[];
  onCreateBlank: () => void;
  onSelectTemplate: (template: TuttiTemplate) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const items = useMemo<MasonryItem[]>(
    () => [
      ...(props.showBlank ? [{ kind: "blank" } as const] : []),
      ...props.templates.map((template) => ({ kind: "template" as const, template })),
    ],
    [props.showBlank, props.templates],
  );
  const measuredWidth = containerWidth || 1180;
  const columnCount = Math.max(
    1,
    Math.min(
      templateMasonryMaxColumns,
      items.length || 1,
      Math.floor((measuredWidth + templateMasonryGapPx) / (templateMasonryMinColumnWidthPx + templateMasonryGapPx)) || 1,
    ),
  );
  const columnWidth = (measuredWidth - templateMasonryGapPx * (columnCount - 1)) / columnCount;
  const columns = useMemo(
    () => distributeMasonryItems(items, columnCount, columnWidth),
    [columnCount, columnWidth, items],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width ?? 0;
      setContainerWidth((current) => Math.abs(current - nextWidth) > 1 ? nextWidth : current);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="mt-5 flex items-start gap-5">
      {columns.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col gap-7">
          {column.map((item) => item.kind === "blank"
            ? <BlankTemplateCard key="blank" onCreate={props.onCreateBlank} />
            : <TemplateCard key={item.template.id} template={item.template} onSelect={props.onSelectTemplate} />,
          )}
        </div>
      ))}
    </div>
  );
}

function distributeMasonryItems(items: MasonryItem[], columnCount: number, columnWidth: number) {
  const columns: MasonryItem[][] = Array.from({ length: columnCount }, () => []);
  const heights = Array.from({ length: columnCount }, () => 0);
  for (const item of items) {
    const columnIndex = shortestColumnIndex(heights);
    columns[columnIndex]!.push(item);
    heights[columnIndex] += estimatedTemplateCardHeight(item, columnWidth) + 28;
  }
  return columns;
}

function shortestColumnIndex(heights: number[]) {
  return heights.reduce((bestIndex, height, index) => height < heights[bestIndex]! ? index : bestIndex, 0);
}

function estimatedTemplateCardHeight(item: MasonryItem, columnWidth: number) {
  if (item.kind === "blank") return columnWidth / 0.72 + 36;
  const width = item.template.screenshot_width;
  const height = item.template.screenshot_height;
  const aspectRatio = width && height ? width / height : 0.72;
  return columnWidth / aspectRatio + 42;
}

function BlankTemplateCard(props: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <div className="group w-full min-w-0">
      <button
        className="flex aspect-[0.72] w-full min-h-[212px] flex-col items-center justify-center rounded-[20px] border border-[#B8A07C]/60 bg-[#F4EFE6]/70 text-[#5C6B50] shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[#5C6B50]/60"
        type="button"
        onClick={props.onCreate}
      >
        <Plus className="mb-4 opacity-60" size={26} />
      </button>
      <div className="mt-2 truncate px-1 text-[12px] font-medium text-[#2A2620]">{t("home.blankDoc")}</div>
    </div>
  );
}

function HomePanelButton(props: { active: boolean; kind: "templates" | "history"; onClick: () => void }) {
  const { t } = useI18n();
  const Icon = props.kind === "templates" ? FileText : History;
  return (
    <button
      className={`flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition ${
        props.active ? "bg-[#2A2620] text-[#F4EFE6]" : "border border-[#B8A07C]/55 bg-[#F4EFE6]/44 text-[#2A2620]/68 hover:text-[#5C6B50]"
      }`}
      type="button"
      onClick={props.onClick}
    >
      <Icon size={15} />
      {props.kind === "templates" ? t("home.templates") : t("home.history")}
    </button>
  );
}

function ProjectHistory(props: {
  loading: boolean;
  projects: DocumentProject[];
  onClearHistory: () => void;
  onDeleteProject: (projectId: string) => void;
  onOpenProject: (project: DocumentProject) => void;
}) {
  if (props.projects.length === 0) {
    return (
      <div className="mt-5">
        <HistoryPanelActions loading={props.loading} projectCount={props.projects.length} onClearHistory={props.onClearHistory} />
        <div className={`mt-3 px-6 ${historyEmptyStateClass}`}>
          <div>
            <div className={`mx-auto mb-3 ${historyEmptyIconClass}`}>
              <History size={17} />
            </div>
            <div className="text-[13px] font-medium text-[#2A2620]">No history yet</div>
            <div className="mt-1 text-[12px] text-[#8B8275]">Create a doc or open a template to see it here.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <HistoryPanelActions loading={props.loading} projectCount={props.projects.length} onClearHistory={props.onClearHistory} />
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {props.projects.map((project) => (
          <ProjectHistoryCard key={project.id} project={project} onDelete={props.onDeleteProject} onOpen={props.onOpenProject} />
        ))}
      </div>
    </div>
  );
}

function HistoryPanelActions(props: { loading: boolean; projectCount: number; onClearHistory: () => void }) {
  return (
    <div className={historyActionsClass}>
      <button
        className={historyClearButtonClass}
        type="button"
        disabled={props.loading || props.projectCount === 0}
        onClick={props.onClearHistory}
        title="Clear history"
      >
        <Trash2 size={13} />
        Clear history
      </button>
    </div>
  );
}

function ProjectHistoryCard(props: { project: DocumentProject; onDelete: (projectId: string) => void; onOpen: (project: DocumentProject) => void }) {
  return (
    <div className={`group ${historyCardClass()}`}>
      <button
        aria-label={`Open ${props.project.title}`}
        className="block h-full min-h-[132px] w-full rounded-[20px] p-4 text-left"
        type="button"
        onClick={() => props.onOpen(props.project)}
      >
        <div className="pr-14">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-[#2A2620]">{props.project.title}</div>
            <div className="mt-1 truncate text-[11px] text-[#8B8275]">{props.project.templateName ?? "Blank doc"}</div>
          </div>
        </div>
        <p className="mt-4 line-clamp-2 text-[12px] leading-5 text-[#2A2620]/62">{projectPreview(props.project.content)}</p>
        <div className="mt-4 flex items-center gap-1.5 pr-9 text-[11px] text-[#8B8275]">
          <Clock3 size={12} />
          {formatProjectDate(props.project.updatedAt)}
        </div>
      </button>
      <div className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
        <ProjectTypeIcon type={props.project.type} />
      </div>
      <button
        aria-label={`Delete ${props.project.title}`}
        className={historyDeleteButtonClass}
        type="button"
        title="Delete project"
        onClick={() => props.onDelete(props.project.id)}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function ProjectTypeIcon(props: { type: DocumentProject["type"] }) {
  if (props.type === "markdown") return <Hash size={15} />;
  if (props.type === "docx") return <FileText size={15} />;
  return <FileCode2 size={15} />;
}

function TemplateCard(props: { template: TuttiTemplate; onSelect: (template: TuttiTemplate) => void }) {
  const aspectRatio =
    props.template.screenshot_width && props.template.screenshot_height
      ? `${props.template.screenshot_width} / ${props.template.screenshot_height}`
      : "0.72";
  return (
    <div className="group w-full min-w-0">
      <button
        className="relative w-full overflow-hidden rounded-[20px] bg-[#F4EFE6] text-left text-[#2A2620] shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)] ring-1 ring-[#B8A07C]/45 transition hover:-translate-y-0.5 hover:shadow-[0_12px_10px_rgba(0,0,0,0.08)]"
        type="button"
        aria-label={`Create ${props.template.name}`}
        onClick={() => props.onSelect(props.template)}
        style={{ aspectRatio, minHeight: 212 }}
      >
        {props.template.screenshot_cdn_url ? (
          <img
            className="h-full w-full object-cover object-top"
            src={props.template.screenshot_cdn_url}
            alt=""
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="grid h-full place-items-center bg-[#F4EFE6] px-4 text-center text-[12px] font-medium text-[#8B8275]">
            {props.template.name}
          </div>
        )}
      </button>
      <div className="mt-2 min-w-0 px-1">
        <div className="truncate text-[12px] font-medium text-[#2A2620]">{props.template.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-[#8B8275]">{props.template.classification}</div>
      </div>
    </div>
  );
}

function projectPreview(html: string) {
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || "Empty doc";
}

function formatProjectDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
