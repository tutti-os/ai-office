import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, FileCode2, FileText, Hash, History, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import type { DocumentProject, DocumentType, LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import {
  allTemplatesLabel,
  type TuttiTemplate,
} from "../templates/tuttiTemplates";
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
    <div className="relative h-full overflow-auto">
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
        className="absolute right-7 top-7 z-20 flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white px-3 text-[12px] font-semibold text-black hover:bg-white/90 disabled:opacity-50"
        type="button"
        disabled={props.loading}
        onClick={() => importInputRef.current?.click()}
        title={t("home.importTitle")}
      >
        <Upload size={14} />
        {t("home.import")}
      </button>

      <div className="mx-auto flex w-full max-w-[1180px] flex-col px-7 pb-12 pt-14">
        <section className="mx-auto flex w-full max-w-[820px] flex-col items-center">
          <div className="mb-5 grid size-10 place-items-center rounded-full bg-black text-white dark:bg-white dark:text-black">
            <Sparkles size={18} />
          </div>
          <h1 className="text-center text-[36px] font-bold leading-tight text-[#171717] dark:text-white">
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

        <section className="mt-9">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <HomePanelButton active={props.activePanel === "templates"} kind="templates" onClick={() => props.onActivePanelChange("templates")} />
                  <HomePanelButton active={props.activePanel === "history"} kind="history" onClick={() => props.onActivePanelChange("history")} />
                </div>
                <div className="text-[12px] text-black/50 dark:text-white/44">
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
                      className={`h-8 shrink-0 rounded-full px-4 text-[12px] font-semibold ${
                        active ? "bg-white text-black" : "bg-[#303030] text-white/78 hover:bg-[#383838]"
                      }`}
                      type="button"
                      onClick={() => props.onCategoryChange(item)}
                    >
                      {item}
                      <span className={active ? "ml-2 text-black/46" : "ml-2 text-white/36"}>{count}</span>
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
        className="flex aspect-[0.72] w-full min-h-[212px] flex-col items-center justify-center rounded-lg border border-white/10 bg-[#303030] text-white/42 shadow-[0_14px_34px_rgba(0,0,0,0.24)] transition hover:bg-[#373737]"
        type="button"
        onClick={props.onCreate}
      >
        <Plus className="mb-4 opacity-60" size={26} />
      </button>
      <div className="mt-2 truncate px-1 text-[12px] font-semibold text-white/72">{t("home.blankDoc")}</div>
    </div>
  );
}

function HomePanelButton(props: { active: boolean; kind: "templates" | "history"; onClick: () => void }) {
  const { t } = useI18n();
  const Icon = props.kind === "templates" ? FileText : History;
  return (
    <button
      className={`flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold ${
        props.active ? "bg-white text-black" : "bg-[#303030] text-white/72 hover:bg-[#383838]"
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
        <div className="mt-3 grid min-h-[220px] place-items-center rounded-xl border border-white/8 bg-[#2b2b2b] px-6 text-center">
          <div>
            <div className="mx-auto mb-3 grid size-9 place-items-center rounded-full bg-white/8 text-white/58">
              <History size={17} />
            </div>
            <div className="text-[13px] font-semibold text-white/72">No history yet</div>
            <div className="mt-1 text-[12px] text-white/42">Create a doc or open a template to see it here.</div>
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
    <div className="flex items-center justify-start">
      <button
        className="flex h-8 items-center gap-2 rounded-full border border-white/10 bg-[#303030] px-3 text-[12px] font-semibold text-white/58 hover:bg-[#383838] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
    <div className="group relative min-h-[132px] rounded-lg border border-white/8 bg-[#303030] shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:bg-[#373737]">
      <button
        aria-label={`Open ${props.project.title}`}
        className="block h-full min-h-[132px] w-full rounded-lg p-4 text-left"
        type="button"
        onClick={() => props.onOpen(props.project)}
      >
        <div className="pr-14">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white">{props.project.title}</div>
            <div className="mt-1 truncate text-[11px] text-white/38">{props.project.templateName ?? "Blank doc"}</div>
          </div>
        </div>
        <p className="mt-4 line-clamp-2 text-[12px] leading-5 text-white/48">{projectPreview(props.project.content)}</p>
        <div className="mt-4 flex items-center gap-1.5 pr-9 text-[11px] text-white/34">
          <Clock3 size={12} />
          {formatProjectDate(props.project.updatedAt)}
        </div>
      </button>
      <div className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/8 text-white/62">
        <ProjectTypeIcon type={props.project.type} />
      </div>
      <button
        aria-label={`Delete ${props.project.title}`}
        className="absolute bottom-3 right-3 grid size-7 place-items-center rounded-lg border border-white/10 bg-black/36 text-white/56 opacity-0 transition hover:border-[#ff8f85]/40 hover:bg-[#4a211f] hover:text-[#ffb4aa] focus-visible:opacity-100 group-hover:opacity-100"
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
        className="relative w-full overflow-hidden rounded-lg bg-white text-left text-[#1f2933] shadow-[0_14px_36px_rgba(0,0,0,0.38)] ring-1 ring-white/8 transition hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(0,0,0,0.48)]"
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
          <div className="grid h-full place-items-center bg-[#f3f0ea] px-4 text-center text-[12px] font-semibold text-black/44">
            {props.template.name}
          </div>
        )}
      </button>
      <div className="mt-2 min-w-0 px-1">
        <div className="truncate text-[12px] font-semibold text-white/78">{props.template.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/38">{props.template.classification}</div>
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
